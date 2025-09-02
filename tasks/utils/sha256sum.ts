import fs from 'fs-extra';
import crypto from 'crypto';
import streamp from 'stream/promises';
import { Logger } from '$logger';
const { logFatalAndThrow } = new Logger("sha256sum");

/**
 * Computes sha256 hash of a file.
 * @param filepath Filepath.
 * @throws {Error} if file does not exist.
 */
export async function sha256sum(filepath: string): Promise<string> {
    if (!(fs.exists(filepath)))
        logFatalAndThrow("failed to compute hash: filepath does not exist: " + filepath);

    const filestream = fs.createReadStream(filepath);
    const hasher = crypto.createHash('sha256');
    await streamp.pipeline(filestream, hasher);

    return hasher.digest('hex');
}