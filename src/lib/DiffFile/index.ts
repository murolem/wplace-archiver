import type { StringOr } from '$utils/stringOr';
import { pipe, z, ZodType } from 'zod';
import fs from 'fs/promises';
import { pipeline } from 'node:stream/promises';
import { text } from 'node:stream/consumers';
import { Logger } from '$logger';
import { getModuleFilenameNoExt } from '$utils/getModuleFilename';
import { err, ok, type Result } from 'neverthrow';
const { logDebug, logInfo, logFatalAndThrow } = new Logger(getModuleFilenameNoExt(__filename));

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const H_MAGIC = "!WPDIFF!";

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
     * Checks whether given file is a diff file.
     * @param filepath 
     */
    static async isDiffFile(filepath: string): boolean {

    }
}
