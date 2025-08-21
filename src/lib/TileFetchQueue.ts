import { getTileLogPrefix } from '$lib/logging';
import { getExpDelayCalculator, isRetryableResponse, tryGetResponseBodyAsText } from '$lib/network';
import { stringifyErr } from '$lib/result';
import { stringify } from '$lib/stringify';
import { Logger } from '$utils/logger';
import { maxRetryAfterMs } from '$src/constants';
import type { TileImage } from '$src/types';
import { wait } from '$utils/wait';
import chalk from 'chalk';
import { err, ok, type Result } from 'neverthrow';
import PQueue from 'p-queue';
import humanizeDuration from 'humanize-duration';
import type { TilePosition } from '$lib/TilePosition';
import type { FnWriteError } from '$lib/Cycler';

type EnqueueTaskResult = Result<
    TileImage,
    { type: 'retryable', retryDelayMsOverride?: number }
    | { type: 'unrecoverable' }
>

type EnqueueSingleFnInternal = (
    tilePos: TilePosition,
    writeError: FnWriteError,
    progress?: number
) => Promise<Result<TileImage, null>>;

export type EnqueueSingleFn = (
    tilePos: TilePosition,
    writeError: FnWriteError
) => Promise<Result<TileImage, null>>;

export type EnqueueManyFn = (
    tilePosGenerator: () => Generator<TilePosition>,
    writeError: FnWriteError,
    cbTile: (tilePos: TilePosition, result: Result<TileImage, null>) => Promise<void>,
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


        const maxRetryDelayMs = 4 * 1000;
        this._getRetryDelay = getExpDelayCalculator({
            factor: 2,
            maxDelayMs: maxRetryDelayMs,
            startingDelayMs: 100
        });

        this._timeoutMs = maxRetryDelayMs + 2 * 1000;
    }

    get isPaused(): boolean {
        return this._queue.isPaused;
    }

    pause() {
        this._queue.pause();
    }

    start() {
        this._queue.start();
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
                    writeError,
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

            const writeError = (error: string) => writeErrorGeneral(tilePos, attemptIndex, error);

            const ts = Date.now();
            const retryDelayMs = this._getRetryDelay(attemptIndex);

            logInfo(chalk.gray(`fetching: ` + url));
            const abortCtrl = new AbortController();
            const abortHandle = setTimeout(() => {
                abortCtrl.abort("timeout");
                logError("request aborted (timeout)")
            }, this._timeoutMs);
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

            clearTimeout(abortHandle);

            if (responseRes.isErr()) {
                logError(`error while fetching; retrying in ${humanizeDuration(retryDelayMs)}`);
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

                    if (this.isPaused) {
                        logWarn(`too many requests. already paused, waiting for unpause to continue.`);
                        return err({ type: 'retryable', retryDelayMsOverride: 0 });
                    }

                    const retryAfterHeader = res.headers.get('Retry-After');

                    let pauseDurationMs: number = 0;
                    if (retryAfterHeader) {
                        pauseDurationMs = parseInt(retryAfterHeader) * 1000;
                        logWarn(`too many requests; pausing queue for ${humanizeDuration(pauseDurationMs)} (set by Retry-After header) before retrying. consider decreasing RPS/concurrency.`);
                    } else {
                        pauseDurationMs = retryDelayMs;
                        logWarn(`too many requests; pausing queue for ${humanizeDuration(pauseDurationMs)} before retrying. consider decreasing RPS/concurrency.`);
                    }

                    await this._tryPauseQueueForMs(pauseDurationMs);

                    return err({ type: 'retryable', retryDelayMsOverride: 0 });
                } else if (isRetryableResponse(res)) {
                    // 5XX
                    logError(`request error. retrying in ${humanizeDuration(retryDelayMs)}`);
                    writeError(
                        stringify({ type: "retryable request error", url, status: res.status, statusText: res.statusText, body: await tryGetResponseBodyAsText(res) })
                    );
                    return err({ type: 'retryable' });
                } else {
                    logError("request error. cancelling download for this tile.");
                    writeError(
                        stringify({ type: "fatal request error", url, status: res.status, statusText: res.statusText, body: await tryGetResponseBodyAsText(res) })
                    );
                    return err({ type: 'unrecoverable' });
                }
            }

            const tileImageRes = await res.arrayBuffer()
                .then(res => ok(res))
                .catch(error => err({ url, error }));

            if (tileImageRes.isErr()) {
                logError(`error while trying to extract tile image. retrying in ${humanizeDuration(retryDelayMs)}`);
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