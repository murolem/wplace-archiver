
const textEncoder = new TextEncoder();

/** Magic number for the file format. */
const H_MAGIC = textEncoder.encode("!WPDIFF!");
/** Version of the file format. */
const H_VERSION = new Uint8Array(1);
/** SHA-256 hash of the base archive. */
const H_BASE_ARCHIVE_SHA256 = new Uint8Array(32);
/** SHA-256 hash of the diff archive. */
const H_DIFF_ARCHIVE_SHA256 = new Uint8Array(32);
/** Diff archive title. */
const H_DIFF_ARCHIVE_TITLE = new Uint8Array(256);
/** Number of changes. For 2048 x 2048 map (4 mil), it is 2 ^ 22. */
const H_CHANGES = new Uint8Array(22);
/** Number of additions. */
const H_ADDITIONS = new Uint8Array(22);
/** Number of modifies. */
const H_MODIFIES = new Uint8Array(22);
/** Number of deletions. */
const H_DELETIONS = new Uint8Array(22);
const H_EXTRA_VERYIMPORTANT = textEncoder.encode(">///<");

export const diffFileSchema: Uint8Array[] = [
    H_MAGIC,
    H_VERSION,
    H_BASE_ARCHIVE_SHA256,
    H_DIFF_ARCHIVE_SHA256,
    H_DIFF_ARCHIVE_TITLE,
    H_CHANGES,
    H_ADDITIONS,
    H_MODIFIES,
    H_DELETIONS,
    H_EXTRA_VERYIMPORTANT
]

/**
 * Archive diff file, `.wpd`.
 * 
 * Represents changes between two archives.
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
        const headerBytes =         
    }
}