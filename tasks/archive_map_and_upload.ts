import { string, z } from 'zod';
import { Logger } from '$logger';
import { spawn } from './utils/spawn';
import { program } from '@commander-js/extra-typings';
import { getIntRangeParser } from '$cli/parsers';
import { variableName as vn } from '$cli/utils';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
const { logInfo, logError, logFatalAndThrow } = new Logger("task:archive_map_and_upload");


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
    .parse();

const opts = programParsed.opts();

/** Path to dir where archival dirs will appear. NO TRAILING SLASH. */
const pathToWhereDirsWillAppear = 'archives/to_upload/world';
const out = [
    pathToWhereDirsWillAppear,
    '/',
    vn('%date'),
    '/',
    vn('%tile_x'),
    '/',
    vn('%tile_y'),
    '.',
    vn('%tile_ext'),
].join("");

console.log(out);

while (true) {
    logInfo("starting archival cycle");

    const cycleRes = await spawn(`npm run start:freebind -- region 0,0 --size 2048,2048 --no-error-out`, {
        noReturnStdout: true,
        args: [
            "--out", out,
            "--rps", opts.rps.toString(),
            "--rc", opts.rc.toString(),
            "--server-rps-limit", opts.serverRps.toString(),
            "--freebind", opts.subnet,
        ]
    });
    if (cycleRes.isErr()) {
        logError({
            msg: "error while running archival cycle. retrying.",
            data: cycleRes.error
        });
        continue;
    }

    logInfo("searching for the archive dir");

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

    if (archivedDir.dirname === '')
        logFatalAndThrow("failed to retrieve newest archived dirpath");

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
    if (compressRes.isErr())
        logFatalAndThrow({ msg: "failed to compress", data: compressRes.error });

    // @ts-ignore
    const splitRes = await splitResPromise;
    if (splitRes.isErr())
        logFatalAndThrow({ msg: "failed to compress (#2)", data: splitRes.error });

    const artifactsPathsRelToCwd = (await fs.readdir(pathToWhereDirsWillAppear))
        .filter(f => f.startsWith(archiveDirpathPattern))
        .map(f => path.join(pathToWhereDirsWillAppear, f))

    logInfo(`artifacts to upload: \n${artifactsPathsRelToCwd.map(f => `- ${f}`).join("\n")}`);


    const title = `world-${archivedDir.dirname}`;

    const notes = `\
World archive \`${archivedDir.dirname}\``;

    logInfo(`creating release ${chalk.bold(title)}`);

    const releaseCreateRes = await spawn(`gh release create ${title}`, {
        args: [
            "-t", title,
            "-n", notes,
            "--repo", opts.archivesRepo
        ]
    });
    if (releaseCreateRes.isErr())
        logFatalAndThrow({ msg: `release creation failed`, data: releaseCreateRes.error });


    logInfo(`uploading artifacts`);

    const uploadRes = await spawn(`gh release upload ${title}`, {
        args: [
            "--repo", opts.archivesRepo,
            ...artifactsPathsRelToCwd
        ]
    });
    if (uploadRes.isErr()) {
        logError({ msg: `upload failed, retrying`, data: uploadRes.error });
        continue;
    }

    logInfo(`release uploaded! \nrelease: ` + chalk.bold(`https://github.com/${opts.archivesRepo}/releases/tag/${title}`));

    logInfo(`${chalk.bgMagenta.bold("purging")} artifacts`);

    for (const p of artifactsPathsRelToCwd) {
        await fs.rm(p, { force: true });
    }

    logInfo(`${chalk.bgMagenta.bold("purging")} archived dir`);

    await fs.rm(archivedDir.dirpath, { force: true, recursive: true });

    logInfo(chalk.bold("✅ cycle complete"));

    if (!opts.loop)
        break;
}