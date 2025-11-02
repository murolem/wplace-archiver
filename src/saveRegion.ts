import { Logger } from '$utils/logger'
import type { Position, Size } from '$src/types'
import { clamp } from '$utils/math/clamp'
import { convertIndexToXyPosition } from '$utils/converters/converters'
import chalk from 'chalk'
import humanizeDuration from "humanize-duration"
// @ts-ignore no types
import humanizeNumber from 'humanize-number'
import { confirm } from '@inquirer/prompts'
import { formatDateToFsSafeIsolike, formatMsToDurationDirnamePart, substituteOutVariables } from '$lib/utils/formatters'
import { TileFetchQueue } from '$lib/TileFetchQueue'
import { Cycler } from '$lib/Cycler'
import { mapDimensionsInTiles } from '$src/constants'
import { noop } from '$utils/noop'
import { TilePosition } from '$lib/utils/TilePosition'
import type { RegionOpts, GeneralOpts } from '$cli/types'
const logger = new Logger("mode-region");
const { logInfo, logError, logWarn } = logger;

export type Region = {
    xy1: Position,
    xy2: Position
}

export async function saveRegion(modeOpts: RegionOpts, generalOpts: GeneralOpts) {
    const projectDurationLongTimeWarningSeconds = 2 * 60 * 60; // 2 hours

    // =======

    const tileQueue = new TileFetchQueue({
        ...generalOpts
    });

    const region = modeOpts.region;
    const regionSize: Size = {
        w: region.xy2.x - region.xy1.x + 1,
        h: region.xy2.y - region.xy1.y + 1,
    }
    const tilesTotal = regionSize.w * regionSize.h;

    const projectedDurationSeconds = clamp(Math.floor(tilesTotal / generalOpts.requestsPerSecond), 1, Infinity);

    logInfo(`archival of region X1 ${chalk.bold(region.xy1.x)} Y1 ${chalk.bold(region.xy1.y)} X2 ${chalk.bold(region.xy2.x)} Y2 ${chalk.bold(region.xy2.y)} (width ${chalk.bold(regionSize.w)} height ${chalk.bold(regionSize.h)}), totalling ${chalk.bold(humanizeNumber(tilesTotal) + " tiles")}. projected duration: ${chalk.bold(humanizeDuration(projectedDurationSeconds * 1000, { conjunction: " and " }))}`);
    if (projectedDurationSeconds > projectDurationLongTimeWarningSeconds) {
        if (!await confirm({ message: chalk.yellow(`The archival is projected to take a long time, continue?`) }))
            return;
    }

    const convertTileIndexToTilePos = (index: number): TilePosition => {
        const localPos = convertIndexToXyPosition(index, regionSize.w);
        return new TilePosition(
            (region.xy1.x + localPos.x) % mapDimensionsInTiles,
            (region.xy1.y + localPos.y) % mapDimensionsInTiles,
        );
    };

    function* getTilePositionGenerator(): Generator<TilePosition> {
        for (let i = 0; i < tilesTotal; i++) {
            yield convertTileIndexToTilePos(i);
        }
    }

    await new Cycler()
        .loop(generalOpts.loop)
        .startDelay(generalOpts.cycleStartDelay)
        .outputFilepath(generalOpts.out, generalOpts.errOut, {
            pre({ pattern, cycleStarted }) {
                return substituteOutVariables(pattern, {
                    // general
                    '%date': formatDateToFsSafeIsolike(cycleStarted),
                    '%tile_start_x': region.xy1.x.toString(),
                    '%tile_start_y': region.xy1.y.toString(),
                    '%tile_ext': 'png',
                    // mode specific
                    '%width_tiles': regionSize.w.toString(),
                    '%height_tiles': regionSize.h.toString(),
                });
            },

            cycle({ pattern, cycleStarted, preStageFmtedFilepath, tilePos, attemptIndex }) {
                return substituteOutVariables(preStageFmtedFilepath, {
                    // general
                    '%tile_x': tilePos.x.toString(),
                    '%tile_y': tilePos.y.toString(),
                    // errors
                    '%attempt': attemptIndex.toString(),
                    '%err_ext': 'txt'
                });
            },

            post({ writtenPath, cycleStarted, cycleFinished: cycleEnded, cycleElapsedMs }) {
                return substituteOutVariables(writtenPath, {
                    '%duration': formatMsToDurationDirnamePart(cycleElapsedMs)
                });
            }
        })
        .cycle(async ({
            writeTile,
            writeError
        }) => {
            await tileQueue.enqueue(
                getTilePositionGenerator,
                writeError,
                async (tilePos, res) => {
                    if (res.isOk())
                        await writeTile(tilePos, res.value);
                },
                tasksCompleted => tasksCompleted / tilesTotal
            )
        })
        .start();
}