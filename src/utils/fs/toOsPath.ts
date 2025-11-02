import path from 'path';

const osSep = path.sep;
const otherSep = osSep === '/' ? "\\" : "/";

/**
 * Normalizes path separators in a path to those used on the OS.
 * 
 * Doesn't do anything else like handling duplicate path separators.
 */
export function toOsPath(pathStr: string): string {
    return pathStr.replaceAll(otherSep, osSep);
}