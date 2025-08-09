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
const logger = new Logger("main");
const { logInfo, logError } = logger;

// =======================
// ====== VARIABLES ======
// =======================

/** Concurrent requests count. */
const concurrentRequests = 100;
/** Requests per second. */
const requestsPerSecond = 500;
/** Fetch queue size target. */
const targetQueueSize = concurrentRequests + 100;
/** Cooldown before archival cycles. One cycle is a full archival. */
const cycleCooldownSec = 15;

/** How many columns to fit in one subdirectory under archival directory. Archiving is running column by column. */
const subdirEveryNCols = 32;
/** Prefix for a directory that will contain archived data. */
const outDirPrefix = "archive";
/** Prefix for a directory that will contain errors while archiving data. */
const outErrorsDirPrefix = "archive-ERRORS";

/** Delay in ms on unknown errors. */
const unknownErrorRetryDelayMs = 0.5 * 1000;
/** Delay in ms when server dies. */
const serverIsDownErrorRetryDelayMs = 30 * 1000;

/** Delay between fetch logs. Only affects info logs, errors will always be shown. */
const logIntervalMs = 100;

/** Formatting option for percentage progress for logging. */
const progressPercentageDigitsAfterComma = 3;

// =======================
// ==== END VARIABLES ====
// =======================

/** Map dimensions in tiles. */
const dimensions = 2048;
const dimensionsStrLength = dimensions.toString().length;

const tilesTotal = dimensions ** 2;

let lastLogTs = 0;
let nextLogAfterTs = 0;

const queue = new PQueue({ concurrency: concurrentRequests, interval: 1000, intervalCap: requestsPerSecond });

const convertTileIndexToTilePos = (index: number) => convertIndexToXyPosition(index, dimensions);

async function main(outDirName: string, outErrDirName: string) {
    fs.mkdirSync(outDirName);
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
                lastLogTs = ts;
                nextLogAfterTs = ts + logIntervalMs;
            }


            const writeImage = async (imgData: ArrayBuffer) => {
                const outFilepath = path.join(outDirName, subdir, `C${colFmted}-R${rowFmted}.png`);
                await fs.writeFile(outFilepath, Buffer.from(imgData));
            }

            const writeErrournousRequestData = (data: string) => {
                if (!outErrDirExists) {
                    fs.mkdirSync(outErrDirName);
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
                await wait(unknownErrorRetryDelayMs);
                queue.add(mkTask(tileIndex, attemptIndex + 1));
                return;
            } else if (!res.ok) {
                switch (res.status) {
                    case 404: {
                        logInfo(chalk.gray(`tile doesn't exist, skipping`));

                        return;
                    } case 521: {
                        logInfo(`server is dead, waiting for ${serverIsDownErrorRetryDelayMs}ms before retrying`);
                        await wait(serverIsDownErrorRetryDelayMs);

                        queue.add(mkTask(tileIndex, attemptIndex + 1));
                        return;
                    }

                }

                logError(`non-ok response code: ${res.status}: ${res.statusText}; writing response, queueing retry...`);
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

                await wait(unknownErrorRetryDelayMs);
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
                await wait(unknownErrorRetryDelayMs);
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
    }

    await queue.onIdle();
}

while (true) {
    const timeStart = new Date();
    logInfo(`starting archival cycle; start time: ${timeStart.toISOString()}`);

    const timeStartFmted = formatDateToFsSafeIsolike(timeStart);
    let outDirName = `${outDirPrefix}-${timeStartFmted}`;
    let outErrDirName = `${outErrorsDirPrefix}-${timeStartFmted}`;

    await main(outDirName, outErrDirName);

    const timeEnd = new Date();
    const timeEndFmted = formatDateToFsSafeIsolike(timeEnd);
    logInfo(`archival cycle complete; end time: ${timeEnd.toISOString()}; elapsed: ${formatMsToElapsed((timeEnd.getTime() - timeStart.getTime()))}`);

    // add end timestamp to the dirs
    const outDirNameOld = outDirName;
    const outErrDirNameOld = outErrDirName;
    outDirName = `${outDirNameOld}-${timeEndFmted}`;
    outErrDirName = `${outErrDirNameOld}-${timeEndFmted}`;
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