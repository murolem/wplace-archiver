import { Logger } from '$utils/logger';
import humanizeDuration from 'humanize-duration';
import fs from 'fs-extra';
import chalk from 'chalk';
import { z } from 'zod';
import { countDown } from '$utils/countDown';
import type { TilePosition } from '$lib/utils/TilePosition';
import path from 'path';
import { PathConverger } from '$utils/fs/convergePaths';
import { tryPurgeEmptyDirAndEmptyParents } from '$utils/fs/purgeEmptyDirAndEmptyParents';
const logger = new Logger("cycler");
const { logInfo, logError, logFatal, logFatalAndThrow } = logger;

/** Cycler stages. */
export type CyclerStage =
    "pre"
    | "cycle"
    | "post";

/** Writes tile image. */
export type FnWriteTile = (tilePos: TilePosition, imgData: ArrayBuffer) => Promise<void>;

/** Writes error. */
export type FnWriteError = (tilePos: TilePosition, attemptIndex: number, error: string) => Promise<void>;

/** Returns computed path used to write a tile. */
export type FnGetTileWriteFilepath = (tilePos: TilePosition) => string;

/** Returns computed path used to write an error. */
export type FnGetErrorWriteFilepath = (tilePos: TilePosition, attemptIndex: number) => string | null;

/** Marks a filepath as written, scheduling it for renaming at the end of a cycle. */
export type FnMarkFilepathWritten = (filepath: string, isTileImagePath: boolean) => void;

/**
 * Cycle function.
 */
export type FnCycle = (args: {
    /** Writes tile image. */
    writeTile: FnWriteTile,

    /** Writes error. */
    writeError: FnWriteError,

    /** Returns computed path used to write a tile. */
    getTileWriteFilepath: FnGetTileWriteFilepath,

    /** Returns computed path used to write an error. */
    getErrorWriteFilepath: FnGetErrorWriteFilepath,

    /** Marks a filepath as written, scheduling it for renaming at the end of a cycle. */
    markFilepathWritten: FnMarkFilepathWritten,
}) => Promise<void>;

/** Output filepath formatter function applied before a cycle starts. */
export type FnOutputPatternPreFormatter = (args: {
    /** Tile output filepath pattern or errors output filepath pattern. */
    pattern: string,

    /** Datetime of when a cycle started. */
    cycleStarted: Date;
}) => string;

/** Output filepath formatter function applied during a cycle. */
export type FnOutputPatternCycleFormatter = (args: {
    /** Tile output filepath pattern or errors output filepath pattern. */
    pattern: string,

    /** Datetime of when a cycle started. */
    cycleStarted: Date;

    /** Tile or error path formatted from "pre" stage.  */
    preStageFmtedFilepath: string,

    /** Position of current tile. */
    tilePos: TilePosition,

    /** 
     * Index of current attempt at fetching this tile.
     * Only used by the error writer.
     */
    attemptIndex: number
}) => string;

/** Output filepath formatter function applied after a cycle. */
export type FnOutputPatternPostFormatter = (args: {
    /** Tile output filepath pattern or errors output filepath pattern. */
    writtenPath: string,

    /** Whether the path is a tile image path and not an error path. */
    isTileImagePath: boolean,

    /** Datetime of when a cycle started. */
    cycleStarted: Date;

    /** Datetime of when a cycle ended. */
    cycleFinished: Date;

    /** Duration of a cycle, in ms. */
    cycleElapsedMs: number;
}) => string;

export type FnOutputPatternFormatters = {
    /** Formatter for "pre" stage. */
    pre: FnOutputPatternPreFormatter,

    /** Formatter for "cycle" stage. */
    cycle: FnOutputPatternCycleFormatter,

    /** Formatter for "post" stage. */
    post: FnOutputPatternPostFormatter
};


/**
 * Cycle iterator. Uses build style invocation.
 */
export class Cycler {
    private _cycleStartDelaySec: number = 0;
    private _loop: boolean = false;
    private _tileOutputPattern: string | null = null;
    private _errorOutputPattern: string | null = null;
    private _tileOutputFilepathFormatters: FnOutputPatternFormatters | null = null;
    private _cycle: FnCycle | null = null;

    /** Sets delay before each cycle. */
    startDelay(delayMs: number): this {
        if (!z.number().min(0).safeParse(delayMs).success)
            throw new Error("expected cycle start delay to be greater than or equal to 0");

        this._cycleStartDelaySec = delayMs;
        return this;
    }

    /** 
     * Enables tile output and sets formatter for different stages of a cycle.
     * Optionally supports specifying error output path for error writing.
     */
    outputFilepath(
        tileOutputPattern: string,
        errorOutputPattern: string | null,
        formatters: FnOutputPatternFormatters
    ): this {
        this._tileOutputPattern = tileOutputPattern;
        this._errorOutputPattern = errorOutputPattern;
        this._tileOutputFilepathFormatters = formatters;
        return this;
    }

    /** Toggles cycle looping. */
    loop(toggle: boolean): this {
        this._loop = toggle;
        return this;
    }

    /** Sets cycle function. */
    cycle(fn: FnCycle): this {
        this._cycle = fn;
        return this;
    }

    /**
     * Starts cycler.
     */
    async start(): Promise<void> {
        if (!this._cycle)
            logFatalAndThrow("failed to start cycler: cycle function not defined");

        if (this._loop)
            logInfo(chalk.bold.bgMagenta("LOOP MODE - ARCHIVAL WILL RUN CONTINUOUSLY"));

        while (true) {
            const cycleStarted = new Date();
            await countDown(
                this._cycleStartDelaySec,
                secs => secs === 0
                    ? `starting archival cycle`
                    : `starting archival cycle in ${humanizeDuration(secs * 1000)}`,
                logInfo
            );

            const tileImagePathConverger = new PathConverger();
            const errorPathConverger = new PathConverger();

            const outputPathsPreFormatted = this._tileOutputFilepathFormatters
                ? {
                    tileImage: this._tileOutputPattern
                        ? this._tileOutputFilepathFormatters.pre({ pattern: this._tileOutputPattern!, cycleStarted })
                        : null,

                    error: this._errorOutputPattern
                        ? this._tileOutputFilepathFormatters.pre({ pattern: this._errorOutputPattern, cycleStarted })
                        : null
                }
                : null;

            const markFilepathWritten: FnMarkFilepathWritten = (filepath, isTileImagePath) => {
                if (isTileImagePath)
                    tileImagePathConverger.add(filepath);
                else
                    errorPathConverger.add(filepath);
            }

            const getTileWriteFilepath: FnGetTileWriteFilepath = (tilePos) => {
                if (!this._tileOutputPattern || !outputPathsPreFormatted?.tileImage)
                    logFatalAndThrow("failed to get tile image write filepath: tile output filepath not defined");

                return this._tileOutputFilepathFormatters!.cycle({
                    pattern: this._tileOutputPattern!,
                    cycleStarted,
                    preStageFmtedFilepath: outputPathsPreFormatted!.tileImage!,
                    tilePos,
                    // just an arbitrary number since it won't be used anyway
                    attemptIndex: -1
                });
            }

            const getErrorWriteFilepath: FnGetErrorWriteFilepath = (tilePos, attemptIndex) => {
                if (!this._errorOutputPattern || !outputPathsPreFormatted?.error)
                    return null;

                return this._tileOutputFilepathFormatters!.cycle({
                    pattern: this._errorOutputPattern!,
                    cycleStarted,
                    preStageFmtedFilepath: outputPathsPreFormatted!.error!,
                    tilePos,
                    attemptIndex
                });
            }

            const writeTile: FnWriteTile = async (tilePos, imgData) => {
                if (!this._tileOutputPattern || !outputPathsPreFormatted?.tileImage)
                    logFatalAndThrow("failed to write tile image: tile output filepath not defined");

                const filepath = getTileWriteFilepath(tilePos);
                await fs.ensureFile(filepath);
                await fs.writeFile(filepath, Buffer.from(imgData));
                markFilepathWritten(filepath, true);
            };

            const writeError: FnWriteError = async (tilePos, attemptIndex, error) => {
                const filepath = getErrorWriteFilepath(tilePos, attemptIndex);
                if (!filepath)
                    return;

                await fs.ensureFile(filepath!);
                await fs.writeFile(filepath!, error);
                markFilepathWritten(filepath!, false);
            };

            await this._cycle!({
                writeTile,
                writeError,
                getTileWriteFilepath,
                getErrorWriteFilepath,
                markFilepathWritten
            })

            const cycleFinished = new Date();
            const cycleElapsedMs = cycleFinished.getTime() - cycleStarted.getTime();

            if (this._tileOutputFilepathFormatters) {
                logInfo("running post-stage renaming");

                const getPostFmtedPath = (pathStr: string, isTileImagePath: boolean) => this._tileOutputFilepathFormatters!.post({
                    writtenPath: pathStr,
                    cycleElapsedMs,
                    cycleFinished,
                    cycleStarted,
                    isTileImagePath
                });

                const tryRenamePath = async (pathFrom: string, formatter: (pathStr: string) => string): Promise<void> => {
                    logInfo(chalk.gray("renaming: " + pathFrom));

                    if (!(await fs.exists(pathFrom)))
                        return;

                    // substitute the only post-stage variable.
                    const pathTo = formatter(pathFrom);
                    logInfo(chalk.gray("      to: " + pathTo));
                    if (pathTo === pathFrom)
                        return;

                    await fs.ensureDir(path.parse(pathTo).dir)
                    await fs.rename(pathFrom, pathTo);
                    await tryPurgeEmptyDirAndEmptyParents(pathFrom);
                }

                if (tileImagePathConverger.convergedPath)
                    await tryRenamePath(tileImagePathConverger.convergedPath, pathStr => getPostFmtedPath(pathStr, true));

                if (errorPathConverger.convergedPath)
                    await tryRenamePath(errorPathConverger.convergedPath, pathStr => getPostFmtedPath(pathStr, false));

                logInfo(chalk.gray("post-stage renaming complete"));
            }

            const elapsedFmted = humanizeDuration(cycleElapsedMs, { round: true });
            if (this._loop) {
                logInfo(chalk.bold(`✅ archival cycle completed in ${elapsedFmted}! :3 pending restart to a new cycle`));
            } else {
                logInfo(chalk.bold(`✅ archival cycle completed in ${elapsedFmted}! :3`));
                break;
            }
        }
    }
}