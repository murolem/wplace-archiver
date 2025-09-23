import { glob } from 'glob';
import { Logger } from '$logger';
import { getTempdir as getTempdir } from '$utils/tempdir';
import path from 'path';
import cryptoRandomString from 'crypto-random-string';
import { concatFilesGlob } from '$utils/concatFiles';
import { extract as tarExtract } from 'tar';
import fs from 'fs-extra';
const logger = new Logger("pack");
const { logDebug, logFatalAndThrow } = logger;

export type ARCHIVE_PACK_STATE =
    "PACKED_MULTI"
    | "PACKED_SINGLE"
    | "UNPACKED";

/**
 * Attempts to guess in which packed state an archive is.
 * 
 * @param archivePath Path or glob to an archive/archive parts.
 * @returns Packed state along with a list of paths. Description of states:
 * - `MULTIPACKED` - Archive is packed into multiple parts.
 * - `SINGLEPACKED` - Archive is packed into a single part.
 */
export async function guessArchivePackState(archivePath: string): Promise<{ state: ARCHIVE_PACK_STATE, paths: string[] }> {
    const paths = await glob(archivePath);

    switch (paths.length) {
        case 0:
            logFatalAndThrow("no files found while guessing archive pack state using path: " + archivePath);
            throw ''//type guard
        case 1:
            if (fs.statSync(paths[0]).isDirectory())
                return { state: 'UNPACKED', paths };
            else
                return { state: 'PACKED_SINGLE', paths };
        default:
            return { state: 'PACKED_MULTI', paths };
    }
}

/**
 * Unpacks archive.
 * 
 * @param archivePath Archive path:
 * - If path is a glob that matches multiple parts, the parts are concatenated first.
 * - If path matches a single part, it is assumed to be an compressed archive.
 * @param out Output path.
 * @returns Output path.
 */
export async function unpackArchive(archivePath: string, out: string) {
    const loggerUnpack = new Logger("unpack");
    const { logDebug, logFatalAndThrow } = loggerUnpack;

    const stateRes = await guessArchivePackState(archivePath);
    switch (stateRes.state) {
        case 'PACKED_MULTI':
            const concatToFilepath = path.join(getTempdir(), `archive-${cryptoRandomString({ length: 10 })}.tar.gz`);
            logDebug(`concatenating glob '${archivePath}' \nto ${concatToFilepath}`);

            await concatFilesGlob(
                archivePath,
                concatToFilepath
            );

            archivePath = concatToFilepath;
        case 'PACKED_SINGLE':
            logDebug(`unpacking archive '${archivePath}' \nto ` + out);

            await tarExtract({ file: archivePath, C: out });
            break;
        case 'UNPACKED':
            await fs.rename(stateRes.paths[0], out);
            break;
        default:
            logFatalAndThrow(`unknown state '${stateRes.state}'`);
    }

    return out;
}