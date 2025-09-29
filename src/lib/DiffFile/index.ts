import fs from 'fs';
import { Logger } from '$logger';
import { getModuleFilenameNoExt } from '$utils/getModuleFilename';
import { DIFF_META_H_MAGIC, DIFF_META_H_MAGIC_BYTELEN } from '$lib/DiffFile/metadata';
import { createFileReader } from '$lib/fs/createFileReader';
import { Encoder } from '$lib/DiffFile/encoder';
const { logDebug, logInfo, logFatalAndThrow } = new Logger(getModuleFilenameNoExt(__filename));
Logger.setLogLevel('DEBUG');

/**
 * Archive diff file, `.wpd`.
 * 
 * Represents changes between two or more archives.
 */
export class DiffFile {
    /**
     * Load diff file from disk.
     * @param filepath 
     * @throws {Error} If load fails (file doesn't exists, format mismatch, etc.).
     */
    static async load(filepath: string): Promise<DiffFile> {

    }

    /**
     * Compute a diff between two tiles.
     * @param baseTileFilepath Path to tile 1.
     * @param topTileFilepath Path to tile 2. 
     */
    static async diff(baseTileFilepath: string, topTileFilepath: string): Promise<DiffFile> {

    }

    /**
     * Write diff file to disk.
     */
    async write(filepath: string): Promise<void> {
        // const headerBytes =         
    }

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
}

// const encoded = diffFileEncoder.encode({
//     MAGIC: H_MAGIC,
//     VERSION: 1,
//     DIFF_TYPE: 'DIFFERENTIAL',
//     DIFF_COUNT: 4,
//     DIFF_OFFSETS: [1, 2, 3],
//     DIFF_SOWUTHING_VEWY_IMPOWTANT: 'owosssss'
// });
// await fsPromises.writeFile('./file-encoded', encoded);

console.log(await DiffFile.isDiffFile("./file-encoded"))

// const decoded = diffFileEncoder.decodeBytes(encoded);
// const decoded2 = diffFileEncoder.decodeBytes(await fsPromises.readFile('./file-encoded'));
// const decoded3 = await diffFileEncoder.decodeFile('./file-encoded');
// console.log(decoded);
// console.log(decoded2);
// console.log(decoded3);

// console.log(decoded);
// const buf = Buffer.alloc(BYTELEN_NUMBER);
// buf.writeInt32LE(1234);
// // console.log(buf.readInt32LE());
// await fs.writeFile('./file3', buf);
// const buf2 = await fs.readFile('./file3');
// console.log(buf2.readInt32LE());
// .decode(Buffer.alloc(200));