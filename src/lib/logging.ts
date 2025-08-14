import { mapDimensionsInTilesStrLength } from '$src/constants';
import type { Position } from '$src/types';
import { roundToDigit } from '$utils/roundToDigit';

export function getTileLogPrefix(tilePos: Position, opts: {
    progress?: number,
    progressDigitsAfterComma?: number
} = {}): string {
    opts.progressDigitsAfterComma ??= 3;

    const progressStrFmted: string = (() => {
        if (opts.progress === undefined)
            return '';

        const percentage = roundToDigit(opts.progress * 100, opts.progressDigitsAfterComma).toString();
        const parts = percentage.split(".");
        return parts[0].padStart(2, '0')
            + '.'
            + (parts[1] ?? '').padEnd(opts.progressDigitsAfterComma, '0')
            + '%';
    })();

    const colFmted = tilePos.x.toString().padStart(mapDimensionsInTilesStrLength, '0');
    const rowFmted = tilePos.y.toString().padStart(mapDimensionsInTilesStrLength, '0');

    return `${progressStrFmted ? progressStrFmted + ' ' : ''}COL ${colFmted} ROW ${rowFmted}`;
}