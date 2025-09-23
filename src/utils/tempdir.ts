import os from 'os';
import path from 'path';
import cryptoRandomString from 'crypto-random-string';
import fs from 'fs-extra';

let tempDirpath: string | null = null;

/**
 * Returns a temporary directory for the program by creating a directory inside OS's temp directory.
 * 
 * Returns the same directory on consecutive calls.
 * 
 * @returns Absolute path to the created directory.
 */
export function getTempdir(): string {
    if (tempDirpath)
        return tempDirpath;

    tempDirpath = path.join(os.tmpdir(), "wplace-archiver-" + cryptoRandomString({ length: 15 }));
    fs.mkdirSync(tempDirpath);
    return tempDirpath;
}