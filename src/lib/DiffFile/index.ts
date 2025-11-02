import fs from 'fs-extra';
import { Logger } from '$logger';
import { DIFF_META_H_MAGIC, DIFF_META_H_MAGIC_BYTELEN } from '$lib/DiffFile/encoders';
import { createFileReader } from '$lib/fs/createFileReader';
import { Encoder } from '$lib/DiffFile/Encoder';
import path from 'path';
import PQueue from 'p-queue';
import os from 'node:os';
import WorkerPool from '$src/Workers/WorkerPool';
import { asIs, diffImages, type DiffResult } from '$lib/DiffFile/diffImages';
const { logDebug, logInfo, logFatalAndThrow } = new Logger("DiffFile");

type TileY = number;
type TileX = number;
/** `<tile-y>-<tile-x>` */
type TileStringPosition = string;

type ArchiveDiffInfo = {
    tiles: TileStringPosition[],
    tilePaths: Map<TileStringPosition, string>,
    hashes: Map<TileStringPosition, string>,
    sizes: Map<TileStringPosition, number>
}

/**
 * Archive diff file, `.wpd`.
 * 
 * Represents changes between two or more archives.
 */
export class DiffFile {
    private baseArchiveDirpath: string | null = null;
    private topArchiveDirpaths: string[] = [];

    /** Sets base archive. */
    setBaseArchive(dirpath: string): this {
        this.baseArchiveDirpath = dirpath;
        return this;
    }

    /** Appends an archive on top of base archive and any previously appended archives. */
    appendArchive(dirpath: string): this {
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
        } else if (this.topArchiveDirpaths.includes(dirpathResolved)) {
            logFatalAndThrow({
                msg: "archive dirpath already appended",
                data: {
                    dirpath: {
                        given: dirpath,
                        resolved: dirpathResolved
                    }
                }
            }); throw ''//guard
        }

        this.topArchiveDirpaths.push(dirpath);
        return this;
    }

    /** Run diff on appended archives. */
    async diff() {
        logInfo("starting diff; base dirpath: " + this.baseArchiveDirpath);

        if (this.baseArchiveDirpath === null) {
            logFatalAndThrow("base archive not set"); throw ''//guard
        } else if (this.topArchiveDirpaths.length === 0) {
            logFatalAndThrow("no archives appended"); throw ''//guard
        }

        const baseDirpathResolved = path.resolve(this.baseArchiveDirpath);
        if (!(await fs.exists(baseDirpathResolved))) {
            logFatalAndThrow({
                msg: "base archive dirpath does not exist",
                data: {
                    baseDirpath: {
                        given: this.baseArchiveDirpath,
                        resolved: baseDirpathResolved
                    }
                }
            }); throw ''//guard
        }

        logDebug("collecting [0] base archive info");
        let baseInfo: ArchiveDiffInfo = await this.collectArchiveInfo(this.baseArchiveDirpath);
        let topInfo: ArchiveDiffInfo;

        const diffs = new Map<string, DiffResult>();
        for (const [diffIdx, topDirpath] of this.topArchiveDirpaths.entries()) {
            logInfo(`diffing [${diffIdx}] -> [${diffIdx + 1}]; top archive: ${topDirpath}`);

            const topDirpathResolved = path.resolve(topDirpath);
            if (!(await fs.exists(topDirpathResolved))) {
                logFatalAndThrow({
                    msg: "top archive dirpath does not exist",
                    data: {
                        baseDirpath: {
                            given: this.baseArchiveDirpath,
                            resolved: baseDirpathResolved
                        },
                        topDirpath: {
                            given: topDirpath,
                            resolved: topDirpathResolved,
                            index: diffIdx
                        }
                    }
                }); throw ''//guard
            }

            logDebug("collecting info");
            topInfo = await this.collectArchiveInfo(topDirpathResolved);

            logDebug("diffing");

            // const baseTilesSet = new Set(baseInfo.tiles);

            // TODO: check for erased tiles

            for (let i = 0; i < topInfo.tiles.length; i++) {
                const strTilePos = topInfo.tiles[i];

                if (!baseInfo.tiles.includes(strTilePos)) {
                    // if tile is new, no diff needed - save as is

                    // logInfo("new tile")
                    diffs.set(strTilePos, await asIs(topInfo.tilePaths.get(strTilePos)!));
                } else if (baseInfo.sizes.get(strTilePos) !== topInfo.sizes.get(strTilePos)) {
                    // if size mismatch, diff needed

                    diffs.set(strTilePos, await diffImages(
                        baseInfo.tilePaths.get(strTilePos)!,
                        topInfo.tilePaths.get(strTilePos)!
                    ));
                    // diffs.set(strTilePos, '1')
                } else if (baseInfo.hashes.get(strTilePos) !== topInfo.hashes.get(strTilePos)) {
                    // if hash mismatch, diff needed

                    diffs.set(strTilePos, await diffImages(
                        baseInfo.tilePaths.get(strTilePos)!,
                        topInfo.tilePaths.get(strTilePos)!
                    ));
                    // diffs.set(strTilePos, '1')
                }

                // if (Math.random() < 0.01)
                // logInfo(i.toString())
                logInfo(i.toString())
            }

            logInfo(diffs.size.toString())
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

    /** Collects various information about an archive to use in diffing. */
    private async collectArchiveInfo(dirpath: string): Promise<ArchiveDiffInfo> {
        const concurrency = os.availableParallelism();
        const parallelism = os.availableParallelism();
        const jobSize = os.availableParallelism();
        const jobQueueSize = concurrency * 2;

        /** Fetches N paths from the path pool. If paths run out, returns what's left (if any). */
        const tilePathFetcher = await (async () => {
            const paths = await fs.readdir(dirpath, { recursive: true });

            return function* (): Generator<string[], string[], void> {
                let i = 0;
                while (true) {
                    const pathsCycle: string[] = [];
                    while (pathsCycle.length < jobSize) {
                        const strRelPath = paths[i++] as string;
                        if (strRelPath === undefined)
                            return pathsCycle; // when run out of paths
                        else if (!strRelPath.includes(path.sep))
                            continue; // skip dir paths

                        pathsCycle.push(dirpath + path.sep + strRelPath);
                    }

                    yield pathsCycle;
                }
            }();
        })();


        const jobQueue = new PQueue({ concurrency: concurrency });
        const sizeAndHashJobPool = new WorkerPool<string[]>('./src/Workers/size_and_hash.js', parallelism);

        const startTs = performance.now();

        const resInfo: ArchiveDiffInfo = { tiles: [], tilePaths: new Map(), hashes: new Map(), sizes: new Map() }
        let doneCounter = 0;
        while (true) {
            const strPathsRes = tilePathFetcher.next();
            if (strPathsRes.done)
                break;

            const strPaths = strPathsRes.value;

            jobQueue.add(async () => {
                const res = (await sizeAndHashJobPool.runTask(strPaths)) as [number[], string[]];
                for (let i = 0; i < strPaths.length; i++) {
                    const strPath = strPaths[i];

                    const split = strPath.split(path.sep);
                    const strName = split.at(-2) + "-" + split.at(-1)?.split(".")[0];

                    resInfo.tiles.push(strName);
                    resInfo.tilePaths.set(strName, strPath);
                    resInfo.sizes.set(strName, res[0][i]);
                    resInfo.hashes.set(strName, res[1][i]);

                    doneCounter++;
                }
            });

            await jobQueue.onSizeLessThan(jobQueueSize);
        }

        await jobQueue.onIdle();
        sizeAndHashJobPool.close();

        const finishTs = performance.now();
        logDebug(`collecting took ${Math.round(finishTs - startTs)}ms`)

        // const finish = performance.now();

        // console.log(`concurrency = ${concurrency}, queue size = ${queueSize}, job size = ${sampleSize}; took: ` + Math.round(finish - start) + "ms");
        // console.log(info.hashes.size)

        return resInfo;
    }


    // return info;
}

// /** Reads archive tile structure. */
// private async readArchiveStructure(dirpath: string): Promise<TileStringPosition[]> {
//     const res = [];
//     for (const pathStr of await fs.readdir(dirpath)) {
//         if (!pathStr.includes(path.sep))
//             continue;

//         const split = pathStr.split(path.sep);
//         res.push(split[0] + "-" + path.parse(split[1]).name)
//     }
//     return res;
// }