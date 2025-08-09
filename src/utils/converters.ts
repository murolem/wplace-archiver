export type Position = {
    x: number,
    y: number
}

/** Given an XY position and a width within that space, returns an index to that position.
 * 
 * @param {Size} xyPos 
 * @param {number} width 
 * @returns 
 */
export function convertXyPositionToIndex(xyPos: Position, width: number) {
    return width * xyPos.y + xyPos.x;
}

/** Given an index in a XY space, converts it to XY position within the same space.
 * 
 * @param {number} index 
 * @param {number} width 
 * @returns 
 */
export function convertIndexToXyPosition(index: number, width: number) {
    const row = Math.floor(index / width);
    const col = index - (width * row);
    return {
        x: col,
        y: row
    }
}