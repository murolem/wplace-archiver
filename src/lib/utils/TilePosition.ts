import z from 'zod';
import { Vector2 } from '$lib/vector';
import { mapDimensionsInTiles } from '$src/constants';
import { lat2tile, lon2tile } from '$lib/utils/converters';

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

    /** 
     * Parse a serialized tile position like `6,42`. 
     * 
     * If a resulting tile position is outside map dimensions, it will be constrained resulting to the same map position.
     * @throws {Error} on parse failure.
    */
    static fromString(str: string): TilePosition {
        const parsed = TilePosition.tryFromString(str);
        if (!parsed)
            throw new Error(`failed to create tile position from string: expected 2 integers formatted as 'X,Y', found: ${str}`);

        return parsed;
    }

    /** 
     * Try to parse a serialized tile position like `6,42`. 
     * 
     * If a resulting tile position is outside map dimensions, it will be constrained resulting to the same map position.
     * 
     * @returns Parsed tile position or `null` on parse failure.
    */
    static tryFromString(str: string): TilePosition | null {
        let parts: any[] = str.split(",")
        // no decimals allowed
        if (parts.some(part => part.includes(".")))
            return null;
        else if (parts.length !== 2)
            return null;

        try {
            parts = parts.map(part => parseInt(part))
        } catch (err) {
            return null;
        }

        return new TilePosition(...parts as [number, number])
            .ensureWithinMap();
    }

    /** 
     * Create a tile position from longitude and latitude.
    */
    static fromLatLon(lat: number, lon: number): TilePosition {
        return new TilePosition(
            lon2tile(lon, 11),
            lat2tile(lat, 11),
        )
    }

    /** 
     * Attempt to create a tile position from latitude and longitude string formatted as `LAT,LON`.
     * 
     * @returns Tile position or `null` on conversion failure.
    */
    static tryFromLatLonStr(str: string): TilePosition | null {
        let parts: any[] = str.split(",")
        if (parts.length !== 2)
            return null;

        try {
            parts = parts.map(part => parseFloat(part))
        } catch (err) {
            return null;
        }

        return TilePosition.fromLatLon(parts[0], parts[1]);
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