import fs from 'fs-extra';
import PQueue from 'p-queue';
import path from 'path';
import { Logger } from '$logger';
import { convertIndexToXyPosition } from '$utils/converters';
import { wait } from '$utils/wait';
import chalk from 'chalk';
import { roundToDigit } from '$utils/roundToDigit';
import { clamp } from '$utils/clamp';
const logger = new Logger("main");
const { logInfo, logError } = logger;

// ========================

const dimensions = 2048
const concurrentRequests = 100;
const requestsPerSecond = 500;
const targetQueueSize = concurrentRequests + 100;
const cycleCooldownSec = 15;

const outDirPrefix = "archive";
const outErrorsDirPrefix = "archive-ERROR";
const subdirEveryNRows = 100;

const unknownErrorRetryDelayMs = 500;
const progressPercentageDigitsAfterComma = 3;

// ========================

const tilesTotal = dimensions ** 2;

const queue = new PQueue({ concurrency: concurrentRequests, interval: 1000, intervalCap: requestsPerSecond });

const convertTileIndexToTilePos = (index: number) => convertIndexToXyPosition(index, dimensions);

async function main(outDirName: string, outErrDirName: string) {
    fs.mkdirSync(outDirName);
    let outErrDirExists = false;

    const createdSubdirs = new Set();

    const mkTask = (tileIndex: number, attemptIndex?: number) => {
        attemptIndex = attemptIndex ?? 0;

        return async () => {
            const {
                x: col,
                y: row
            } = convertTileIndexToTilePos(tileIndex);

            const subdir = (() => {
                const from = Math.floor(row / subdirEveryNRows) * subdirEveryNRows;
                const to = clamp(from + subdirEveryNRows, 0, dimensions);
                return `${from}-${to}`;
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
            const colFmted = col.toString().padStart(dimensions.toString().length, '0');
            const rowFmted = row.toString().padStart(dimensions.toString().length, '0');

            const logger = new Logger(`${progressPercentageAllTilesFmted}% COL ${colFmted} ROW ${rowFmted}`);
            const { logInfo, logError } = logger;


            const writeImage = async (imgData: ArrayBuffer) => {
                const outFilepath = path.join(outDirName, subdir, `${row}-${col}.png`);
                await fs.writeFile(outFilepath, Buffer.from(imgData));
            }

            const writeErrournousRequestData = (data: string) => {
                if (!outErrDirExists) {
                    fs.mkdirSync(outErrDirName);
                    outErrDirExists = true;
                }

                const outFilepath = path.join(outErrDirName, `${row}-${col}-${attemptIndex}.txt`)
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
                if (res.status === 404) {
                    logInfo(chalk.gray(`tile doesn't exist, skipping`));

                    return;
                }

                logError(`non-ok response code: ${res.status}: ${res.statusText}; writing response, queueing retry...`);
                const body = await res.text()
                    .catch(err => {
                        logError("error while trying to retrieve body");
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

            const data = await res.arrayBuffer();
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