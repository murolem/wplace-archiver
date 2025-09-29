import fs from 'fs/promises';
import { Logger } from '$logger';
const { logFatalAndThrow } = new Logger("lib/fs/createReader");

export type FileReader =
    /** 
     * Reads specified number of bytes from the file, moved the reader by number of read bytes.
     * 
     * If number of bytes read is less than the requested amount, then the end of the stream has been reached,
     * and what is left has been read.
     */
    (size: number) => Promise<Buffer>;

/**
 * Creates a file reader on the given file.
 * @param filepath 
 * @returns A reader function that reads contents of that file sequentially, in specified byte chunks.
 */
export async function createFileReader(filepath: string): Promise<FileReader> {
    if (!(await fs.exists(filepath)))
        logFatalAndThrow("failed to read: file does not exists: " + filepath);

    const rh = await fs.open(filepath, 'r');

    /** fsdf */
    const readBytes = async (size: number): Promise<Buffer> => {
        const res = await rh.read(Buffer.alloc(size), 0, size, null);
        // if (res.bytesRead !== size)
        //     logFatalAndThrow(`failed to read: requested read of ${size} bytes, but got ${res.bytesRead} bytes`);

        return res.buffer;
    }

    return readBytes;
}