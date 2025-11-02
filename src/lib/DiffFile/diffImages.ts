import { Jimp, type Bitmap } from 'jimp';
import { Logger } from '$logger';
import fs from 'fs-extra';
const { logFatalAndThrow } = new Logger("DiffFile/diff");

/** Same as `<<`, but supports operations past 32 bit. */
function shiftLeft(number: number, shift: number) {
    return number * Math.pow(2, shift);
}

/** Same as `>>>`, but supports operations past 32 bit. */
function shiftRightUnsigned(number: number, shift: number) {
    return Math.trunc(number / Math.pow(2, shift));
}

/** Same as `|`, but supports operations past 32 bit. */
function bitwiseOr(a: number, b: number): number {
    let result: number = 0;
    let n: number = 1;
    while ((a > 0) || (b > 0)) {
        if (((a % 2) == 1) || ((b % 2) == 1)) {
            result += n;
        }
        a = Math.trunc(a / 2);
        b = Math.trunc(b / 2);
        n = n * 2;
    }
    return result;
}

/** Same as `&`, but supports operations past 32 bit. */
function bitwiseAnd(a: number, b: number): number {
    let result: number = 0;
    let n: number = 1;
    while ((a > 0) || (b > 0)) {
        if (((a % 2) == 1) && ((b % 2) == 1)) {
            result += n;
        }
        a = Math.trunc(a / 2);
        b = Math.trunc(b / 2);
        n = n * 2;
    }
    return result;
}

const BITMASK_X = (2 ** 10 - 1);
const BITMASK_Y = (2 ** 10 - 1) << 10;
const BITMASK_RGBA = shiftLeft(2 ** 32 - 1, 20);

const decodeDiffResult = (encoded: number): { x: number, y: number, rgba: number } => {
    return {
        x: encoded & BITMASK_X,
        y: (encoded & BITMASK_Y) >> 10,
        rgba: shiftRightUnsigned(bitwiseAnd(encoded, BITMASK_RGBA), 20)
    }
}


/** TODO: write desc */
export type DiffResult = number[];

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

    const pixelsTotal = width * height;
    const base32 = new Uint32Array(baseBitmap.data.buffer, pixelsTotal);
    const top32 = new Uint32Array(topBitmap.data.buffer, pixelsTotal);

    let identical = true;
    // compare each pixel
    for (let i = 0; i < pixelsTotal; i++) {
        if (base32[i] !== top32[i]) { identical = false; break; }
    }
    if (identical) { // fast path if identical
        return [];
    }

    // compare each pixel of one image against the other one
    const transparent32 = 256;
    const res: DiffResult = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const pos = i * 4;

            if (base32[i] === top32[i])
                continue;

            const pixel32 = top32[i];

            const encoded = bitwiseOr(
                x // x; offset 0 size 10
                | (y << 10), // y; offset 10 size 10
                shiftLeft(pixel32, 20) // rgba; offset 20 size 32
            );

            // const decoded = decodeDiffResult(encoded);

            res.push(encoded);
        }
    }

    return res;
}

/** Returns specified image is if it was diffed in its entirety. */
export async function asIs(imageFilepath: string): Promise<DiffResult> {
    const bitmap = (await Jimp.read(imageFilepath)).bitmap;
    const width = bitmap.width;
    const height = bitmap.height;

    const pixelsTotal = width * height;
    const bitmap32 = new Uint32Array(bitmap.data.buffer, pixelsTotal);

    const res: DiffResult = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const pos = i * 4;

            // check alpha channel, skip empty pixels
            if (bitmap.data[pos + 3] === 0)
                continue;

            const pixel32 = bitmap.data[i];

            const encoded = bitwiseOr(
                x // x; offset 0 size 10
                | (y << 10), // y; offset 10 size 10
                shiftLeft(pixel32, 20) // rgba; offset 20 size 32
            );

            res.push(encoded);
        }
    }

    return res;
}