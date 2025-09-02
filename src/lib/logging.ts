import { mapDimensionsInTilesStrLength } from '$src/constants';
import type { Position } from '$src/types';
import { clamp } from '$utils/clamp';
import { roundToDigit } from '$utils/roundToDigit';
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
 * @param progress01 
 * @param digitsAfterComma 
 * @returns 
 * @throws {ZodError} if {@link progress01} is not within 0 to 1 range.
 * @throws {ZodError} if {@link digitsAfterComma} is not integer or is negative.
 */
export function formatProgressToPercentage(progress01: number, digitsAfterComma: number): string {
    progress01 = clamp(progress01, 0, 1);
    digitsAfterComma = clamp(digitsAfterComma, 0, Infinity);

    let percentageNum = roundToDigit(progress01 * 100, digitsAfterComma);
    // do not show 100% until actually at the end
    if (progress01 < 1 && percentageNum === 100) {
        percentageNum = 99;
    }

    const parts = percentageNum.toString().split(".");
    const fmtedLeft = parts[0].padStart(2, '0');
    if (digitsAfterComma === 0)
        return fmtedLeft + '%';
    else
        return fmtedLeft
            + '.'
            + (parts[1] ?? '').padEnd(digitsAfterComma, '0')
            + '%';
}