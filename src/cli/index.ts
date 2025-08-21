import { mapDimensionsInTilesHalf } from '$src/constants';
import { saveGrabby } from '$src/saveGrabby';
import { saveRegion, type Region } from '$src/saveRegion';
import type { Size } from '$src/types';
import { Option, program } from '@commander-js/extra-typings';
import { saveGrabbyLeaderboardsByRegion } from '$src/saveGrabbyLeaderboardsByRegion';
import { markdownTable } from 'markdown-table';
import { getFloatRangeParser, getIntRangeParser, parseOutPath, parseOutPathsIntermediate, parseSizeOption, parseTilePixelCount, parseTilePosition } from '$cli/parsers';
import { arrayToCopiedExcludingEntry } from '$utils/arrayToCopiedExcludingEntry';
import { defaultErrOutModeGrabby, defaultErrOutModeGrabbyLeaderboardByRegion, defaultErrOutModeRegion, defaultOutModeGrabby, defaultOutModeGrabbyLeaderboardByRegion, defaultOutModeRegion, leaderboardPeriods } from '$cli/constants';
import chalk from 'chalk';
import { variableName as vn } from '$cli/utils';
import type { GeneralOpts } from '$cli/types';

const generalOpts = program
    .name("wplace_archiver")
    .description("Archiver utility for https://wplace.live")
    .option("-o, --out <path_pattern>", `\
Output path for each tile in form of a pattern. A pattern may contain variables formatted as '%variable' that are replaced with their values on various archival stages.
    
${chalk.bold("Archival stages:")}
${markdownTable([
        ['Stage', 'Description'],
        ['→|C|  Pre', 'Run before a cycle starts, once.'],
        [' |→|  Cycle', 'Run during a cycle, once per tile/error.'],
        [' |C|→ Post', 'Run after a cycle finishes, once for each written path.']
    ])}

${chalk.bold("Variables available for all modes:")}
${markdownTable([
        ['Variable', 'Stage', 'Description', 'Example'],
        [vn('%date'), 'Pre', 'Archival cycle start time formatted as an iso-like string.', '2025-08-15T12-11-09.590Z'],
        [vn('%tile_start_x'), 'Pre', 'Starting tile position, X-component.', '255'],
        [vn('%tile_start_y'), 'Pre', 'Starting tile position, Y-component.', '1235'],
        [vn('%tile_x'), 'Cycle', 'Current tile position, X-component.', '255'],
        [vn('%tile_y'), 'Cycle', 'Current tile position, y-component.', '1235'],
        [vn('%duration'), 'Post', 'Amount of time it took to complete a cycle.', '16m, 1h17m'],
    ])}

${chalk.bold("Extra variables available in 'region' mode:")}
${markdownTable([
        ['Variable', 'Stage', 'Description', 'Example'],
        [vn('%width_tiles'), 'Pre', 'Width of region to archive in tiles.', '50'],
        [vn('%height_tiles'), 'Pre', 'Height of region to archive in tiles.', '30'],
    ])}

${chalk.bold("Extra variables available in 'grabby' mode:")}
${markdownTable([
        ['Variable', 'Stage', 'Description', 'Example'],
        [vn('%radius'), 'Pre', 'Circular radius of the area to grab.', '5'],
    ])}

${chalk.bold("Extra variables available in 'grabby' leaderboard mode:")}
${markdownTable([
        ['Variable', 'Stage', 'Description', 'Example'],
        [vn('%period'), 'Pre', 'Leaderboard period.', leaderboardPeriods.join(', ')],
    ])}

${chalk.bold("Extra variables available in 'grabby' leaderboard mode, by-region category:")}
${markdownTable([
        ['Variable', 'Stage', 'Description', 'Example'],
        [vn('%leaderboard_date'), 'Pre', 'Leaderboard archival cycle start time formatted as an iso-like string.', '2025-08-15T12-11-09.590Z'],
        [vn('%leaderboard_duration'), 'Post', 'Amount of time it took to complete a leaderboard cycle.', '16m, 1h17m'],
        [vn('%country_flag'), 'Internal cycle', 'Country flag emoji.', '🇦🇫'],
        [vn('%country'), 'Internal cycle', 'Country name.', 'Afghanistan'],
        [vn('%place'), 'Internal cycle', 'Place name.', 'Seoul'],
        [vn('%place_number'), 'Internal cycle', 'Place number.', '14'],
        [vn('%date'), 'Internal cycle', 'Place archival cycle start time formatted as an iso-like string.', '2025-08-15T12-11-09.590Z'],
        [vn('%duration'), 'Internal cycle', 'Amount of time it took to complete a place cycle.', '16m, 1h17m'],
    ])}
    
${chalk.bold("Default output paths:")}
- Mode Region: 
${defaultOutModeRegion}
- Mode Grabby:
${defaultOutModeGrabby}
- Mode Grabby (leaderboards, by region): 
${defaultOutModeGrabbyLeaderboardByRegion}

`, parseOutPath)
    .option('-e, --error-out <path_pattern>', `\
Output path for errors during the archival in form of a pattern. All variables available for --out are also available here. See help for --out option for more info on variables.

${chalk.bold("Extra variables available for all modes:")}
${markdownTable([
        ['Variable', 'Stage', 'Description', 'Example'],
        [vn('%attempt'), 'Cycle', 'Current attempt at fetching a tile.', '1, 2, 3'],
    ])}

${chalk.bold("Default error output paths:")}
- Mode Region: 
${defaultErrOutModeRegion}
- Mode Grabby:
${defaultErrOutModeGrabby}
- Mode Grabby (leaderboards, by region): 
${defaultErrOutModeGrabbyLeaderboardByRegion}


`, parseOutPath)
    .option("--no-error-out", "Disabled error writing to disk.", false)
    .option("--rps, --requests-per-second <number>", "Requests per second. Higher value could cause Too Many Requests errors, significantly lowering the RPS.", getIntRangeParser(1, Infinity), 5)
    .option("--rc, --request-concurrency <number>", "Request concurrency. How many requests are allowed to run in parallel? Higher value could cause Too Many Requests errors, significantly lowering RPS.", getIntRangeParser(1, Infinity), 2)
    .option("-l, --loop", "Run archiving continuously? Once archival is complete, it will run again. Saving path may be altered - see each mode for details.", false)
    .option("--cycle-start-delay <seconds>", "Delay before starting an archival cycle.", getIntRangeParser(0, Infinity), 3)
    .opts();

const regionSubcommands = ["size", "to", "radius"];
program.command("region")
    .description("Captures a region of tiles.")
    .argument("<tile X,Y>", "Position of the starting tile formatted as X,Y. Each value must be from 0 to 2047.", parseTilePosition)
    .addOption(new Option("--size <W,H>", "Size in tiles formatted as W,H, where W is width and H is height. This will extend the region horizontally right and vertically down. Each value must be from 1 to 2048.")
        .conflicts(arrayToCopiedExcludingEntry(regionSubcommands, "size"))
        .argParser(parseSizeOption)
    )
    .addOption(new Option("--radius <R>", `Square radius in tiles.Sets '--center'.Each value must be from 1 to ${mapDimensionsInTilesHalf}.`)
        .conflicts(arrayToCopiedExcludingEntry(regionSubcommands, "radius"))
        .argParser(getIntRangeParser(1, mapDimensionsInTilesHalf))
    )
    .addOption(new Option("--to <X,Y>", "Position of the ending tile formatted as X,Y, where W is width and H is height. Each value must be from 0 to 2047.")
        .conflicts(arrayToCopiedExcludingEntry(regionSubcommands, "to"))
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
            program.error(`no region size defining option provided; use one of: ${commandsInstructionStr} `);
        }

        const generalOptsRes: GeneralOpts = {
            ...generalOpts,
            ...parseOutPathsIntermediate({
                out: generalOpts.out,
                errOut: generalOpts.errorOut,
                outFallback: defaultOutModeRegion,
                errOutFallback: defaultErrOutModeRegion
            })
        }

        await saveRegion({ region }, generalOptsRes);

        // hard exit in case of a dangling promise
        process.exit();
    });

const grabbyLeaderboardPeriodsOptions = ["today", "week", "month", "all-time"] as const;
const grabbyLeaderboardPeriodsOptionsParsed = ["today", "week", "month", "allTime"] as const;
program.command("grabby")
    .description("Grabs tiles around starting tile until no tiles without pixels above threshold are left.")
    .argument("[tile X,Y]", "Position of starting tile formatted as X,Y. Each value must be from 0 to 2047.", parseTilePosition)
    .option("--pixel-threshold <amount>", "Minimum amount of pixels in a tile for it to be saved. Value from 1 to 1 000 000.", parseTilePixelCount, 10)
    .option("--tile-tolerance <radius>", "Circular radius around a tile to check surrounding tiles. Value from 1.5 to 15.", getFloatRangeParser(1.5, 15), 1.5)
    .option("-r, --radius <value>", "Maximum circular radius to go to from starting tile. Value from 1 to 250.", getFloatRangeParser(1, 250), 5)
    .option("--leaderboard, --leaderboards", "Enables fetching from leaderboard. Requires selecting category and period.", false)
    .option("--by-region", `Sets by-region category for leaderboard fetching.`, false)
    .addOption(new Option("--size <W,H>", "Size in tiles formatted as W,H, where W is width and H is height. This will extend the region horizontally right and vertically down. Each value must be from 1 to 2048.")
        .conflicts(arrayToCopiedExcludingEntry(regionSubcommands, "size"))
        .argParser(parseSizeOption)
    )
    .addOption(new Option("--today", "Sets today as period for leaderboard fetching.")
        .conflicts(arrayToCopiedExcludingEntry(grabbyLeaderboardPeriodsOptions as any as string[], 'today'))
        .default(false)
    )
    .addOption(new Option("--week", "Sets last week as period for leaderboard fetching.")
        .conflicts(arrayToCopiedExcludingEntry(grabbyLeaderboardPeriodsOptions as any as string[], 'week'))
        .default(false)
    )
    .addOption(new Option("--month", "Sets last month as period for leaderboard fetching.")
        .conflicts(arrayToCopiedExcludingEntry(grabbyLeaderboardPeriodsOptions as any as string[], 'month'))
        .default(false)
    )
    .addOption(new Option("--all-time", "Sets all-time as period for leaderboard fetching.")
        .conflicts(arrayToCopiedExcludingEntry(grabbyLeaderboardPeriodsOptions as any as string[], 'all-time'))
        .default(false)
    )
    .action(async (xy, opts) => {
        if (opts.leaderboards) {
            if (!opts.byRegion)
                program.error(`leaderboard category not specified.`);

            const period = (() => {
                for (const [i, periodNameParsed] of grabbyLeaderboardPeriodsOptionsParsed.entries()) {
                    if (opts[periodNameParsed])
                        return grabbyLeaderboardPeriodsOptions[i];
                }
            })();
            if (!period)
                program.error("leaderboard period not specified");

            const generalOptsRes: GeneralOpts = {
                ...generalOpts,
                ...parseOutPathsIntermediate({
                    out: generalOpts.out,
                    errOut: generalOpts.errorOut,
                    outFallback: defaultOutModeGrabbyLeaderboardByRegion,
                    errOutFallback: defaultErrOutModeGrabbyLeaderboardByRegion
                })
            }

            await saveGrabbyLeaderboardsByRegion({
                period,
                pixelThreshold: opts.pixelThreshold,
                tileTolerance: opts.tileTolerance,
                radius: opts.radius
            }, generalOptsRes);
        } else {
            if (!xy)
                program.error("tile position not specified");

            const generalOptsRes: GeneralOpts = {
                ...generalOpts,
                ...parseOutPathsIntermediate({
                    out: generalOpts.out,
                    errOut: generalOpts.errorOut,
                    outFallback: defaultOutModeGrabby,
                    errOutFallback: defaultErrOutModeGrabby
                })
            }

            await saveGrabby({
                startingTile: xy,
                pixelThreshold: opts.pixelThreshold,
                tileTolerance: opts.tileTolerance,
                radius: opts.radius,
            }, generalOptsRes);
        }

        // hard exit in case of a dangling promise
        process.exit();
    });

program.parse();