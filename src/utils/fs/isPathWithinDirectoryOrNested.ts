import path from 'path';

/** Checks whether given path is within a given directory path or one of its subdirectories. */
export function isPathWithinDirectoryOrNested(pathStr: string, directoryPathStr: string) {
    const relPath = path.relative(directoryPathStr, pathStr);
    return !relPath.startsWith('..');
}