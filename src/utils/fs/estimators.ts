import { Logger } from '$logger';
import { clamp } from '$utils/math/clamp';
import { getModuleFilenameNoExt } from '$utils/fs/getModuleFilename';
import fs from 'fs-extra';
import getFolderSize from "get-folder-size";
const { logFatalAndThrow } = new Logger("utils/fs/" + getModuleFilenameNoExt(__filename));

/**
 * Estimates size of path in bytes. 
 * The path can either be a path to file or directory. Any other type of path is not support and will result in an error.
 * @param pathStr Path to a file or directory.
 * @throws {Error} If path is not file or directory.
 * @returns Path size in bytes.
 */
async function estimatePathSize(pathStr: string): Promise<number> {
    const stat = await fs.stat(pathStr);
    if (stat.isFile())
        return stat.size;
    else if (stat.isDirectory())
        return await getFolderSize.loose(pathStr);
    else
        logFatalAndThrow("encountered a path of unsupported type: " + pathStr); throw ''//type guard
}

/**
 * Creates a transformation operation progress estimator. 
 * In this context, a transformation operation is an operation that does some job on source files and produces a new files.
 * 
 * @param sourcePaths A list of source file- or directory-paths. Estimation on those is run once during the first estimation call.
 * @param outPaths A list of output file- or directory paths. Estimation on those is run on every estimation call.
 * @param expectedRatio Expected source-to-output filesize ratio. 
 * - Smaller number means output size smaller than the input size.
 * - The ratio of 1 means exact size.
 * - Bigger number means output size bibber than the input size. Twice the ratio = twice the size.
 * @returns An estimator function. The function return progress estimation from 0 to 1. The number is capped from 0 to 0.999[9], unless a `done: true` is passed, then the cap is from 0 to 1.
 */
export function getTransformOperationProgressEstimator(sourcePaths: string[], outPaths: string[], expectedRatio: number = 1) {
    let sourceEstimated = false;
    let sourceTotalSizeBytes = 0;

    return async function estimate(done?: boolean) {
        if (!sourceEstimated) {
            sourceTotalSizeBytes =
                (await Promise.all(sourcePaths
                    .map(estimatePathSize)
                ))
                    .reduce((acc, v) => acc + v);

            sourceEstimated = true;
        }

        if (done)
            return 1;

        let outTotalSize = 0;
        for (const pathStr of outPaths) {
            if (!(await fs.exists(pathStr)))
                continue;

            outTotalSize += await estimatePathSize(pathStr);
        }

        return clamp(outTotalSize / sourceTotalSizeBytes, 0, 1 - Number.MIN_SAFE_INTEGER);
    }
}