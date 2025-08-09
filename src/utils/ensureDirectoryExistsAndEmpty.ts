import { isPathWithinDirectoryOrNested } from './isPathWithinDirectoryOrNested';
import fs from 'fs-extra';
import path from 'path';
import { Logger } from '$logger';

const logger = new Logger("utils/ensureDirectoryExistsEmpty");
const { logDebug, logInfo, logWarn, logFatal } = logger;

const cwd = process.cwd();

/** 
 * Ensures that a given directory exists and is empty.
 * 
 * If directory doesn't exist, creates it.
 * If it exists, **removes it and its contents** and creates it.
 * @param dirpath Directory path.
 * @throws {Error} If the path is outside the project directory. A safety measure to not delete `system32` or `/` because Ill somehow manage.
 */
export function ensureDirectoryExistsAndEmpty(dirpath: string): void {
    if (!isPathWithinDirectoryOrNested(dirpath, cwd)) {
        logFatal({
            msg: "failed to ensure an empty directory exists: directory path is outside of the process bounds",
            throw: true,
            data: {
                dirpath
            }
        });
    }

    if (fs.existsSync(dirpath)) {
        if (!fs.statSync(dirpath).isDirectory()) {
            logFatal({
                msg: "failed to ensure an empty directory exists: directory path is a file path",
                throw: true,
                data: {
                    dirpath
                }
            });
        }

        // if dir is empty, do nothing
        if (fs.readdirSync(dirpath).length === 0) {
            return;
        }

        fs.removeSync(dirpath);
    }

    fs.ensureDirSync(dirpath);
}