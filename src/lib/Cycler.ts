import { getErrorWriter, getTileWriter } from '$lib/writers'
import { Logger } from '$logger';
import { wait } from '$utils/wait';
import humanizeDuration from 'humanize-duration';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { clamp } from '$utils/clamp';
const logger = new Logger("cycler");
const { logInfo, logError, logWarn } = logger;

export class Cycler {
    private _workingDir;
    private _cycleDirnamePreFormatter;
    private _cycleDirnamePostFormatter;
    private _cycle;
    private _cycleStartDelayMs;

    constructor(args: {
        workingDir: string,
        cycleDirpathPreFormatter: (timeStart: Date) => string,
        cycleDirpathPostFormatter: (args: {
            timeEnd: Date,
            previousCycleFmtedDirpath: string,
            elapsedMs: number
        }) => string,
        cycle: (args: {
            workingDir: string,
            outDirpath: string,
            errorsDirpath: string,
            writeTile: ReturnType<typeof getTileWriter>,
            writeError: ReturnType<typeof getErrorWriter>,
        }) => Promise<void>,

        /** Delay before each cycle, in ms.
         * @default
         * 3000
         */
        cycleStartDelayMs?: number
    }) {
        args.cycleStartDelayMs ??= 3000;

        this._workingDir = args.workingDir;
        this._cycleDirnamePreFormatter = args.cycleDirpathPreFormatter;
        this._cycleDirnamePostFormatter = args.cycleDirpathPostFormatter;
        this._cycle = args.cycle;
        this._cycleStartDelayMs = args.cycleStartDelayMs;
    }

    async start(loop: boolean = false) {
        if (loop) {
            logInfo(chalk.bold.bgMagenta("LOOP MODE - ARCHIVAL WILL RUN CONTINUOUSLY"));
        }

        while (true) {
            const timeStart = new Date();
            if (this._cycleStartDelayMs === 0) {
                logInfo(`starting archival cycle`);
            } else {
                logInfo(`starting archival cycle in ${humanizeDuration(clamp(this._cycleStartDelayMs, 1000, Infinity))}`);
            }
            await wait(this._cycleStartDelayMs);

            /** Initial resulting dirpath. Will be renamed after all is done to specify the elapsed duration. */
            let outDirpathRelToWorkDir = this._cycleDirnamePreFormatter(timeStart);
            let outDirpath = path.join(this._workingDir, outDirpathRelToWorkDir);
            let errorsDirpathRelToWorkDir = `${outDirpathRelToWorkDir}-ERRORS`;
            let errorsDirpath = path.join(this._workingDir, errorsDirpathRelToWorkDir);

            fs.ensureDirSync(outDirpath);
            fs.ensureDirSync(errorsDirpath);

            const writeTile = getTileWriter(outDirpath);
            const writeError = getErrorWriter(errorsDirpath);

            await this._cycle({
                workingDir: this._workingDir,
                outDirpath: outDirpath,
                errorsDirpath: errorsDirpath,
                writeTile: writeTile,
                writeError: writeError,
            })

            const timeEnd = new Date();
            const elapsedMs = timeEnd.getTime() - timeStart.getTime();

            const oldOutDirpath = outDirpath;
            const oldErrorsDirpath = errorsDirpath;

            outDirpathRelToWorkDir = this._cycleDirnamePostFormatter({
                timeEnd,
                elapsedMs,
                previousCycleFmtedDirpath: outDirpathRelToWorkDir
            });
            outDirpath = path.join(this._workingDir, outDirpathRelToWorkDir);
            errorsDirpathRelToWorkDir = `${outDirpathRelToWorkDir}-ERRORS`;
            errorsDirpath = path.join(this._workingDir, errorsDirpathRelToWorkDir);

            fs.renameSync(oldOutDirpath, outDirpath);

            if ((await fs.readdir(oldErrorsDirpath)).length === 0)
                fs.rmdirSync(oldErrorsDirpath);
            else
                fs.renameSync(oldErrorsDirpath, errorsDirpath);

            if (loop) {
                logInfo(chalk.bold(`✅ archival cycle complete! :3 pending restart to a new cycle`));
            } else {
                logInfo(chalk.bold(`✅ archival cycle complete! :3`));
                break;
            }
        }
    }
}