import fs from 'fs-extra';
import PQueue from 'p-queue';
import path from 'path';
import { Logger } from '$logger';
import { convertIndexToXyPosition } from '$utils/converters';
import { wait } from '$utils/wait';
import chalk from 'chalk';
import { roundToDigit } from '$utils/roundToDigit';
import { clamp } from '$utils/clamp';
import { noop } from '$utils/noop';
import { toOsPath } from '$utils/toOsPath';
const logger = new Logger("main");
const { logInfo, logError, logWarn } = logger;

// =======================
// ====== VARIABLES ======
// =======================

/** Initial requests per second. */
let requestsPerSecond = 7;
/** Initial concurrent requests count. */
let concurrentRequests = 5;
/** Fetch queue size target. */
const targetQueueSize = concurrentRequests + 5;
/** Cooldown before archival cycles. One cycle is a full archival. */
const cycleCooldownSec = 15;

/** How many columns to fit in one subdirectory under archival directory. Archiving is running column by column. */
const subdirEveryNCols = 32;
/** Prefix for a directory that will contain archived data. */
const outDirPrefix = toOsPath("archives/archive");
/** Prefix for a directory that will contain errors while archiving data. */
const outErrorsDirPrefix = toOsPath("archives/archive-ERRORS");

/** Retry on errors backoff mechanism. */
const getRetryDelay = getExpDelayCalculator({
    factor: 2,
    maxDelayMs: 5 * 60 * 1000,
    startingDelayMs: 100
});

/** Delay between fetch logs. Only affects info logs, errors will always be shown. */
const logIntervalMs = 0;

/** Formatting option for percentage progress for logging. */
const progressPercentageDigitsAfterComma = 3;

/** Config for a request frequency configurator that manages amount of requests based on the server capabilities. */
const dynRequestConfigurator = getDynamicRequestConfigurator({
    /** Minimum concurrent requests. Should not be less than 1. */
    concurrencyMin: 1,
    /** Maximum concurrent requests. */
    concurrencyMax: 500,
    /** Minimum requests per second. Should not be less than 1. */
    rpsMin: 5,
    /** Maximum requests per second. */
    rpsMax: 500,

    /** 
     * How frequently should request timings update, if too many requests errors are encountered?
     * Values too small will cause a cascade of adjustments because of requests lagging behind (due to duration or Retry-After header retry duration
     * 
     * Retry-After is known to get to 10 seconds, so keep it above that.
     */
    slowerAdjustmentMinFrequencyMs: 10 * 1000,

    /** 
     * Delay before trying to speed up after slowing down. 
     * Should be as rare as possible to prevent slowdowns when receiving the Too many requests error. */
    fasterAdjustmentFrequencyTimeoutMsAfterSlowing: 1 * 60 * 1000,

    /** 
     * How often should a faster adjustment be performed (when beyond {@link fasterAdjustmentFrequencyTimeoutMsAfterSlowing})?
     * This should allow to ramp up quickly if the website RPS limit somehow gets higher.
     */
    fasterAdjustmentFrequencyMs: 10 * 1000
})

// =======================
// ==== END VARIABLES ====
// =======================

const mkQueue = () => new PQueue({ concurrency: concurrentRequests, interval: 1000 /** do not change */, intervalCap: requestsPerSecond });

let queue = mkQueue();

/** Map dimensions in tiles. */
const dimensions = 2048;
const dimensionsStrLength = dimensions.toString().length;

const tilesTotal = dimensions ** 2;

let nextLogAfterTs = 0;



const convertTileIndexToTilePos = (index: number) => convertIndexToXyPosition(index, dimensions);

async function main(outDirName: string, outErrDirName: string) {
    fs.mkdirSync(outDirName, { recursive: true });
    let outErrDirExists = false;

    const createdSubdirs = new Set();

    const mkTask = (tileIndex: number, attemptIndex?: number) => {
        attemptIndex = attemptIndex ?? 0;

        return async () => {
            const ts = Date.now();
            // swap row and col so that we iteratie over cols first
            const {
                x: row,
                y: col
            } = convertTileIndexToTilePos(tileIndex);
            const colFmted = col.toString().padStart(dimensionsStrLength, '0');
            const rowFmted = row.toString().padStart(dimensionsStrLength, '0');
            let retryDelayMs = getRetryDelay(attemptIndex);

            const subdir = (() => {
                const from = Math.floor(col / subdirEveryNCols) * subdirEveryNCols;
                const to = clamp(from + subdirEveryNCols, 0, dimensions);
                const fromFmted = from.toString().padStart(dimensionsStrLength, '0');
                const toFmted = to.toString().padStart(dimensionsStrLength, '0');
                return `C${fromFmted}-C${toFmted}`;
            })();

            if (!createdSubdirs.has(subdir)) {
                fs.mkdirSync(path.join(outDirName, subdir));
                createdSubdirs.add(subdir);
            }

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
            const { logError } = logger;
            let { logInfo } = logger;
            if (ts <= nextLogAfterTs) {
                logInfo = noop;
            } else {
                nextLogAfterTs = ts + logIntervalMs;
            }


            const writeImage = async (imgData: ArrayBuffer) => {
                const outFilepath = path.join(outDirName, subdir, `C${colFmted}-R${rowFmted}.png`);
                await fs.writeFile(outFilepath, Buffer.from(imgData));
            }

            const writeErrournousRequestData = (data: string) => {
                if (!outErrDirExists) {
                    fs.mkdirSync(outErrDirName, { recursive: true });
                    outErrDirExists = true;
                }

                const outFilepath = path.join(outErrDirName, `C${colFmted}-R${rowFmted}-N${attemptIndex}.txt`)
                fs.writeFile(outFilepath, data);
            }

            const url = `https://backend.wplace.live/files/s0/tiles/${col}/${row}.png`;
            logInfo(`fetching: ` + url);
            const res = await fetch(url, {
                "headers": {
                    "Accept": "image/webp,*/*",
                    "Accept-Language": "en-US,en;q=0.5",
                },
            })
                .catch(err => {
                    logError("request failed; writing error, queueing retry", err);
                    writeErrournousRequestData(stringifyErrorToJson(err));

                    return Promise.resolve<"error">("error");
                });

            if (res === "error") {
                await wait(retryDelayMs);
                queue.add(mkTask(tileIndex, attemptIndex + 1));
                return;
            } else if (!res.ok) {
                if (res.status === 404) {
                    logInfo(chalk.gray(`tile doesn't exist, skipping`));

                    return;
                }

                let isKnownError = false;
                switch (res.status) {
                    case 429:
                        isKnownError = true;
                        const retryAfterHeader = res.headers.get('Retry-After');
                        if (retryAfterHeader === null) {
                            logInfo(`too many requests. maybe decrease the RPS?; waiting for ${retryDelayMs}ms before retrying`);
                        } else {
                            retryDelayMs = parseInt(retryAfterHeader) * 1000;
                            logInfo(`too many requests. maybe decrease the RPS?; waiting for ${retryDelayMs}ms before retrying (set by Retry-After header)`);
                            dynRequestConfigurator.tryAdjustSlower();
                        }
                        break;
                    case 500:
                        isKnownError = true;
                        logInfo(`server error; waiting for ${retryDelayMs}ms before retrying`);
                        break;
                    case 521:
                        isKnownError = true;
                        logInfo(`server is dead; waiting for ${retryDelayMs}ms before retrying`);
                        break;
                }

                if (isKnownError) {
                    await wait(retryDelayMs);
                    queue.add(mkTask(tileIndex, attemptIndex + 1));
                    return;
                }


                logError(`non-ok response code: ${res.status}: ${res.statusText}; unknown error; writing response, queueing retry...`);
                const body = await res.text()
                    .catch(err => {
                        logError("error while trying to retrieve body on a non-ok status");
                        writeErrournousRequestData(stringifyErrorToJson(err));

                        return Promise.resolve<"error">("error");
                    });

                writeErrournousRequestData(JSON.stringify({
                    body,
                    status: res.status,
                    statusText: res.statusText,
                    response: res
                }, null, 4));

                await wait(retryDelayMs);
                queue.add(mkTask(tileIndex, attemptIndex + 1));
                return;
            }

            const data = await res.arrayBuffer()
                .catch(err => {
                    logError("error while trying to retrieve body as image");
                    writeErrournousRequestData(stringifyErrorToJson(err));

                    return Promise.resolve<"error">("error");
                });

            if (data === 'error') {
                await wait(retryDelayMs);
                queue.add(mkTask(tileIndex, attemptIndex + 1));
                return;
            }

            await writeImage(data);

            logInfo(`✅`)
        }
    }

    for (let i = 0; i < tilesTotal; i++) {
        await queue.onSizeLessThan(targetQueueSize);
        queue.add(mkTask(i));
        dynRequestConfigurator.tryAdjustFaster();
    }
}

while (true) {
    const timeStart = new Date();
    logInfo(`starting archival cycle; start time: ${timeStart.toISOString()}`);

    const timeStartFmted = formatDateToFsSafeIsolike(timeStart);
    let outDirName = `${outDirPrefix}--${timeStartFmted}`;
    let outErrDirName = `${outErrorsDirPrefix}--${timeStartFmted}`;

    await main(outDirName, outErrDirName);

    const timeEnd = new Date();
    const timeEndFmted = formatDateToFsSafeIsolike(timeEnd);
    logInfo(`archival cycle complete; end time: ${timeEnd.toISOString()}; elapsed: ${formatMsToElapsed((timeEnd.getTime() - timeStart.getTime()))}`);

    // add end timestamp to the dirs
    const outDirNameOld = outDirName;
    const outErrDirNameOld = outErrDirName;
    outDirName = `${outDirNameOld}--${timeEndFmted}`;
    outErrDirName = `${outErrDirNameOld}--${timeEndFmted}`;
    fs.renameSync(outDirNameOld, outDirName);
    if (fs.existsSync(outErrDirNameOld))
        fs.renameSync(outErrDirNameOld, outErrDirName);

    logInfo(`cooldown before new cycle; seconds: ${cycleCooldownSec}`);
    await wait(cycleCooldownSec * 1000);
}

function formatMsToElapsed(ms: number): string {
    const sec = Math.round(ms / 1000);
    const mins = Math.floor(sec / 60);
    const hours = Math.floor(mins / 60);

    const minsRes = mins % 60;
    const secRes = sec % 60;

    const parts = [
        hours + " " + (hours === 1 ? "hour" : "hours"),
        minsRes + " " + (minsRes === 1 ? "minute" : "minutes"),
        secRes + " " + (secRes === 1 ? "second" : "seconds"),
    ].filter(val => val !== "");

    return parts.join(" ");
}

function formatDateToFsSafeIsolike(date: Date): string {
    return new Date().toISOString().replaceAll(":", "-");
}

function stringifyErrorToJson(err: object): string {
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 4);
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

function getDynamicRequestConfigurator(config: {
    rpsMin: number,
    rpsMax: number,
    concurrencyMin: number,
    concurrencyMax: number,
    slowerAdjustmentMinFrequencyMs: number,
    fasterAdjustmentFrequencyTimeoutMsAfterSlowing: number,
    fasterAdjustmentFrequencyMs: number
}) {
    const c = config;
    let nextSlowingAdjustmentAfterTs = 0;
    // this value prevents immediate speedup
    let nextSpeedupAfterTs = Date.now() + c.fasterAdjustmentFrequencyMs;

    const calculateDeltas = () => {
        let rpsDelta = 1;
        let concurrencyDelta = 1;

        if (requestsPerSecond > 10) {
            rpsDelta = 2;
        } else if (requestsPerSecond > 30) {
            rpsDelta = 5
        } else if (requestsPerSecond > 70) {
            rpsDelta = 10
        } else if (requestsPerSecond > 150) {
            rpsDelta = 20
        } else if (requestsPerSecond > 250) {
            rpsDelta = 40
        }

        if (concurrentRequests > 10) {
            concurrencyDelta = 2;
        } else if (concurrentRequests > 20) {
            concurrencyDelta = 4
        } else if (concurrentRequests > 50) {
            concurrencyDelta = 8
        } else if (concurrentRequests > 100) {
            concurrencyDelta = 20
        } else if (concurrentRequests > 250) {
            concurrencyDelta = 40
        }

        return {
            rpsDelta,
            concurrencyDelta
        }
    }

    const getAdjustments = (sign: -1 | 1) => {
        const deltas = calculateDeltas();
        const newRps = clamp(requestsPerSecond + (deltas.rpsDelta * sign), c.rpsMin, c.rpsMax);
        const newConcurrency = clamp(requestsPerSecond + (deltas.concurrencyDelta * sign), c.concurrencyMin, c.concurrencyMax);

        const adjustments: {
            name: "rps" | "concurrency",
            old: number,
            new: number,
            delta: number,
            set: (value: number) => void
        }[] = [];

        if (newRps !== requestsPerSecond)
            adjustments.push({ name: 'rps', old: requestsPerSecond, new: newRps, delta: newRps - requestsPerSecond, set(value) { requestsPerSecond = value } });
        if (newConcurrency !== concurrentRequests)
            adjustments.push({ name: 'concurrency', old: concurrentRequests, new: newConcurrency, delta: newConcurrency - concurrentRequests, set(value) { concurrentRequests = value } });

        return {
            adjustments,
            fmt: () => adjustments
                .map(e => {
                    const deltaFmted = e.delta > 0 ? "+" + e.delta : e.delta.toString();
                    return `${e.name.toLocaleUpperCase()} ${e.old} > ${e.new} (${deltaFmted})`;
                })
                .join("; "),
            apply: () => {
                adjustments.forEach(e => e.set(e.new));
                queue = mkQueue();

                const ts = Date.now();
                if (sign === 1) {
                    // speed up
                    nextSpeedupAfterTs = ts + c.fasterAdjustmentFrequencyMs;
                } else {
                    // slow down
                    nextSlowingAdjustmentAfterTs = ts + c.slowerAdjustmentMinFrequencyMs;
                    nextSpeedupAfterTs = ts + c.fasterAdjustmentFrequencyTimeoutMsAfterSlowing;
                }
            },
            get canApply() {
                if (sign === 1) {
                    // speed up
                    return Date.now() > nextSpeedupAfterTs;
                } else {
                    // slow down
                    return Date.now() > nextSlowingAdjustmentAfterTs;
                }
            }
        };
    }

    return {
        tryAdjustSlower() {
            const adjustments = getAdjustments(-1);
            if (!adjustments.canApply)
                return

            logWarn(`${chalk.yellow.bold('SLOWING')} request frequency to: ` + adjustments.fmt());
            adjustments.apply();
        },

        tryAdjustFaster() {
            const adjustments = getAdjustments(1);
            if (!adjustments.canApply)
                return

            logWarn(`${chalk.green.bold('RAMPING UP')} request frequency to: ` + adjustments.fmt());
            adjustments.apply();
        }
    };
}