import { TilePosition } from '$lib/TilePosition';
import { mapDimensionsInTilesHalf } from '$src/constants';
import { saveGrabby } from '$src/saveGrabby';
import { saveRegion, type Region } from '$src/saveRegion';
import type { GeneralOptions, Size } from '$src/types';
import { Option, program } from '@commander-js/extra-typings';
import { z } from 'zod';

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
    .option("-o, --out <dirpath>", "Output directory path. By default, is 'archives'. See each mode for how they format their outputs.", "archives")
    .option("--rps, --requests-per-second <number>", "Requests per second. Higher value could cause Too Many Requests errors, significantly lowering the RPS.", getIntRangeParser(1, Infinity), 20)
    .option("--rc, --request-concurrency <number>", "Request concurrency. How many requests are allowed to run in parallel? Higher value could cause Too Many Requests errors, significantly lowering RPS.", getIntRangeParser(1, Infinity), 10)
    .option("-l, --loop", "Run archiving continuously? Once archival is complete, it will run again. Saving path may be altered - see each mode for details.", false)
    .option("--respect-429-delay, --respect-too-many-requests-delay", "If set, the retry delay for Too Many Requests error included by Retry-After header will be respected. By default, no retry delay is applied on this error - it is retried immediately instead (if slots are available). This is done to achieve higher RPS, and works due to poor rate limiting implementation on Wplace part.", false)
    .opts();

const regionSubcommands = ["size", "to", "radius"];
program.command("region")
    .description("Captures a region of tiles.")
    .argument("<tile X,Y>", "Position of the starting tile formatted as X,Y. Each value must be from 0 to 2047.", parseTilePosition)
    .option("--out2 <dirpath>", "Output directory path. Appended to general variant of --out like this: '<general dirpath>/<this dirpath>'. By default, is (see the default value), excluding brackets, where X and Y are positions of the upper left corner of a region, W and H are dimensions of that region, 'date' is a iso-like timestamp of when the archival begun and 'duration' is a duration that archival took (added afterwards). If specifying path that has any of previously mentioned variables (as plain text, no brackets), they will be replaced with actual values'", 'regions/region-Xtile_x-Ytile_y-Wwidth_tiles-Hheight_tiles/date+duration')
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
    });

program.command("grabby")
    .description("Grabs tiles around starting tile until no tiles without pixels above threshold are left.")
    .argument("<tile X,Y>", "Position of starting tile formatted as X,Y. Each value must be from 0 to 2047.", parseTilePosition)
    .option("--out2 <dirpath>", "Output directory path. Appended to general variant of --out like this: '<general dirpath>/<this dirpath>'. By default, is (see the default value), excluding brackets, where X and Y is starting tile position, 'date' is a iso-like timestamp of when the archival begun and 'duration' is a duration that archival took (added afterwards). If specifying path that has any of previously mentioned variables (as plain text, no brackets), they will be replaced with actual values'", 'grabs/Xtile_x-Ytile_y/date+duration')
    .option("--pixel-threshold <amount>", "Minimum amount of pixels in a tile for it to be saved. Value from 1 to 1 000 000.", parseTilePixelCount, 10)
    .option("--tile-tolerance <radius>", "Circular radius around a tile to check surrounding tiles. Value from 1.5 to 15.", getFloatRangeParser(1.5, 15), 1.5)
    .option("-r, --radius <value>", "Maximum circular radius to go to from starting tile. Value from 1 to 250.", getFloatRangeParser(1, 250), 15)
    .action(async (xy, opts) => {
        // await blep({
        //     startingTile: xy,
        //     pixelThreshold: opts.pixelThreshold,
        //     tileTolerance: opts.tileTolerance,
        //     radius: opts.radius,
        //     out: opts.out2
        // }, generalOpts);


        saveGrabby({
            startingTile: xy,
            pixelThreshold: opts.pixelThreshold,
            tileTolerance: opts.tileTolerance,
            radius: opts.radius,
            out: opts.out2
        }, generalOpts);
    });

program.parse();


// async function blep(modeOpts: GrabbyOpts, generalOpts: GeneralOptions) {
//     type RegionSchema = z.infer<typeof regionSchema>;
//     const regionSchema = z.object({
//         "id": z.number(), // ex: 115328,
//         "name": z.string(),// ex: "Mérida",
//         "cityId": z.number(), // ex: 2142,
//         "number": z.number(), // ex: 56,
//         "countryId": z.number(), // ex: 140,
//         "pixelsPainted": z.number(), // ex: 861488,
//         "lastLatitude": z.number(), // ex: 21.003373619322986,
//         "lastLongitude": z.number(), // ex: -89.58875976562501
//     });

//     type RegionSchemaPlus = RegionSchema & { tileX: number, tileY: number };

//     const placedToFetch = 50;
//     const placesRes: RegionSchemaPlus[] = [];

//     console.log(`fetching ${placedToFetch} places`)

//     let index = 0;
//     while (placesRes.length < placedToFetch) {
//         const leftToAdd = placedToFetch - placesRes.length;

//         const url = `https://backend.wplace.live/leaderboard/region/all-time/${index++}`;
//         console.log("fetching: " + url);
//         let places;
//         let attemptIndex = 0;
//         while (true) {
//             const dotsArr = [
//                 "",
//                 ".",
//                 "..",
//                 "...",
//                 " ..",
//                 "  .",
//                 "   ",
//             ];
//             const dots1 = dotsArr[attemptIndex % dotsArr.length];
//             const dots2 = dotsArr[(dotsArr.length - 1) - attemptIndex % dotsArr.length];

//             console.log(`${dots2}attempting${dots1}`)
//             places = await fetch(url)
//                 .then(res => res.json());

//             if ((typeof places === 'object' && places.status === 500)) {
//                 await wait(250);

//                 attemptIndex++;
//                 continue;
//             }

//             places = regionSchema.array().parse(places);
//             break;
//         }

//         if (places.length === 0) {
//             console.warn("places fetched length is 0");
//             break;
//         }

//         console.log(places);
//         const placesMapped = places.map(mapPlace);

//         const placesBeforeLen = placesRes.length;
//         if (leftToAdd >= places.length) {
//             placesRes.push(...placesMapped)
//         } else {
//             placesRes.push(...placesMapped.slice(0, leftToAdd))
//         }

//         console.log(`added to places: ${placesRes.length - placesBeforeLen}; total: ${placesRes.length}`);

//         await wait(250);
//     }

//     for (const [i, place] of placesRes.entries()) {
//         const placeLink = `https://wplace.live/?lat=${place.lastLatitude}&lng=${place.lastLongitude}&zoom=11`;
//         console.log(`[${i + 1} of ${placesRes.length}] processing place ${chalk.bold(place.name)} (tile X${place.tileX} Y${place.tileY}; lon ${place.lastLongitude} lat ${place.lastLatitude}):\n${placeLink}`);

//         modeOpts.startingTile = new TilePosition(place.tileX, place.tileY);

//         await saveGrabby(modeOpts, generalOpts);
//     }

//     function mapPlace(place: RegionSchema): RegionSchemaPlus {
//         return {
//             ...place,
//             tileX: lon2tile(place.lastLongitude, 11),
//             tileY: lat2tile(place.lastLatitude, 11),
//         }
//     }

//     // converters from https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Common_programming_languages

//     function lon2tile(lon, zoom): number { return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom))); }
//     function lat2tile(lat, zoom): number { return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))); }

//     function tile2long(x, z) {
//         return (x / Math.pow(2, z) * 360 - 180);
//     }
//     function tile2lat(y, z) {
//         var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
//         return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
//     }

// }