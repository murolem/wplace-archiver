import { TilePosition } from '$lib/TilePosition';
import { mapDimensionsInTilesHalf } from '$src/constants';
import { saveGrabby } from '$src/saveGrabby';
import { saveRegion, type Region } from '$src/saveRegion';
import type { GeneralOptions, Size } from '$src/types';
import { Option, program } from '@commander-js/extra-typings';
import { z } from 'zod';
import { saveGrabbyByRegion } from '$src/saveGrabbyByRegion';

function parseTilePosition(value: string): TilePosition {
    try {
        return TilePosition.fromString(value);
    } catch (err) {
        program.error(`failed to parse tile position: expected an integer pair X,Y in range 0-2047; got: ${value}`);
    }
}

function parseSizeOption(value: string): Size {
    const numSchema = z.coerce.number().int().min(1).max(2048);
    try {
        return z.tuple([numSchema, numSchema])
            .transform(([w, h]) => ({ w, h }))
            .parse(value.split(","));
    } catch (err) {
        program.error(`failed to parse size: expected numbers in range 0-2047 formatted W,H; got: ${value}`);
    }
}

function parseTilePixelCount(value: string): number {
    try {
        return z.coerce.number().int().min(1).max(1_000_000)
            .parse(value);
    } catch (err) {
        program.error(`failed to parse radius: expected a number in range 1-1 000 000; got: ${value}`);
    }
}

function getIntRangeParser(from: number, to: number): (value: string) => number {
    return (value: string) => {
        try {
            return z.coerce.number().int().min(from).max(to)
                .parse(value);
        } catch (err) {
            program.error(`failed to parse the value: expected an integer in range ${from}-${to}; got: ${value}`);
        }
    }
}

function getFloatRangeParser(from: number, to: number): (value: string) => number {
    return (value: string) => {
        try {
            return z.coerce.number().min(from).max(to)
                .parse(value);
        } catch (err) {
            program.error(`failed to parse the value: expected an number in range ${from}-${to}; got: ${value}`);
        }
    }
}

/**
 * Copies an array, removing specific entry from the copy and returning the copy array.
 */
function arrayToCopiedWithoutEntry<T extends unknown>(arr: T[], entry: T): T[] {
    const copy = [...arr];
    const i = copy.indexOf(entry);
    if (i !== -1)
        copy.splice(i, 1);

    return copy;
}

const generalOpts: GeneralOptions = program
    .name("wplace_archiver")
    .description("Archiver utility for https://wplace.live")
    .option("-o, --out <dirpath>", "Output directory path for all that is archived. Each mode customizes its saving path further, so each mode help for details.", "archives")
    .option("--rps, --requests-per-second <number>", "Requests per second. Higher value could cause Too Many Requests errors, significantly lowering the RPS.", getIntRangeParser(1, Infinity), 20)
    .option("--rc, --request-concurrency <number>", "Request concurrency. How many requests are allowed to run in parallel? Higher value could cause Too Many Requests errors, significantly lowering RPS.", getIntRangeParser(1, Infinity), 10)
    .option("-l, --loop", "Run archiving continuously? Once archival is complete, it will run again. Saving path may be altered - see each mode for details.", false)
    .option("--cycle-start-delay <seconds>", "Delay before starting an archival cycle.", getIntRangeParser(0, Infinity), 3)
    .option("--respect-429-delay, --respect-too-many-requests-delay", "If set, the retry delay for Too Many Requests error included by Retry-After header will be respected. By default, no retry delay is applied on this error - it is retried immediately instead (if slots are available). This is done to achieve higher RPS, and works due to poor rate limiting implementation on Wplace part.", false)
    .opts();

const regionSubcommands = ["size", "to", "radius"];
program.command("region")
    .description("Captures a region of tiles.")
    .argument("<tile X,Y>", "Position of the starting tile formatted as X,Y. Each value must be from 0 to 2047.", parseTilePosition)
    .option("--out2 <dirpath>", `\
Output directory path. Appended to general variant of --out like this: '<general dirpath>/<this dirpath>'. 
By default, is: (see default value)

Where:
- %tile_x and %tile_x are positions of the upper left corner of a region like '1238' and '639'
- %width_tiles and height_tiles are dimensions of the region like '30' and '40'
- %date is a start time of archival cycle, an iso-like string like 2025-08-15T12-11-09.590Z
- %duration is a duration that archival took like '16m' or '1h7m'. It is added after a cycle is complete.

Strings that match variables described above (starting with '%'), will be replaced by their values.`, 'regions/region-X%tile_x-Y%tile_y-W%width_tiles-H%height_tiles/%date+%duration')
    .addOption(new Option("--size <W,H>", "Size in tiles formatted as W,H, where W is width and H is height. This will extend the region horizontally right and vertically down. Each value must be from 1 to 2048.")
        .conflicts(arrayToCopiedWithoutEntry(regionSubcommands, "size"))
        .argParser(parseSizeOption)
    )
    .addOption(new Option("--radius <R>", `Square radius in tiles. Sets '--center'. Each value must be from 1 to ${mapDimensionsInTilesHalf}.`)
        .conflicts(arrayToCopiedWithoutEntry(regionSubcommands, "radius"))
        .argParser(getIntRangeParser(1, mapDimensionsInTilesHalf))
    )
    .addOption(new Option("--to <X,Y>", "Position of the ending tile formatted as X,Y, where W is width and H is height. Each value must be from 0 to 2047.")
        .conflicts(arrayToCopiedWithoutEntry(regionSubcommands, "to"))
        .argParser(parseTilePosition)
    )
    .addOption(new Option("--center", "If set, changes how the region extends to all directions, making the starting tile the center of it.")
        .default(false)
        .conflicts("--to")
    )
    .action(async (xy, opts) => {
        let region: Region;

        if (opts.size) {
            if (opts.center) {
                const halfSizeInt: Size = {
                    // make sure that the size can be divided by 2 without a remainder
                    w: Math.ceil(opts.size.w / 2),
                    h: Math.ceil(opts.size.h / 2),
                }

                region = {
                    xy1: {
                        x: xy.x - halfSizeInt.w,
                        y: xy.y - halfSizeInt.h,
                    },
                    xy2: {
                        x: xy.x + halfSizeInt.w,
                        y: xy.y + halfSizeInt.h,
                    },
                }
            } else {
                region = {
                    xy1: xy,
                    xy2: {
                        x: xy.x + opts.size.w - 1,
                        y: xy.y + opts.size.h - 1,
                    }
                }
            }
        } else if (opts.to) {
            region = {
                xy1: xy,
                xy2: opts.to
            }

            if (region.xy2.x < region.xy1.x) {
                [region.xy1, region.xy2] = [region.xy2, region.xy1];
            }

            if (region.xy2.y < region.xy1.y) {
                const lowerSideY = region.xy1.y;
                region.xy1.y = region.xy2.y;
                region.xy2.y = lowerSideY;
            }
        } else if (opts.radius) {
            region = {
                xy1: {
                    x: xy.x - opts.radius,
                    y: xy.y - opts.radius,
                },
                xy2: {
                    x: xy.x + opts.radius,
                    y: xy.y + opts.radius,
                }
            }
        } else {
            const commandsInstructionStr = regionSubcommands.map(str => "--" + str).join(", ")
            program.error(`no region size defining option provided; use one of: ${commandsInstructionStr}`);
        }

        await saveRegion({ region, out: opts.out2 }, generalOpts);

        // hard exit in case of a dangling promise
        process.exit();
    });

const grabbyOut2Default =
    'grabs/tiles/X%tile_x-Y%tile_y/%date+%duration';
const grabbyOut2DefaultInLeaderboardMode =
    'grabs/by region/%period/%country_flag %country/%place #%place_number';
const grabbyOut3Default = '%date+%duration';

program.command("grabby")
    .description("Grabs tiles around starting tile until no tiles without pixels above threshold are left.")
    .argument("[tile X,Y]", "Position of starting tile formatted as X,Y. Each value must be from 0 to 2047.", parseTilePosition)
    .option("--out2 <dirpath>", `\
Output directory path. Appended to --out like so: 
'--out/--out2'

- Default in normal mode: '${grabbyOut2Default}'
- Default in leaderboard mode: '${grabbyOut2DefaultInLeaderboardMode}'`)
    .option("--out3 <dirpath>", `\
Extra output directory path. Only used in leaderboard mode. Appended to --out2 like so:
'--out/--out2/--out3'`, grabbyOut3Default)
    .option("--pixel-threshold <amount>", "Minimum amount of pixels in a tile for it to be saved. Value from 1 to 1 000 000.", parseTilePixelCount, 10)
    .option("--tile-tolerance <radius>", "Circular radius around a tile to check surrounding tiles. Value from 1.5 to 15.", getFloatRangeParser(1.5, 15), 1.5)
    .option("-r, --radius <value>", "Maximum circular radius to go to from starting tile. Value from 1 to 250.", getFloatRangeParser(1, 250), 15)
    .option("--leaderboard", "Enables fetching from leaderboard. Requires selecting category and period. Alters --out2 (see leaderboard category options for details).", false)
    .option("--by-region", `\
Sets by-region category for leaderboard fetching. Changes --out2 path (if it's not been set):
'${grabbyOut2DefaultInLeaderboardMode}'

Where:
- %period is period like 'all-time'
- %country_flag is country flag emoji like 🇦🇫 (may be displayed improperly due to console formatting)
- %country is country name like Afghanistan
- %place is place name like Seoul
- %place_number is place number like 14

Additionally, --leaderboard-out is appended to this path.

Other variables are described in help for --out.`, false)
    .option("--all-time", "Sets all-time period for leaderboard fetching.", false)
    .action(async (xy, opts) => {
        if (opts.leaderboard) {
            if (!opts.byRegion)
                program.error(`leaderboard category not specified.`);
            else if (!opts.allTime) {
                program.error(`leaderboard period not specified.`);
            }

            await saveGrabbyByRegion({
                period: 'all-time',
                pixelThreshold: opts.pixelThreshold,
                tileTolerance: opts.tileTolerance,
                radius: opts.radius,
                placeOutDirpath: opts.out2 ?? grabbyOut2DefaultInLeaderboardMode,
                fromPlaceOutDirpath: opts.out3
            }, generalOpts);
        } else {
            if (!xy)
                program.error("tile position not specified");

            await saveGrabby({
                startingTile: xy,
                pixelThreshold: opts.pixelThreshold,
                tileTolerance: opts.tileTolerance,
                radius: opts.radius,
                out: opts.out2 ?? grabbyOut2Default
            }, generalOpts);
        }

        // hard exit in case of a dangling promise
        process.exit();
    });

program.parse();