import { program } from '@commander-js/extra-typings';
import { Logger } from '$logger';
import chalk from 'chalk';
import path from 'path';
import { z } from 'zod';
import { parsePath, parseSemverSchema } from '$tasks/utils/cli/parsers';
import { sync as commandExistsSync } from 'command-exists';
import fs from 'fs-extra';
import type { Position, Size } from '$src/types';
import { v4 as uuidV4 } from 'uuid';
import { convertXyPositionToIndex } from '$utils/converters';
import { clamp } from '$utils/clamp';
import { formatProgressToPercentage } from '$lib/logging';
import { getFloatRangeParser } from '$cli/parsers';
import promptConfirm from '@inquirer/confirm';
import sharp from 'sharp';
const { logDebug, logInfo, logError, logFatalAndThrow } = new Logger("task:timelapse");

const programParsed = program
    .name("task:timelapse")
    .description(`Creates a timelapse video from archived tiles using ffmpeg. ${chalk.bold("Requires ffmpeg installed and available in PATH")}.`)
    .argument("<archives_dir>", `\
Path to a directory that contains archived folders to make a timelapse out of.

Currently only supports directories structured following format:
<archives_dir>/<archive_dir>/<tile_X>/<tile_Y>.png`, parsePath)
    .option("-o, --out <path>", "Path to resulting video, including extension.", parsePath, "timelapse-<datetime>.mp4")
    // .option("--max-dimension-px <px>", "Max width and height in pixels. ")
    .option("--tile-scale", "% scale of a single tile", getFloatRangeParser(0, 400), 100)
    .option("--ffmpeg-args <args>", "Extra args to pass to ffmpeg.")
    .option("--temp <path>", "Temp working directory.", parsePath, "temp")
    .option('-v', "Enables verbose logging.")
    .parse();

const args = programParsed.args;
const opts = programParsed.opts();

/** A limit of pixel size (any side) at which to start giving size warning and asking confirmation. */
const timelapseDimensionPxWarning = 10000;
/** A limit of megapixels at which to start giving size warning and asking confirmation. */
const timelapseAreaMpxWarning = 30;

const inputDir = args[0];
if (opts.v)
    Logger.setLogLevel('DEBUG');

logInfo("input directory: " + chalk.bold(inputDir))

if (!commandExistsSync("ffmpeg"))
    logFatalAndThrow("ffmpeg not found. make sure it's installed and available in PATH.");

if (!fs.existsSync(inputDir))
    logFatalAndThrow("input directory doesn't exist");
else if (!fs.statSync(inputDir).isDirectory())
    logFatalAndThrow("input directory is not a directory");

logInfo("scanning directories");

const dirPaths: string[] = [];
for (const entry of fs.readdirSync(inputDir)) {
    const pathStr = path.join(inputDir, entry);
    if (!fs.statSync(pathStr).isDirectory())
        continue;

    dirPaths.push(pathStr);
}

logInfo("measuring timelapse tile dimensions");
/** Dimensions rect. */
const dimRect = {
    /** Upper left corner. */
    xy1: { x: Infinity, y: Infinity },
    /** Lower right corner. */
    xy2: { x: -Infinity, y: -Infinity },
}

type TileY = number;
type TileX = number;
/** Maps tile positions to their full paths. */
type Tilemap = Record<TileY, Record<TileX, string>>;

const tilemapArr: Tilemap[] = [];

archive_dirpath_loop:
for (const [i, archiveDirpath] of dirPaths.entries()) {
    const { logDebug, logWarn, logError } = new Logger(`dir ${i + 1} of ${dirPaths.length}`);

    logDebug(`scanning archive dir: ${archiveDirpath}`);

    const tilemap: Tilemap = {};

    for (const tileXDirname of fs.readdirSync(archiveDirpath)) {
        const tileX = parseInt(tileXDirname);
        if (isNaN(tileX)) {
            logWarn(`encountered archive directory with a ${chalk.bold("non-numeric subdirectory names")}: expected subdirectories to be named as tile X positions; skipping path: \n${chalk.gray(archiveDirpath)}`);
            continue archive_dirpath_loop;
        }

        const tilemapByX: Tilemap[TileX] = {};

        if (tileX < dimRect.xy1.x)
            dimRect.xy1.x = tileX;
        if (tileX > dimRect.xy2.x)
            dimRect.xy2.x = tileX;

        const yTilesByXDirpath = path.join(archiveDirpath, tileXDirname);
        for (const tileYFilename of fs.readdirSync(yTilesByXDirpath)) {
            const tileYFilenameName = path.parse(tileYFilename).name;

            const tileY = parseInt(tileYFilenameName);
            if (isNaN(tileY)) {
                logWarn(`encountered a ${chalk.bold("non-numeric tile filename")}: expected tile filename to be names as tile Y position; skipping archive dir: \n${chalk.gray(archiveDirpath)}`);
                continue archive_dirpath_loop;
            }

            tilemapByX[tileY] = path.join(yTilesByXDirpath, tileYFilename);

            if (tileY < dimRect.xy1.y)
                dimRect.xy1.y = tileY;
            if (tileY > dimRect.xy2.y)
                dimRect.xy2.y = tileY;
        }

        tilemap[tileX] = tilemapByX;
    }

    tilemapArr.push(tilemap);
}

// only check a single X since if would be set even if we only had one tile.
if (dimRect.xy1.x === Infinity)
    logFatalAndThrow("no tiles were found");

const dimRectSize: Size = {
    w: dimRect.xy2.x - dimRect.xy1.x + 1,
    h: dimRect.xy2.y - dimRect.xy1.y + 1,
}

const dimRectTotalTiles = dimRectSize.w * dimRectSize.h;

const dimRectSizePx: Size = {
    w: dimRectSize.w * 1000,
    h: dimRectSize.h * 1000
}

logInfo(`timelapse size in: \n tiles: ` + chalk.bold(`${dimRectSize.w}x${dimRectSize.h}`) + ` (rect ${dimRect.xy1.x},${dimRect.xy1.y} → ${dimRect.xy2.x},${dimRect.xy2.y})`);
logInfo(`pixels: ` + chalk.bold(`${dimRectSize.w * 1000}x${dimRectSize.h * 1000}px`));

if (dimRectSizePx.w >= timelapseDimensionPxWarning || dimRectSizePx.h > timelapseDimensionPxWarning) {

}


/** offset applied to each tile position to normalize it before feeding to ffmpeg. */
const globalNameOffset: Size = {
    w: -dimRect.xy1.x,
    h: -dimRect.xy1.y
}


const tempDirname = uuidV4();
const tempDirpath = path.join(opts.temp, tempDirname);
const convertTileXyToIndex = (x: number, y: number) => convertXyPositionToIndex({ x, y }, dimRectSize.w);

logDebug(`temp dirpath: ${tempDirpath}`);
fs.ensureDirSync(tempDirpath);

logInfo("preparing tile files");
const emptyDummyTileFilepath = "tasks/0.png";
const logOnStepTile = setupLogOnTStep(0.05);
for (const [i, tilemap] of tilemapArr.entries()) {
    // const { logDebug, logInfo, logWarn, logError } = tileLogger.setLogPrefix(`{i + 1} of ${tilemapArr.length}`);

    logOnStepTile(i / (tilemapArr.length - 1), percFmted => logInfo(`[${percFmted}] processing`));
    for (let x = dimRect.xy1.x; x <= dimRect.xy2.x; x++) {
        const tilesByX = tilemap[x] as typeof tilemap[TileX] | undefined;
        for (let y = dimRect.xy1.y; y <= dimRect.xy2.y; y++) {
            const tileFrameIdx = convertTileXyToIndex(x + globalNameOffset.w, y + globalNameOffset.h);
            const resultingPath = path.join(tempDirpath, (dimRectTotalTiles * i + tileFrameIdx) + ".png");
            fs.cpSync(tilesByX?.[y] ?? emptyDummyTileFilepath, resultingPath);
        }
    }

    if (i >= 10)
        break;
}


type LogOnStep = (t: number, logFn: (percentageFmted: string, t: number) => void) => void;

/** 
 * Setups a function that logs every T step, once per step, and one more time at `T === 1`.
 * 
 * T is clamped to 0,1 range.
 */
function setupLogOnTStep(step: number = 0.01, digitsAfterComma: number = 0): LogOnStep {
    let nextLogAtT = 0;
    return (t, logFn) => {
        if (t < nextLogAtT)
            return;

        t = clamp(t, 0, 1);
        nextLogAtT = clamp(nextLogAtT + step, 0, 1);

        const percentageFmted = formatProgressToPercentage(t, digitsAfterComma);
        logFn(percentageFmted, t);
    }
}


// console.log(dimRect);
// console.log(tilemapArr);
