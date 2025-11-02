import fs from 'fs-extra';
import path from 'path';

/** Purges a specified directory if it's empty. Does the same check for parent directory and so on, until a filled directory is found. */
export async function tryPurgeEmptyDirAndEmptyParents(pathStr: string) {
    if (await fs.exists(pathStr) && (await fs.readdir(pathStr)).length === 0) {
        await fs.rmdir(pathStr);
        await tryPurgeEmptyDirAndEmptyParents(path.parse(pathStr).dir);
    }
}