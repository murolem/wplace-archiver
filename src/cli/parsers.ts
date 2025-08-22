import type { GeneralOpts } from '$cli/types';
import { TilePosition } from '$lib/TilePosition';
import { outVariableNames, outVariableRegex, type OutVariableName } from '$src/cli/constants';
import type { Size } from '$src/types';
import { program } from 'commander';
import isValidPath from 'is-valid-path';
import z from 'zod';

export function parseOutPath(value: string): string {
    // check if path is legal
    if (!isValidPath(value))
        program.error("failed to parse out path: path is invalid");

    // check validity of variables
    const vars = outVariableRegex.exec(value);
    if (!vars)
        return value;

    // check that variables are known
    for (const varname of vars) {
        if (!outVariableNames.includes(varname as any))
            program.error(`failed to parse out path: encountered unknown variable '${varname}'`);
    }

    return value;
}

export function parseOutPathsIntermediate(args: {
    out: string | undefined,
    errOut: string | false | undefined,
    outFallback: string,
    errOutFallback: string
}): Pick<GeneralOpts, 'out' | 'errOut'> {
    return {
        out: args.out ?? args.outFallback,
        errOut: args.errOut === undefined
            ? args.errOutFallback
            : args.errOut === false
                ? null
                : args.errOut
    }
}

/** Attempts to parse tile position from a serialized tile position. */
export function parseTilePosition(value: string): TilePosition {
    try {
        return TilePosition.fromString(value);
    } catch (err) {
        program.error(`failed to parse tile position: expected an integer pair X,Y in range 0-2047; got: ${value}`);
    }
}

/** Attempts to parse tile position from a string, which could be:
- Tile position as 'X,Y', like '1270,801' (Tahrawa, Iraq).
- Latitude (vertical) and longitude (horizontal) and  as 'LAT,LON', like '35.0074863,135.7885488' (Kioto, Japan).
- WPlace place share link like 'https://wplace.live/?lat=-34.67000883965724&lng=-58.43170931572267&zoom=11.226476250486172' (Buenos Aires, Argentina)
*/
export function parseTilePositionLike(value: string): TilePosition {
    let res = TilePosition.tryFromString(value);
    if (res)
        return res;

    res = TilePosition.tryFromLatLonStr(value);
    if (res)
        return res;

    try {
        const url = new URL(value);
        const params = new URLSearchParams(url.search);
        const lat = params.get("lat");
        const lon = params.get("lng");
        if (lon && lat) {
            return TilePosition.fromLatLon(parseFloat(lat), parseFloat(lon));
        }
    } catch (err) { }

    program.error(`failed to parse tile position-like: no matching format found for string: '${value}'`);
}

export function parseSizeOption(value: string): Size {
    const numSchema = z.coerce.number().int().min(1).max(2048);
    try {
        return z.tuple([numSchema, numSchema])
            .transform(([w, h]) => ({ w, h }))
            .parse(value.split(","));
    } catch (err) {
        program.error(`failed to parse size: expected numbers in range 0-2047 formatted W,H; got: ${value}`);
    }
}

export function parseTilePixelCount(value: string): number {
    try {
        return z.coerce.number().int().min(1).max(1_000_000)
            .parse(value);
    } catch (err) {
        program.error(`failed to parse radius: expected a number in range 1-1 000 000; got: ${value}`);
    }
}

export function getIntRangeParser(from: number, to: number): (value: string) => number {
    return (value: string) => {
        try {
            return z.coerce.number().int().min(from).max(to)
                .parse(value);
        } catch (err) {
            program.error(`failed to parse the value: expected an integer in range ${from}-${to}; got: ${value}`);
        }
    }
}

export function getFloatRangeParser(from: number, to: number): (value: string) => number {
    return (value: string) => {
        try {
            return z.coerce.number().min(from).max(to)
                .parse(value);
        } catch (err) {
            program.error(`failed to parse the value: expected an number in range ${from}-${to}; got: ${value}`);
        }
    }
}