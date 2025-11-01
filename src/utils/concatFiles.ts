import { Logger } from '$logger';
import { getModuleFilenameNoExt } from '$utils/getModuleFilename';
import { spawn } from '$utils/spawn';
import fs from 'fs-extra';
import { glob } from 'glob';
const { logFatalAndThrow } = new Logger(getModuleFilenameNoExt(__filename));

const command = (() => {
    switch (process.platform) {
        case 'win32': return 'type';
        case 'linux': return 'cat';
        default: logFatalAndThrow(`unsupported platform '${process.platform}'`); throw '';//type guard
    }
})();

/**
 * Concatenates files using a Glob pattern.
 * 
 * Only works on Windows and Linux.
 * 
 * @param globPattern Glob pattern to find input files.
 * @param out File to concat to.
 * @param cwd Working directory.
 * @throws {Error} If no filepaths match the Glob pattern.
 */
export async function concatFilesGlob(globPattern: string, out: string): Promise<void> {
    const filepaths = await (await glob(globPattern)).sort();
    if (filepaths.length === 0)
        logFatalAndThrow("concat failed: no files matched glob: " + globPattern);

    await concatFilepaths(filepaths, out);
}

/**
 * Concatenates files.
 * 
 * Only works on Windows and Linux.
 * 
 * @param filepaths List of filepaths to concat.
 * @param out File to concat to.
 * @param cwd Working directory.
 * @throws {Error} If files array is empty.
 */
export async function concatFilepaths(filepaths: string[], out: string): Promise<void> {
    if (filepaths.length === 0)
        logFatalAndThrow("concat failed: no filepaths provided");

    const res = await spawn(command, {
        args: filepaths,
        stdout: fs.createWriteStream(out)
    });
    // if (res.isErr())
    //     logFatalAndThrow({
    //         msg: "concat failed",
    //         data: {
    //             error: res.error
    //         }
    //     })
}