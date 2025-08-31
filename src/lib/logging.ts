import { mapDimensionsInTilesStrLength } from '$src/constants';
import type { Position } from '$src/types';
import { roundToDigit } from '$utils/roundToDigit';

export function getTileLogPrefix(tilePos: Position, opts: {
    progress?: number,
    progressDigitsAfterComma?: number
} = {}): string {
    opts.progressDigitsAfterComma ??= 3;

    const progressStrFmted: string = opts.progress
        ? formatProgressToPercentage(opts.progress, opts.progressDigitsAfterComma)
        : '';

    const colFmted = tilePos.x.toString().padStart(mapDimensionsInTilesStrLength, '0');
    const rowFmted = tilePos.y.toString().padStart(mapDimensionsInTilesStrLength, '0');

    return `${progressStrFmted ? progressStrFmted + ' ' : ''}COL ${colFmted} ROW ${rowFmted}`;
}

/**
 * Formats progress - a number from 0 to 1 - to percentage - a string `NN%.NNN[N]`.
 * @param progress01 
 * @param digitsAfterComma 
 * @returns 
 */
export function formatProgressToPercentage(progress01: number, digitsAfterComma: number): string {
    const percentage = roundToDigit(progress01 * 100, digitsAfterComma).toString();
    const parts = percentage.split(".");
    return parts[0].padStart(2, '0')
        + '.'
        + (parts[1] ?? '').padEnd(digitsAfterComma, '0')
        + '%';
}