import { Logger } from '$logger';
import { spawn } from './utils/spawn';
import { program } from '@commander-js/extra-typings';
import { getIntRangeParser } from '$cli/parsers';
import { variableName as vn } from '$cli/utils';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { DeferredPromise } from '$utils/DeferredPromise';
const logger = new Logger("task:archive-map-and-upload");
const { logInfo, logError, logFatalAndThrow } = logger;


// ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Archives entire map and uploads it to archives: https://github.com/murolem/wplace-archives
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const programParsed = program
    .name("task:archive_map")
    .requiredOption("--subnet <string>", "IPV6 subnet.")
    .requiredOption('--rps <integer>', "Requests per second.", getIntRangeParser(1, Infinity))
    .requiredOption('--rc <integer>', "Request concurrency.", getIntRangeParser(1, Infinity))
    .option('--server-rps <integer>', "Requests per IP.", getIntRangeParser(1, Infinity), 4)
    .option('--loop', "Enabled loop.")
    .option("--archives-repo <[HOST/]OWNER/REPO>", "Repo to where to upload the archives to.", "murolem/wplace-archives")
    .option("--release-upload-timeout <minutes>", "Maximum duration of an archive upload. If upload time exceeds timeout, it will be restarted.", getIntRangeParser(1, Infinity), 60)
    .option("-v", "Enables verbose logging.")
    .parse();

const opts = programParsed.opts();
const releaseUploadTimeoutMs = opts.releaseUploadTimeout * 60 * 1000;

/** Path to dir where archival dirs will appear. NO TRAILING SLASH. */
const pathToWhereDirsWillAppear = 'archives/to_upload/world';
// !note: some codepaths may be hardcoded and not rely on this variable directly.
const out = [
    pathToWhereDirsWillAppear,
    '/',
    vn('%date'),
    '+',
    vn('%duration'),
    '/',
    vn('%tile_x'),
    '/',
    vn('%tile_y'),
    '.',
    vn('%tile_ext'),
].join("");


const postStepTasks: Promise<void>[] = [];
while (true) {
    logInfo("starting archival cycle");

    const cycleRes = await spawn(`npm run start:freebind --`, {
        noReturnStdout: true,
        args: [
            "region", "0,0",
            "--size", "2048,2048",
            "--out", out,
            "--no-error-out",
            "--rps", opts.rps.toString(),
            "--rc", opts.rc.toString(),
            "--server-rps-limit", opts.serverRps.toString(),
            "--freebind", opts.subnet,
            ...(opts.v ? ["-v"] : [])
        ]
    });
    if (cycleRes.isErr()) {
        logError({
            msg: "error while running archival cycle. retrying.",
            data: cycleRes.error
        });
        continue;
    }

    enqueuePostMapDownloadTask();

    logInfo(chalk.bold(`✅ cycle download complete, post-task enqueued (tasks active: ${postStepTasks.length}); entering new cycle`));

    if (!opts.loop)
        break;
}

async function enqueuePostMapDownloadTask(): Promise<void> {
    logger.logInfo("[post-step] entering post-step")

    const taskPromise = new DeferredPromise<void>();
    postStepTasks.push(taskPromise);

    const resolveAndRemoveSelfFromTaskArr = (): void => {
        taskPromise.resolve();
        postStepTasks.splice(postStepTasks.indexOf(taskPromise));
    }


    logger.logInfo("[post-step] searching for the archive dir");

    const archivedDir = (await fs.readdir(pathToWhereDirsWillAppear))
        .reduce((accum, e) => {
            const pathStr = path.join(pathToWhereDirsWillAppear, e);
            const stat = fs.statSync(pathStr);
            if (stat.isDirectory() && stat.birthtimeMs > accum.createdTs) {
                accum.dirname = e;
                accum.dirpath = pathStr;
                accum.createdTs = stat.birthtimeMs;
            }

            return accum;
        }, {
            dirname: '',
            dirpath: pathToWhereDirsWillAppear + "/gedrigjhredogd" /* some non-existent path just in case */,
            createdTs: 0
        } as { dirname: string, dirpath: string, createdTs: number });

    if (archivedDir.dirname === '') {
        logger.logError("failed to retrieve newest archived dirpath; cancelling post-task.");
        return resolveAndRemoveSelfFromTaskArr();
    }

    const { logInfo, logError } = new Logger(`task:archive-map-and-upload | post-step ${archivedDir.dirname}`);

    logInfo("archive dir found: " + chalk.bold(archivedDir.dirpath));

    logInfo("compressing")

    const archiveDirpathPattern = `${archivedDir.dirname}.tar.gz.`;
    const compressCommand = `tar -czf - "${archivedDir.dirname}""`;
    const splitCommand = `split --bytes=2GB - "${archiveDirpathPattern}`;

    const archivedDirpathParent = path.parse(archivedDir.dirpath).dir;

    let splitResPromise: ReturnType<typeof spawn>;
    const compressRes = await spawn(compressCommand, {
        noReturnStdout: true,
        noInheritStdout: true,
        cwd: archivedDirpathParent,
        env: {
            GZIP: "-1"
        },
        processCreatedCb(tarProcess) {
            splitResPromise = spawn(splitCommand, {
                noReturnStdout: true,
                noInheritStdout: true,
                pipeStdin: true,
                cwd: archivedDirpathParent,
                processCreatedCb(splitProcess) {
                    tarProcess.stdout?.pipe(splitProcess.stdin!)
                }
            });
        },
    });
    if (compressRes.isErr()) {
        logError({ msg: "failed to compress; cancelling post-task", data: compressRes.error });
        return resolveAndRemoveSelfFromTaskArr();
    }

    // @ts-ignore
    const splitRes = await splitResPromise;
    if (splitRes.isErr()) {
        logError({ msg: "failed to compress (#2); cancelling post-task", data: splitRes.error });
        return resolveAndRemoveSelfFromTaskArr();
    }


    logInfo(chalk.bgMagenta.bold("purging archived dir"));
    await fs.rm(archivedDir.dirpath, { force: true, recursive: true });


    const artifactsPathsRelToCwd = (await fs.readdir(pathToWhereDirsWillAppear))
        .filter(f => f.startsWith(archiveDirpathPattern))
        .map(f => path.join(pathToWhereDirsWillAppear, f))

    logInfo(`artifacts to upload: \n${artifactsPathsRelToCwd.map(f => `- ${f}`).join("\n")}`);

    const title = `world-${archivedDir.dirname.split("+")[0]}`;

    const notes = `\
World archive \`${archivedDir.dirname}\``;

    logInfo(`creating release ${chalk.bold(title)}`);

    while (true) {
        const releaseCreateRes = await spawn(`gh release create ${title}`, {
            args: [
                "-t", title,
                "-n", notes,
                "--repo", opts.archivesRepo
            ]
        });
        if (releaseCreateRes.isErr()) {
            logError({ msg: `release creation failed, retrying`, data: releaseCreateRes.error });
            continue;
        }

        break;
    }


    logInfo(`uploading artifacts`);

    while (true) {
        const abortCtrl = new AbortController();
        const abortHandle = setTimeout(() => {
            abortCtrl.abort("timeout");
            logError("upload aborted (timeout)")
        }, releaseUploadTimeoutMs);

        const uploadRes = await spawn(`gh release upload ${title}   `, {
            noReturnStdout: true,
            noInheritStdout: true,
            args: [
                "--clobber",
                "--repo", opts.archivesRepo,
                ...artifactsPathsRelToCwd
            ],
            signal: abortCtrl.signal
        });
        clearTimeout(abortHandle);

        if (uploadRes.isErr()) {
            logError({ msg: `upload failed, retrying`, data: uploadRes.error });
            continue;
        }

        break;
    }

    logInfo(`release uploaded! \nrelease: ` + chalk.bold(`https://github.com/${opts.archivesRepo}/releases/tag/${title}`));

    logInfo(chalk.bgMagenta.bold("purging artifacts"));

    for (const p of artifactsPathsRelToCwd) {
        await fs.rm(p, { force: true });
    }

    logInfo(chalk.bgGray("post-step complete!"));

    return resolveAndRemoveSelfFromTaskArr();
}