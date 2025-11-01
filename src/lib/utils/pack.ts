import { glob } from 'glob';
import { Logger } from '$logger';
import { getTempdir as getTempdir } from '$utils/tempdir';
import path from 'path';
import cryptoRandomString from 'crypto-random-string';
import { concatFilesGlob, concatFilepaths } from '$utils/concatFiles';
import { extract as tarExtract } from 'tar';
import fs from 'fs-extra';
import { getTransformOperationProgressEstimator } from '$utils/fs/estimators';
import { wait } from '$utils/wait';
import { formatProgressToPercentage } from '$lib/utils/logging';
const logger = new Logger("pack");
const { logDebug, logInfo, logFatalAndThrow } = logger;

export type ARCHIVE_PACK_STATE =
    "PACKED_MULTI"
    | "PACKED_SINGLE"
    | "UNPACKED"
    | "UNKNOWN";

type PackState = {
    state: ARCHIVE_PACK_STATE,
    paths: string[]
}

/**
 * Attempts to guess in which packed state an archive is.
 * 
 * @param archivePath Path or glob to an archive/archive parts.
 * @returns Packed state along with a list of paths. Description of states:
 * - `MULTIPACKED` - Archive is packed into multiple parts.
 * - `SINGLEPACKED` - Archive is packed into a single part.
 */
export async function estimateArchivePackState(archivePath: string): Promise<PackState> {
    if (await fs.exists(archivePath)) {
        if ((await fs.stat(archivePath)).isDirectory()) {
            // assume is unpacked archive
            return { state: 'UNPACKED', paths: [archivePath] }
        } else {
            // assume is a packed single archive
            return { state: 'PACKED_SINGLE', paths: [archivePath] }
        }
    } else {
        const globPaths = await glob(archivePath);
        if (globPaths.length === 0)
            return { state: 'UNKNOWN', paths: [] }
        // logFatalAndThrow("archive pack state estimation failed: no archive files found with (assumed) glob: " + archivePath);

        return { state: 'PACKED_MULTI', paths: globPaths };
    }
}

/**
 * Makes sure the specified archive is unpacked to the specified directory. 
 * The archive can be either split into multiple parts or already be concatenated into a single archive.
 * 
 * @param archivePath Archive path:
 * - If path string matches a filename, the file is assumed to be a compressed archive.
 * - Otherwise, the path string is assumed to be a glob, and every match is a part of a a compressed archive.
 * @param outDir Directory path to unpack the archive to. The archive contents are available immediately, without subdirectories.
 * @returns Unpacked archive directory path. Same as {@link outDir}.
 */
export async function ensureArchiveUnpacked(archivePath: string, outDir: string): Promise<string> {
    const loggerUnpack = new Logger("unpack");
    const { logDebug, logInfo, logFatalAndThrow } = loggerUnpack;

    logDebug("unpacking archive path/glob: " + archivePath);

    // fast path if already unpacked
    if ((await estimateArchivePackState(outDir)).state === 'UNPACKED') {
        logDebug("already unpacked, skipping unpack")
        return outDir;
    }

    const packStateEstimate = await estimateArchivePackState(archivePath);
    switch (packStateEstimate.state) {
        case 'PACKED_MULTI': {
            const tempOutFilepath = path.resolve(path.join(getTempdir(), `archive-${cryptoRandomString({ length: 10 })}.tar.gz`));
            logDebug(`concatenating glob '${archivePath}' \nto ${tempOutFilepath}`);

            const getProgress = getTransformOperationProgressEstimator(
                packStateEstimate.paths.sort(),
                [tempOutFilepath]
            );
            let isDone = false;
            const concatPromise = concatFilepaths(
                packStateEstimate.paths.sort(),
                tempOutFilepath
            )
                .then(() => isDone = true);

            while (true) {
                logInfo("concat progress: ≈" + formatProgressToPercentage(await getProgress()));
                if (isDone)
                    break
                else
                    await wait(1000);
            }

            archivePath = tempOutFilepath;
        } case 'PACKED_SINGLE': {
            outDir = path.resolve(outDir);
            logDebug(`unpacking archive '${archivePath}' \nto ` + outDir);

            // if (await fs.exists(outDir)) {
            //     logInfo("out directory already exists, removing");
            //     await fs.rm(outDir, { force: true, recursive: true });
            // }

            if (await fs.exists(outDir)) {
                logInfo("archive output directory exists, removing: \n" + outDir)
                await fs.rm(outDir, { force: true, recursive: true });
            }

            await fs.mkdir(outDir);

            const getProgress = getTransformOperationProgressEstimator(
                [archivePath],
                [outDir]
            );

            let isDone = false;
            const extractPromise = tarExtract({ file: archivePath, C: outDir, stripComponents: 1 })
                .then(() => isDone = true);

            while (true) {
                logInfo("extract progress: ≈" + formatProgressToPercentage(await getProgress()));
                if (isDone)
                    break;
                else
                    await wait(1000);
            }

            break;
        } case 'UNPACKED': {
            // outDir = path.resolve(outDir);
            // await fs.rename(stateRes.paths[0], outDir);
            break;
        } default: {
            logFatalAndThrow(`unknown state '${packStateEstimate.state}'`);
        }
    }

    return outDir;
}