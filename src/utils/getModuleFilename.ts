import path from 'path';

/**
 * Processes module's `__filename` (which is a absolute path to a module), returning only the filename.
 * @param __filename `__filename` variable.
 */
export function getModuleFilename(__filename: string): string {
    return path.parse(__filename).base;
}

/**
 * Processes module's `__filename` (which is a absolute path to a module), returning only the filename without the extension.
 * @param __filename `__filename` variable.
 */
export function getModuleFilenameNoExt(__filename: string): string {
    return path.parse(__filename).name;
}