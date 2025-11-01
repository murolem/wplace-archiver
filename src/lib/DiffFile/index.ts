import fs from 'fs';
import fsPromises from 'fs/promises';
import { Logger } from '$logger';
import { getModuleFilenameNoExt } from '$utils/getModuleFilename';
import { DIFF_META_H_MAGIC, DIFF_META_H_MAGIC_BYTELEN, encoderFileMetadata } from '$lib/DiffFile/encoders';
import { createFileReader } from '$lib/fs/createFileReader';
import { Encoder } from '$lib/DiffFile/Encoder';
import { diff, Jimp } from 'jimp';
import { diffImages } from '$lib/DiffFile/diffImages';
import { ensureArchiveUnpacked } from '$lib/utils/pack';
import path from 'path';
const { logDebug, logInfo, logFatalAndThrow } = new Logger(getModuleFilenameNoExt(__filename));
Logger.setLogLevel('DEBUG');

/**
 * Archive diff file, `.wpd`.
 * 
 * Represents changes between two or more archives.
 */
export class DiffFile {
    private baseArchiveDirpath: string | null = null;
    private topArchiveDirpaths: string[] = [];

    /**
     * Compute a diff between two tiles.
     * @param baseTileFilepath Filepath to the initial tile.
     * @param topTileFilepath Filepath to the second tile.
     */
    static async create(baseTileFilepath: string, topTileFilepath: string): Promise<DiffFile> {
        if (!await fsPromises.exists(baseTileFilepath)) {
            logFatalAndThrow({
                msg: "failed to create a diff file: base tile filepath does not exist",
                data: {
                    filepath: baseTileFilepath
                }
            })
            throw ''//guard
        } else if (!await fsPromises.exists(topTileFilepath)) {
            logFatalAndThrow({
                msg: "failed to create a diff file: top tile filepath does not exist",
                data: {
                    filepath: baseTileFilepath
                }
            })
            throw ''//guard
        }

        const diffRes = await diffImages(
            baseTileFilepath,
            topTileFilepath
        );

        fs.writeFileSync('a.json', JSON.stringify(diffRes, null, 4));
    }

    /** Sets base archive. */
    async setBaseArchive(dirpath: string): this {
        this.baseArchiveDirpath = dirpath;
    }

    /** Appends an archive on top of base archive and any previously appended archives. */
    async appendArchive(dirpath: string): this {
        const dirpathResolved = path.resolve(dirpath);
        if (dirpathResolved === this.baseArchiveDirpath) {
            logFatalAndThrow({
                msg: "attempting to append the base archive path",
                data: {
                    dirpath: {
                        given: dirpath,
                        resolved: dirpathResolved
                    }
                }
            }); throw ''//guard
        } else if (this.topArchiveDirpaths.includes(dirpathResolved))
            logFatalAndThrow({
                msg: "archive dirpath already appended",
                data: {
                    dirpath: {
                        given: dirpath,
                        resolved: dirpathResolved
                    }
                }
            }); throw ''//guard

        this.topArchiveDirpaths.push(dirpath);
    }

    /** Run diff on appended archives. */
    async diff() {
        if (this.baseArchiveDirpath === null) {
            logFatalAndThrow("base archive not set"); throw ''//guard
        } else if (this.topArchiveDirpaths.length === 0) {
            logFatalAndThrow("no archives appended"); throw ''//guard
        }

        const res = [];
        for (const topArchiveDirpath of this.topArchiveDirpaths) {

        }
    }

    /**
     * Write diff file to disk.
     */
    async save(outFilepath: string): Promise<void> {
        // const headerBytes =         
    }


    // /**
    //  * Load a diff file from disk.
    //  * @param filepath Path to a diff file.
    //  * @throws {Error} If load fails (file doesn't exists, format mismatch, etc.).
    //  */
    // static async load(filepath: string): Promise<DiffFile> {

    // }


    /**
     * Checks whether given file is a diff file by checking the magic sequence.
     * @param filepath Path to file.
     */
    static async isDiffFile(filepath: string): Promise<boolean> {
        if (!fs.existsSync(filepath))
            logFatalAndThrow("failed to check if file is a diff file: filepath doesn't exists: " + filepath);

        const read = await createFileReader(filepath);
        const magic = Encoder.bytesToStr(await read(DIFF_META_H_MAGIC_BYTELEN));
        return magic === DIFF_META_H_MAGIC;
    }
}