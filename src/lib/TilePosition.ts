import { mapDimensionsInTiles } from '$src/constants';

export class TilePosition {
    get x() { return this._x; }
    set x(value) { this._x = this.constrainTilePositionComponent(value); }
    private _x;

    get y() { return this._y; }
    set y(value) { this._y = this.constrainTilePositionComponent(value); }
    private _y;

    /** Creates a new tile position. 
     * 
     * If given position is outside the map bounds, it will be constrained to the map bounds retaining the same map position. */
    constructor(x: number, y: number) {
        this._x = this.constrainTilePositionComponent(x);
        this._y = this.constrainTilePositionComponent(y);
    }

    static fromString(str: string): TilePosition {
        const parts = str.split(",").map(part => parseInt(part));
        if (parts.length !== 2) {
            console.error(parts);
            throw new Error(`failed to create tile position from string: expected 2 parts, found ${parts.length}: (see above)`);
        }

        return new TilePosition(...parts as [number, number]);
    }

    toString() {
        return this.x + "," + this.y;
    }

    isEqual(other: TilePosition) {
        return this.x === other.x && this.y === other.y;
    }


    constrainTilePositionComponent(comp: number): number {
        if (comp < 0) {
            return mapDimensionsInTiles + (comp % mapDimensionsInTiles);
        } else if (comp > mapDimensionsInTiles) {
            return mapDimensionsInTiles % mapDimensionsInTiles;
        } else {
            return comp;
        }
    }
}