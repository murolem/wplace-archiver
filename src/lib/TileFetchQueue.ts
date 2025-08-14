import { getTileLogPrefix } from '$lib/logging';
import { getExpDelayCalculator, tryGetResponseBodyAsText } from '$lib/network';
import { stringifyErr } from '$lib/result';
import { stringify } from '$lib/stringify';
import { Logger } from '$logger';
import { mapDimensionsInTilesStrLength } from '$src/constants';
import type { Position, TileImage } from '$src/types';
import { roundToDigit } from '$utils/roundToDigit';
import { wait } from '$utils/wait';
import chalk from 'chalk';
import { err, ok, type Err, type Ok, type Result, type ResultAsync } from 'neverthrow';
import PQueue from 'p-queue';

/** Formatting option for percentage progress for logging. */
const progressPercentageDigitsAfterComma = 3;

type EnqueueTaskResult = Result<
    TileImage,
    { type: 'retryable', retryDelayMsOverride?: number }
    | { type: 'unrecoverable' }
>

type EnqueueSingleFnInternal = (
    tilePos: Position,
    writeError: (attemptIndex: number, data: string) => void,
    progress?: number
) => Promise<Result<TileImage, null>>;

export type EnqueueSingleFn = (
    tilePos: Position,
    writeError: (attemptIndex: number, data: string) => void
) => Promise<Result<TileImage, null>>;

export type EnqueueManyFn = (
    tilePosGenerator: () => Generator<Position>,
    writeError: (tilePos: Position, attemptIndex: number, data: string) => void,
    cbTile: (tilePos: Position, result: Result<TileImage, null>) => Promise<void>,
    /** Get current progress, from 0 to 1. */
    getProgress?:
        /**
        * @param tasksCompleted Tasks completed for the current cycle.
        */
        (tasksCompleted: number) => number,
) => Promise<void>;

export class TileFetchQueue {
    private _queue: PQueue;
    private _targetQueueSize: number;
    private _getRetryDelay: ReturnType<typeof getExpDelayCalculator>;
    private _timeoutMs: number;

    constructor(args: {
        requestsPerSecond: number,
        requestConcurrency: number,
        targetQueueSize?: number
    }) {
        args.targetQueueSize ??= 5;

        this._queue = new PQueue({ concurrency: args.requestConcurrency, interval: 1000 /** do not change */, intervalCap: args.requestsPerSecond });
        this._targetQueueSize = args.targetQueueSize;

        const maxRetryDelayMs = 2 * 60 * 1000; // 2 minutes
        this._getRetryDelay = getExpDelayCalculator({
            factor: 2,
            maxDelayMs: maxRetryDelayMs,
            startingDelayMs: 100
        });
        this._timeoutMs = maxRetryDelayMs + 5 * 1000; // +just an arbitrary small amount to not interrupt retries on max delay 
    }

    /**
     * Enqueues download of many tiles using a generator function to get positions of each.
     */
    async enqueue(...args: Parameters<EnqueueSingleFn>): ReturnType<EnqueueSingleFn>;

    /**
     * Enqueues tile download.
    */
    async enqueue(...args: Parameters<EnqueueManyFn>): ReturnType<EnqueueManyFn>;

    async enqueue(...args: Parameters<EnqueueSingleFn> | Parameters<EnqueueManyFn>): Promise<Awaited<ReturnType<EnqueueSingleFn> | ReturnType<EnqueueManyFn>>> {
        if (typeof args[0] === 'function') {
            const [tilePosGenerator, writeError, cbTile, getProgress] = args as Parameters<EnqueueManyFn>;

            /** 
             * this queue holds promises for each enqueue, specifically for the callbacks, since our queue managed tile downloads tasks
             * and not anything beyond, so we have to manage it here.
             */
            const cbPromiseQueue = new Set();
            let tasksCompleted = 0;
            for (const tilePos of tilePosGenerator()) {
                await this._queue.onSizeLessThan(this._targetQueueSize);

                const removeCbPromiseFromCbQueue = () => void cbPromiseQueue.delete(resultAndCbPromise);
                const resultAndCbPromise = this._enqueueSingle(
                    tilePos,
                    (attemptIndex, data) => writeError(tilePos, attemptIndex, data),
                    getProgress ? getProgress(tasksCompleted) : undefined
                )
                    .then(async (res) => await cbTile?.(tilePos, res))
                    .then(() => {
                        tasksCompleted++;
                        removeCbPromiseFromCbQueue();
                    })

                cbPromiseQueue.add(resultAndCbPromise);
            }

            await Promise.all([
                this._queue.onIdle(),
                ...cbPromiseQueue
            ])
        } else {
            return this._enqueueSingle(...args as Parameters<EnqueueSingleFn>);
        }
    }

    private async _enqueueSingle(...args: Parameters<EnqueueSingleFnInternal>): ReturnType<EnqueueSingleFnInternal> {
        const [tilePos, writeErrorGeneral, progress01] = args;

        let attemptIndex: number = -1;

        const col = tilePos.x;
        const row = tilePos.y;

        const url = `https://backend.wplace.live/files/s0/tiles/${col}/${row}.png`;

        const task: () => Promise<EnqueueTaskResult> = async () => {
            attemptIndex++;

            const logger = new Logger(getTileLogPrefix(tilePos, { progress: progress01 }));
            const { logInfo, logError, logWarn } = logger;

            const writeError = (data: string) => writeErrorGeneral(attemptIndex, data);

            const ts = Date.now();
            const retryDelayMs = this._getRetryDelay(attemptIndex);

            logInfo(chalk.gray(`fetching: ` + url));
            const abortCtrl = new AbortController();
            setTimeout(() => abortCtrl.abort("timeout"), this._timeoutMs);
            const responseRes = await fetch(url, {
                "headers": {
                    "Accept": "image/webp,*/*",
                    "Accept-Language": "en-US,en;q=0.5",
                },
                signal: abortCtrl.signal
            })
                .then(res => ok(res))
                .catch(error => {
                    return err({ type: 'fetch-failed', url, error });
                });

            if (responseRes.isErr()) {
                logError(`error while fetching; retrying in ${retryDelayMs}ms`);
                writeError(stringifyErr(responseRes));
                return err({ type: 'retryable' });
            }

            const res = responseRes.value;
            if (!res.ok) {
                const resStatusStr = res.status.toString();
                if (res.status === 404) {
                    logInfo(chalk.gray(`tile doesn't exist, skipping`));
                    return err({ type: 'unrecoverable' });
                } else if (res.status === 429) {
                    writeError(
                        stringify({ url, status: res.status, statusText: res.statusText })
                    );

                    const retryAfterHeader = res.headers.get('Retry-After');
                    if (retryAfterHeader === null) {
                        logError(`too many requests. maybe decrease the RPS? retrying in ${retryDelayMs}ms`);
                        return err({ type: 'retryable' });
                    } else {
                        const pauseDurationMs = parseInt(retryAfterHeader) * 1000;
                        logWarn(`too many requests; pausing for ${pauseDurationMs}ms (set by Retry-After header) before retrying. consider decreasing RPS.`);
                        await this._tryPauseQueueForMs(pauseDurationMs);
                        return err({ type: 'retryable', retryDelayMsOverride: 0 });
                    }
                } else if (resStatusStr.startsWith('4')) {
                    logError("client error. cancelling download for this tile.");
                    writeError(
                        stringify({ type: "client error", url, status: res.status, statusText: res.statusText, body: await tryGetResponseBodyAsText(res) })
                    );
                    return err({ type: 'unrecoverable' });
                } else {
                    // 5XX
                    logError(`server error. retrying in ${retryDelayMs}ms (+time to save the error)`);
                    writeError(
                        stringify({ type: "server error", url, status: res.status, statusText: res.statusText, body: await tryGetResponseBodyAsText(res) })
                    );
                    return err({ type: 'retryable' });
                }
            }

            const tileImageRes = await res.arrayBuffer()
                .then(res => ok(res))
                .catch(error => err({ url, error }));

            if (tileImageRes.isErr()) {
                logError(`error while trying to extract tile image. retrying in ${retryDelayMs}ms`);
                writeError(stringifyErr(tileImageRes));
                return err({ type: 'retryable' });
            }

            logInfo("✅");
            return tileImageRes;
        }

        while (true) {
            // @ts-ignore probably safe to ignore the void type (?); check below in case that happens at runtime.
            const res = await this._queue.add(task) as Awaited<ReturnType<typeof task>>;
            if (!res)
                throw new Error("unexpected 'undefined' as a return value from a tile fetch task");

            if (res.isOk())
                return ok(res.value);

            if (res.error.type === 'unrecoverable')
                return err(null);
            else if (res.error.type === 'retryable')
                await wait(res.error.retryDelayMsOverride ?? this._getRetryDelay(attemptIndex));
            else
                throw new Error('not impl');
        }
    }

    private async _tryPauseQueueForMs(durationMs: number): Promise<void> {
        if (this._queue.isPaused)
            return;

        this._queue.pause();
        await wait(durationMs);
        this._queue.start();
    }
}