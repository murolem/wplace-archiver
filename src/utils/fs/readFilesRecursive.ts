import fs from 'fs-extra';
import { Logger } from '$logger';
import path from 'path';
const logger = new Logger("readFilesRecursive");
const { logFatal } = logger;

/** 
 * Synchronously reads all files in a given directory and its subdirectories.
 * 
 * Returns an array of file paths relative to given directory.
 */
export function readFilesRecursiveSync(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
        logFatal({
            msg: `failed to read files recursively - directory path doesn't exist: ${dirPath}`,
            throw: true
        });
    }

    if (!fs.statSync(dirPath).isDirectory()) {
        logFatal({
            msg: `failed to read files recursively - given path is a not a directory path: ${dirPath}`,
            throw: true
        });
    }

    const result: string[] = [];
    for (const relPath of fs.readdirSync(dirPath, { recursive: true })) {
        const absSourceFilePath = path.join(dirPath, relPath as string);
        if (fs.statSync(absSourceFilePath).isFile())
            result.push(relPath.toString());
    }

    return result;
}

/** 
 * Asynchronously reads all files in a given directory and its subdirectories.
 * 
 * Returns an array of file paths relative to given directory.
 */
export async function readFilesRecursive(dirPath: string): Promise<string[]> {
    if (!(await fs.exists(dirPath))) {
        logFatal({
            msg: `failed to read files recursively - directory path doesn't exist: ${dirPath}`,
            throw: true
        });
    }

    if (!(await fs.stat(dirPath)).isDirectory()) {
        logFatal({
            msg: `failed to read files recursively - given path is a not a directory path: ${dirPath}`,
            throw: true
        });
    }

    const result: string[] = [];
    for (const relPath of await fs.readdir(dirPath, { recursive: true })) {
        const absSourceFilePath = path.join(dirPath, relPath as string);
        if ((await fs.stat(absSourceFilePath)).isFile())
            result.push(relPath.toString());
    }

    return result;
}