import path from 'path';
import fs from 'fs-extra';
import type { Position } from '$src/types';

export function getTileWriter(outDirpath: string) {
    return async (tilePos: Position, imgData: ArrayBuffer) => {
        const outFilepath = path.join(outDirpath, tilePos.x.toString(), tilePos.y + '.png');
        await fs.ensureFile(outFilepath);
        await fs.writeFile(outFilepath, Buffer.from(imgData));
    }
}

export function getErrorWriter(errorsDirpath: string) {
    return (tilePos: Position, attemptIndex: number, data: string): void => {
        const outFilepath = path.join(errorsDirpath, `C${tilePos.x}-R${tilePos.y}-N${attemptIndex}.txt`)
        fs.writeFile(outFilepath, data);
    }
}