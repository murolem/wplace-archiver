import { mapDimensionsInTilesHalf } from '$src/constants';
import { saveGrabby } from '$src/saveGrabby';
import { saveRegion, type Region } from '$src/saveRegion';
import type { Size } from '$src/types';
import { Option, program } from '@commander-js/extra-typings';
import { saveGrabbyLeaderboardsByRegion } from '$src/saveGrabbyLeaderboardsByRegion';
import { getFloatRangeParser, getIntRangeParser, parseOutPath, parseOutPathsIntermediate, parseSizeOption, parseTilePixelCount, parseTilePositionLike } from '$cli/parsers';
import { arrayToCopiedExcludingEntry } from '$utils/arrayToCopiedExcludingEntry';
import { defaultErrOutModeGrabby, defaultErrOutModeGrabbyLeaderboardByRegion, defaultErrOutModeRegion, defaultOutModeGrabby, defaultOutModeGrabbyLeaderboardByRegion, defaultOutModeRegion } from '$cli/constants';
import type { GeneralOpts } from '$cli/types';
import { outErrorPathHelp, outPathHelp, positionHelpPartFormats } from '$cli/docs';

const generalOpts = program
    .name("wplace_archiver")
    .description("Archiver utility for https://wplace.live")
    .option("-o, --out <path_pattern>", outPathHelp, parseOutPath)
    .option('-e, --error-out <path_pattern>', outErrorPathHelp, parseOutPath)
    .option("--no-error-out", "Disabled error writing to disk.", false)
    .option("--rps, --requests-per-second <number>", "Requests per second. Higher value could cause Too Many Requests errors, significantly lowering the RPS.", getIntRangeParser(1, Infinity), 4)
    .option("--rc, --request-concurrency <number>", "Request concurrency. How many requests are allowed to run in parallel? Higher value could cause Too Many Requests errors, significantly lowering RPS.", getIntRangeParser(1, Infinity), 2)
    .option("-l, --loop", "Run archiving continuously? Once archival is complete, it will run again. Saving path may be altered - see each mode for details.", false)
    .option("--cycle-start-delay <seconds>", "Delay before starting an archival cycle.", getIntRangeParser(0, Infinity), 3)
    .option("--freebind <subnet>", "[DELEOPMENT ONLY] Enables freebind with specified ipv6 subnet. Only works in development (will NOT work in CLI binary). Agents are pregenerated and reused; number of agents and reuse frequency are dependant on RPS and server RPS limit options. Requires additional setup - see README for details.")
    .option("--server-rps-limit <rps>", "[DELEOPMENT ONLY] Required for --freebind. Sets limit on amount of requests that the WPlace server can accept without getting rate limited. It's highly recommended to NOT go over the server rate limit, otherwise archival will stall.", getIntRangeParser(1, Infinity), 4)
    .opts();

const regionSubcommands = ["size", "to", "radius"];
program.command("region")
    .description("Captures a region of tiles.")
    .argument("<position>", `Starting position. ${positionHelpPartFormats}`, parseTilePositionLike)
    .addOption(new Option("--size <W,H>", "Size in tiles formatted as W,H, where W is width and H is height. This will extend the region horizontally right and vertically down. Each value must be from 1 to 2048.")
        .conflicts(arrayToCopiedExcludingEntry(regionSubcommands, "size"))
        .argParser(parseSizeOption)
    )
    .addOption(new Option("--radius <R>", `Square radius in tiles.Sets '--center'.Each value must be from 1 to ${mapDimensionsInTilesHalf}.`)
        .conflicts(arrayToCopiedExcludingEntry(regionSubcommands, "radius"))
        .argParser(getIntRangeParser(1, mapDimensionsInTilesHalf))
    )
    .addOption(new Option("--to <position>", `Ending position. This position is treated like a lower right point of a region rectangle. ${positionHelpPartFormats}`)
        .conflicts(arrayToCopiedExcludingEntry(regionSubcommands, "to"))
        .argParser(parseTilePositionLike)
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
    .argument("[position]", `Starting position. Becomes optional and ignored when in leaderboard mode. ${positionHelpPartFormats}`, parseTilePositionLike)
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
    .option("--no-reuse-tiles", "If set, no tiles will be reused for leaderboard mode. By default, instead of fetching duplicate tiles when grabby overlaps due to small distance between places, matching tiles that are already fetched are reused. Side effect of this is if archival takes a long time, some tiles might end up pretty old.")
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
                radius: opts.radius,
                reuseTiles: opts.reuseTiles
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