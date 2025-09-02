import fs from 'fs-extra';
import { Logger } from '$logger';
import { sha256sum } from '$tasks/utils/sha256sum';
const { logFatalAndThrow } = new Logger("checkIntegrity");

/**
 * Checks for file integrity using a SHA256 hash.
 * @param filepath Path to file to check.
 * @param expectedHash Expected SHA256 hash.
 * @throws {Error} if file does not exist.
 */
export async function checkIntegrity(filepath: string, expectedHash: string): Promise<boolean> {
    if (!(fs.exists(filepath)))
        logFatalAndThrow("failed to compute hash: filepath does not exist: " + filepath);

    const hash = await sha256sum(filepath);
    return hash === expectedHash;
}