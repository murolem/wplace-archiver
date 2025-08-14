import z from 'zod';
import { Vector2 } from '$lib/vector';
import { mapDimensionsInTiles } from '$src/constants';

const tilePosComponentSchema = z.number().int().min(0).max(2047);

export class TilePosition extends Vector2 {
    isValidTilePosition(): boolean {
        if (tilePosComponentSchema.safeParse(this.x).success
            && tilePosComponentSchema.safeParse(this.y).success)
            return true;
        else
            return false;
    }

    ensureWithinMap(): this {
        this.x = this._wrapComponentToMap(this.x);
        this.y = this._wrapComponentToMap(this.y);
        return this;
    }

    static fromString(str: string): TilePosition {
        const parts = str.split(",").map(part => parseInt(part));
        if (parts.length !== 2) {
            console.error(parts);
            throw new Error(`failed to create tile position from string: expected 2 parts, found ${parts.length}: (see above)`);
        }

        return new TilePosition(...parts as [number, number])
            .ensureWithinMap();
    }

    toString() {
        return this.x + "," + this.y;
    }

    private _wrapComponentToMap(comp: number): number {
        if (comp < 0) {
            return mapDimensionsInTiles + (comp % mapDimensionsInTiles);
        } else if (comp > mapDimensionsInTiles) {
            return mapDimensionsInTiles % mapDimensionsInTiles;
        } else {
            return comp;
        }
    }
}