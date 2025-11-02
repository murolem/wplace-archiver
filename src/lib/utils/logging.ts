import { mapDimensionsInTilesStrLength } from '$src/constants';
import type { Position } from '$src/types';
import { clamp } from '$utils/math/clamp';
import { roundToDigit } from '$utils/math/roundToDigit';
import z from 'zod';

const progress01Schema = z.number().min(0).max(1);
const digitsAfterCommaSchema = z.int().min(0);

export function getTileLogPrefix(tilePos: Position, opts: {
    progress?: number,
    progressDigitsAfterComma?: number
} = {}): string {
    opts.progressDigitsAfterComma ??= 3;

    const progressStrFmted: string = opts.progress !== undefined
        ? formatProgressToPercentage(opts.progress, opts.progressDigitsAfterComma)
        : '';

    const colFmted = tilePos.x.toString().padStart(mapDimensionsInTilesStrLength, '0');
    const rowFmted = tilePos.y.toString().padStart(mapDimensionsInTilesStrLength, '0');

    return `${progressStrFmted ? progressStrFmted + ' ' : ''}COL ${colFmted} ROW ${rowFmted}`;
}

/**
 * Formats progress - a number from 0 to 1 - to percentage - a string `NN.[NNN[N]]%`.
 * The returned number is tweaked in bit in a few cases:
 * - If {@link digitsAfterComma} is 0, progress is > 0.0, and it rounds to 0%, it is then instead rounded up to 1%.
 * - If {@link digitsAfterComma} is 0, progress is < 1.0, and rounds to 100%, it is then instead rounded down to 99%.
 * 
 * @param progress01 
 * @param digitsAfterComma 
 * @returns 
 * @throws {ZodError} if {@link progress01} is not within 0 to 1 range.
 * @throws {ZodError} if {@link digitsAfterComma} is not integer or is negative.
 */
export function formatProgressToPercentage(progress01: number, digitsAfterComma: number = 0): string {
    progress01 = clamp(progress01, 0, 1);
    digitsAfterComma = clamp(digitsAfterComma, 0, Infinity);

    let progress0100Round = roundToDigit(progress01 * 100, digitsAfterComma);
    if (digitsAfterComma === 0) {
        if (progress01 > 0 && progress0100Round === 0)
            progress0100Round = 1;
        else if (progress01 < 1 && progress0100Round === 100)
            progress0100Round = 99;
    }

    return formatPercentageNum(progress0100Round);
}

/** Formats number from 0 to 100 to a string with percentage with specified number of digits after comma. */
export function formatPercentageNum(digitsAfterComma: number): string {
    const parts = digitsAfterComma.toString().split(".");
    const fmtedLeft = parts[0].padStart(2, '0');
    if (digitsAfterComma === 0)
        return fmtedLeft + '%';
    else
        return fmtedLeft
            + '.'
            + (parts[1] ?? '').padEnd(digitsAfterComma, '0')
            + '%';
}