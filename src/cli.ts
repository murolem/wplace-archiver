import { saveRegion, type Region } from '$src/saveRegion';
import type { GeneralOptions, Position, Size } from '$src/types';
import { Option, program } from '@commander-js/extra-typings';
import { z } from 'zod';

function parsePositionOption(value: string): Position {
    const numSchema = z.coerce.number().int().min(0).max(2047);
    try {
        return z.tuple([numSchema, numSchema])
            .transform(([x, y]) => ({ x, y }))
            .parse(value.split(","));
    } catch (err) {
        program.error(`failed to parse position: expected numbers in range 0-2047 formatted X,Y; got: ${value}`);
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

function parseRadiusOption(value: string): number {
    try {
        return z.coerce.number().int().min(1).max(1024)
            .parse(value);
    } catch (err) {
        program.error(`failed to parse radius: expected a number in range 0-1024; got: ${value}`);
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

function parseIntGreaterThan0(value: string): number {
    try {
        return z.coerce.number().int().min(1)
            .parse(value);
    } catch (err) {
        program.error(`failed to parse the value: expected an integer greater than or equal to 1; got: ${value}`);
    }
}

/**
 * Copies an array, removing specific entry from the copy and returning the copy array.
 */
function arrayToCopiedWithonEntry<T extends unknown>(arr: T[], entry: T): T[] {
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
    .option("--rps, --requests-per-second <number>", "Requests per second. Higher value could cause Too Many Requests errors, significantly lowering the RPS.", parseIntGreaterThan0)
    .option("--rpm, --requests-per-minute <number>", "Requests per minute. Alternative to --rps option. Higher value could cause Too Many Requests errors, significantly lowering the RPS.", parseIntGreaterThan0, 120)
    .option("--rc, --request-concurrency <number>", "Request concurrency. How many requests are allowed to run in parallel? Higher value could cause Too Many Requests errors, significantly lowering RPS.", parseIntGreaterThan0, 1)
    .option("-l, --loop", "Run archiving continuously? Once archival is complete, it will run again. Saving path may be altered - see each mode for details.", false)
    .opts();

const regionSubcommands = ["size", "to", "radius"];
program.command("region")
    .description("Captures a region of tiles.")
    .argument("<tile X,Y>", "Position of the starting tile formatted as X,Y. Each value must be from 0 to 2047.", parsePositionOption)
    .option("--out2 <dirpath>", "Output directory path. Appended to general variant of --out like this: '<general dirpath>/<this dirpath>'. By default, is (see the default value), excluding brackets, where X and Y are positions of the upper left corner of a region, W and H are dimensions of that region, 'date' is a iso-like timestamp of when the archival begun and 'duration' is a duration that archival took (added afterwards). If specifying path that has any of previously mentioned variables (as plain text, no brackets), they will be replaced with actual values'", 'regions/region-Xtile_x-Ytile_y-Wwidth_tiles-Hheight_tiles/date+duration')
    .addOption(new Option("--size <W,H>", "Size in tiles formatted as W,H, where W is width and H is height. This will extend the region horizontally right and vertically down. Each value must be from 1 to 2048.")
        .conflicts(arrayToCopiedWithonEntry(regionSubcommands, "size"))
        .argParser(parseSizeOption)
    )
    .addOption(new Option("--radius <R>", "Size in tiles both vertically and horizontally. Sets '--center'. Each value must be from 1 to 1024.")
        .conflicts(arrayToCopiedWithonEntry(regionSubcommands, "radius"))
        .argParser(parseRadiusOption)
    )
    .addOption(new Option("--to <X,Y>", "Position of the ending tile formatted as X,Y, where W is width and H is height. Each value must be from 0 to 2047.")
        .conflicts(arrayToCopiedWithonEntry(regionSubcommands, "to"))
        .argParser(parsePositionOption)
    )
    .addOption(new Option("--center", "If set, changes how the region extends to all directions, making the starting tile the center of it.")
        .default(false)
        .conflicts("--to")
    )
    .action((xy, opts) => {
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

        saveRegion({ region, out: opts.out2 }, generalOpts);
    });

// program.command("grabby", "Grabs tiles around the starting tile until no tiles without pixels above threshold are left.")
//     .argument("<tile X,Y>", "Position of the starting tile formatted as X,Y. Each value must be from 0 to 2047.", parsePositionOption)
//     .option("-t, --threshold <value>", "Minimum amount of pixels in a tile to pass. Value from 1 to 1 000 000", parseTilePixelCount, 1)
//     .action((xy, opts) => {


//     });

program.parse();