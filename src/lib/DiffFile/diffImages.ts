import { Jimp, type Bitmap } from 'jimp';
import { Logger } from '$logger';
import fs from 'fs-extra';
const { logFatalAndThrow } = new Logger("DiffFile/diff");

export type PixelPosition = {
    x: number,
    y: number
}

export type PixelColor = {
    r: number,
    g: number,
    b: number
}

export type Pixel = PixelPosition & PixelColor;

export type DiffResult = {
    set: Pixel[],
    erase: PixelPosition[]
}

/**
 * Diffs 2 images, returning a record mapping type of change to UInt32 pixels (4 channels).
 * 
 * The code is loosely based off of pixelmatch's lib diff code.
 * @param baseBitmap Base bitmap.
 * @param topBitmap Top bitmap.
 * @returns Diff.
 */
export async function diffImages(baseImageFilepath: string, topImageFilepath: string): Promise<DiffResult> {
    const baseBitmap = (await Jimp.read(baseImageFilepath)).bitmap;
    const topBitmap = (await Jimp.read(topImageFilepath)).bitmap;

    // if (baseBitmap.width !== topBitmap.width || baseBitmap.height !== topBitmap.height)
    //     logFatalAndThrow(`diff failed: image size mismatch (base ${baseBitmap.width}x${baseBitmap.height} != top ${topBitmap.width}x${topBitmap.height}`);

    const width = baseBitmap.width;
    const height = baseBitmap.height;

    // check if images are identical
    const len = width * height;
    const a32 = new Uint32Array(baseBitmap.data.buffer, len);
    const b32 = new Uint32Array(topBitmap.data.buffer, len);
    let identical = true;

    // compare each pixel
    for (let i = 0; i < len; i++) {
        if (a32[i] !== b32[i]) { identical = false; break; }
    }
    if (identical) { // fast path if identical
        return { set: [], erase: [] };
    }

    // compare each pixel of one image against the other one
    const transparent32 = 256;
    const res: DiffResult = { set: [], erase: [] };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const pos = i * 4;

            if (a32[i] === b32[i])
                continue;

            const a1 = baseBitmap.data[pos + 3];
            const a2 = topBitmap.data[pos + 3];

            if (a2 === 0) {
                // created or modified
                res.set.push({
                    x, y,
                    r: topBitmap.data[pos],
                    g: topBitmap.data[pos + 1],
                    b: topBitmap.data[pos + 2],
                });
            } else {
                // erased
                res.erase.push({
                    x, y,
                });
            }
        }
    }

    return res;
}