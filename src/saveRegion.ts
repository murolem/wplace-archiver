import { Logger } from '$logger'
import type { GeneralOptions, RegionOpts } from '$src/types'
import { clamp } from '$utils/clamp'
import { convertIndexToXyPosition } from '$utils/converters'
import { roundToDigit } from '$utils/roundToDigit'
import PQueue from 'p-queue'
import path from 'path';
import fs from 'fs-extra';
import { wait } from '$utils/wait'
import chalk from 'chalk'
import humanizeDuration from "humanize-duration";
// @ts-ignore no types
import humanizeNumber from 'humanize-number';
import { confirm } from '@inquirer/prompts';
import { program } from '@commander-js/extra-typings'
const logger = new Logger("main");
const { logInfo, logError, logWarn } = logger;

export type Position = {
    x: number,
    y: number
}

export type Region = {
    xy1: Position,
    xy2: Position
}

export type Size = {
    w: number,
    h: number
}

type Success<T extends unknown = unknown> = {
    success: true,
    data: T
}
function makeSuccess<T extends unknown>(data: T): Success<T> {
    return { success: true, data }
}

type Failure<R extends string = string, D extends unknown = unknown, E extends unknown = unknown> = {
    success: false,
    reason: R,
    context?: D,
    error?: E
}
function makeFailure<R extends string, C extends unknown, E extends unknown>(reason: R, context?: C, error?: E): Failure<R, C, E> {
    return { success: false, reason, context: context, error };
}
function stringifyFailure(value: Failure): string {
    const toStringify: Failure = {
        ...value,
    }
    if (value.error)
        toStringify.error = stringifyError(value.error);

    return stringify(toStringify);
}

type Result<D extends unknown = unknown, ER extends string = string, EC extends unknown = unknown, EE extends unknown = unknown> = Success<D> | Failure<ER, EC, EE>;
function makeResult<T extends Result>(value: T): T { return value; }

/** Retry on errors backoff mechanism. */
const getRetryDelay = getExpDelayCalculator({
    factor: 2,
    maxDelayMs: 5 * 60 * 1000,
    startingDelayMs: 100
});

export async function saveRegion(modeOpts: RegionOpts, generalOpts: GeneralOptions) {
    const projectDurationLongTimeWarningSeconds = 2 * 60 * 60; // 2 hours
    /** Fetch queue size target. */
    const targetQueueSize = generalOpts.requestConcurrency + 5;
    /** Formatting option for percentage progress for logging. */
    const progressPercentageDigitsAfterComma = 3;
    const pauseBeforeStartSecondsMs = 5 * 1000;
    const mapDimensionsTiles = 2048;
    const mapDimensionsTilesStrLength = mapDimensionsTiles.toString().length;

    const region = modeOpts.region;

    const regionSize: Size = {
        w: region.xy2.x - region.xy1.x + 1,
        h: region.xy2.y - region.xy1.y + 1,
    }
    const tilesTotal = regionSize.w * regionSize.h;
    const regionWidthStrLength = regionSize.w.toString().length;
    const regionHeightStrLength = regionSize.h.toString().length;

    const rps = generalOpts.requestsPerSecond
        ?? generalOpts.requestsPerMinute / 60

    const projectedDurationSeconds = clamp(Math.floor(tilesTotal / rps), 1, Infinity);

    logInfo(`archival of region X1 ${chalk.bold(region.xy1.x)} Y1 ${chalk.bold(region.xy1.y)} X2 ${chalk.bold(region.xy2.x)} Y2 ${chalk.bold(region.xy2.y)} (width ${chalk.bold(regionSize.w)} height ${chalk.bold(regionSize.h)}), totalling ${chalk.bold(humanizeNumber(tilesTotal) + " tiles")}. projected duration: ${chalk.bold(humanizeDuration(projectedDurationSeconds * 1000, { conjunction: " and " }))}`);
    if (projectedDurationSeconds > projectDurationLongTimeWarningSeconds) {
        if (!await confirm({ message: chalk.yellow(`The archival is projected to take a long time, continue?`) }))
            return;
    }

    if (generalOpts.loop) {
        logInfo(chalk.bold.bgMagenta("LOOP MODE - ARCHIVAL WILL RUN CONTINUOUSLY"));
    }


    const queue = new PQueue({ concurrency: generalOpts.requestConcurrency, interval: 1000 /** do not change */, intervalCap: rps });

    const convertTileIndexToTilePos = (index: number): Position => {
        const localPos = convertIndexToXyPosition(index, regionSize.w);
        return {
            x: (region.xy1.x + localPos.x) % mapDimensionsTiles,
            y: (region.xy1.y + localPos.y) % mapDimensionsTiles,
        }
    };

    const pauseQueueForMs = async (durationMs: number) => {
        if (queue.isPaused)
            return;

        queue.pause();
        await wait(durationMs);
        queue.start();
    }

    const mkTask = (tileIndex: number, outDirpath: string, errorsDirpath: string, attemptIndex?: number) => {
        attemptIndex = attemptIndex ?? 0;

        return async () => {
            const ts = Date.now();
            const {
                x: col,
                y: row
            } = convertTileIndexToTilePos(tileIndex);
            const colFmted = col.toString().padStart(mapDimensionsTilesStrLength, '0');
            const rowFmted = row.toString().padStart(mapDimensionsTilesStrLength, '0');

            const tAllTiles = tileIndex / tilesTotal;
            const progressPercentageAllTilesFmted = (() => {
                const percentage = roundToDigit(tAllTiles * 100, progressPercentageDigitsAfterComma).toString();
                const parts = percentage.split(".");
                return parts[0].padStart(2, '0')
                    + '.'
                    + (parts[1] ?? '').padEnd(progressPercentageDigitsAfterComma, '0');
                ;
            })();

            const logger = new Logger(`${progressPercentageAllTilesFmted}% COL ${colFmted} ROW ${rowFmted}`);
            const { logInfo, logError } = logger;

            const retryDelayMs = getRetryDelay(attemptIndex);
            const scheduleRetry = async (delayMs?: number): Promise<void> => {
                delayMs = delayMs ?? retryDelayMs;
                await wait(delayMs)
                queue.add(mkTask(tileIndex, outDirpath, errorsDirpath, attemptIndex + 1));
            }

            const writeImage = async (imgData: ArrayBuffer) => {
                const outFilepath = path.join(outDirpath, col.toString(), row + '.png');
                await fs.ensureFile(outFilepath);
                await fs.writeFile(outFilepath, Buffer.from(imgData));
            }

            const writeError = (data: string): void => {
                const outFilepath = path.join(errorsDirpath, `C${col}-R${row}-N${attemptIndex}.txt`)
                fs.writeFile(outFilepath, data);
            }

            const url = `https://backend.wplace.live/files/s0/tiles/${col}/${row}.png`;
            logInfo(chalk.gray(`fetching: ` + url));
            const responseRes = await fetch(url, {
                "headers": {
                    "Accept": "image/webp,*/*",
                    "Accept-Language": "en-US,en;q=0.5",
                },
            })
                .then(res => makeSuccess(res))
                .catch(err => {
                    return makeFailure('fetch-failed', { url }, err);
                });

            if (!responseRes.success) {
                logError(`error while fetching; retrying in ${retryDelayMs}ms`);
                writeError(stringifyFailure(responseRes));
                return await scheduleRetry();
            }

            const res = responseRes.data;
            if (!res.ok) {
                const resStatusStr = res.status.toString();
                if (res.status === 404) {
                    logInfo(chalk.gray(`tile doesn't exist, skipping`));
                    return;
                } else if (res.status === 429) {
                    const retryAfterHeader = res.headers.get('Retry-After');
                    if (retryAfterHeader === null) {
                        logError(`too many requests. maybe decrease the RPS? retrying in ${retryDelayMs}ms`);
                        await scheduleRetry();
                    } else {
                        const pauseDurationMs = parseInt(retryAfterHeader) * 1000;
                        logWarn(`too many requests; pausing for ${pauseDurationMs}ms (set by Retry-After header) before retrying. consider decreasing RPS.`);
                        await pauseQueueForMs(pauseDurationMs);
                        await scheduleRetry(0);
                    }

                    return writeError(
                        stringify({ url, status: res.status, statusText: res.statusText })
                    );
                } else if (resStatusStr.startsWith('4')) {
                    logError("fetch client error. cancelling download for this tile.");
                    return writeError(
                        stringify(
                            makeFailure("fetch client error", { url, status: res.status, statusText: res.statusText, body: await tryGetResponseBodyAsText(res) })
                        )
                    )
                } else {
                    // 5XX
                    logError(`fetch server error. retrying in ${retryDelayMs}ms (+time to save the error)`);
                    writeError(
                        stringify(
                            makeFailure("fetch server error", { url, status: res.status, statusText: res.statusText, body: await tryGetResponseBodyAsText(res) })
                        )
                    );
                    return await scheduleRetry();
                }
            }

            const tileImageRes = await res.arrayBuffer()
                .then(res => makeSuccess(res))
                .catch(err => makeFailure("error", { url }, err));

            if (!tileImageRes.success) {
                logError(`error while trying to extract tile image. retrying in ${retryDelayMs}ms`);
                writeError(stringifyFailure(tileImageRes));
                return await scheduleRetry();
            }

            await writeImage(tileImageRes.data);
            logInfo(`✅`)
        };
    }

    const cycle = async () => {
        const timeStart = new Date();
        logInfo(`starting archival cycle in ${humanizeDuration(pauseBeforeStartSecondsMs)}`);
        await wait(pauseBeforeStartSecondsMs);

        /** Initial resulting dirpath. Will be renamed after all is done to specify the elapsed duration. */
        let outDirpath = path.join(
            generalOpts.out,
            "regions",
            modeOpts.out
                .replaceAll('tile_x', region.xy1.x.toString())
                .replaceAll('tile_y', region.xy1.y.toString())
                .replaceAll('width_tiles', regionSize.w.toString())
                .replaceAll('height_tiles', regionSize.h.toString())
                .replaceAll('date', formatDateToFsSafeIsolike(timeStart))
        );
        const errorsDirpath = `${outDirpath}-ERRORS`;

        fs.ensureDirSync(outDirpath);
        fs.ensureDirSync(errorsDirpath);

        for (let i = 0; i < tilesTotal; i++) {
            await queue.onSizeLessThan(targetQueueSize);
            queue.add(mkTask(i, outDirpath, errorsDirpath));
        }

        await queue.onIdle();
        const timeEnd = new Date();
        const elapsedMs = timeEnd.getTime() - timeStart.getTime();

        const oldOutDirpath = outDirpath;
        const oldErrorsDirpath = errorsDirpath;
        outDirpath = outDirpath
            .replaceAll('duration', formatMsToDurationDirnamePart(elapsedMs));
        errorsDirpath
            .replaceAll('duration', formatMsToDurationDirnamePart(elapsedMs));

        fs.renameSync(oldOutDirpath, outDirpath);

        if ((await fs.readdir(oldErrorsDirpath)).length === 0)
            fs.rmdirSync(errorsDirpath);
        else
            fs.renameSync(oldErrorsDirpath, errorsDirpath);

        if (generalOpts.loop) {
            logInfo(chalk.bold(`✅ archival cycle complete! :3 pending restart to a new cycle`));
        } else {
            logInfo(chalk.bold(`✅ archival cycle complete! :3`));
        }
    }

    while (true) {
        await cycle();

        if (!generalOpts.loop)
            break;
    }
}

function getExpDelayCalculator(config: {
    startingDelayMs: number,
    factor: number,
    maxDelayMs: number
}) {
    const c = config;
    c.startingDelayMs = clamp(c.startingDelayMs, 0, Infinity);
    c.factor = clamp(c.factor, 0, Infinity);
    c.maxDelayMs = clamp(c.maxDelayMs, 0, Infinity);

    return (attemptIndex: number) => {
        return clamp(c.startingDelayMs * (c.factor ** attemptIndex), 0, c.maxDelayMs);
    }
}

function formatMsToDurationDirnamePart(ms: number): string {
    let mins = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours === 0 && mins === 0)
        mins = 1;

    const parts = [
        hours ? `${hours}h` : '',
        `${mins}m`,
    ].filter(val => val !== "");

    return parts.join(" ");
}

function formatDateToFsSafeIsolike(date: Date): string {
    return new Date().toISOString().replaceAll(":", "-");
}

function stringify(data: unknown): string {
    return JSON.stringify(data, null, 4);
}

function stringifyError(err: object): string {
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 4);
}

async function tryGetResponseBodyAsText(response: Response): Promise<string | null> {
    return await response.text()
        .catch(err => null);
}