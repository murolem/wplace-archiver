import fs from 'fs/promises';
import { Logger } from '$logger';
const { logFatalAndThrow } = new Logger("lib/fs/createReader");

export type FileReader =
   /**
     * Reads `size` bytes or less and advances. Only reads less if less bytes than requested is available.
     * Once end is reached, each subsequent read will return 0 bytes.
     * @param size N bytes to read.
     * @returns `size` or less bytes.
     */
    (size: number) => Promise<Buffer>;

/**
 * Creates a file reader for file to read in byte chunks.
 * @param filepath Path to file.
 * @returns A function to read byte chunks.
 */
export async function createChunkedFileReader(filepath: string): Promise<FileReader> {
    if (!(await fs.exists(filepath)))
        logFatalAndThrow("failed to read: file does not exists: " + filepath);

    const rh = await fs.open(filepath, 'r');

    return async (size: number): Promise<Buffer> => {
        const res = await rh.read(Buffer.alloc(size), 0, size, null);

        return res.buffer;
    }
}