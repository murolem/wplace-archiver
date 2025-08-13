import { Logger } from '$logger'
import type { GeneralOptions, Position, RegionOpts, Size } from '$src/types'
import { clamp } from '$utils/clamp'
import { convertIndexToXyPosition } from '$utils/converters'
import chalk from 'chalk'
import humanizeDuration from "humanize-duration"
// @ts-ignore no types
import humanizeNumber from 'humanize-number'
import { confirm } from '@inquirer/prompts'
import { formatDateToFsSafeIsolike, formatMsToDurationDirnamePart } from '$src/lib/formatters'
import { TileFetchQueue } from '$lib/TileFetchQueue'
import { Cycler } from '$lib/Cycler'
import { mapDimensionsInTiles } from '$src/constants'
const logger = new Logger("mode-region");
const { logInfo, logError, logWarn } = logger;

export type Region = {
    xy1: Position,
    xy2: Position
}

export async function saveRegion(modeOpts: RegionOpts, generalOpts: GeneralOptions) {
    const projectDurationLongTimeWarningSeconds = 2 * 60 * 60; // 2 hours

    // =======

    const rps = generalOpts.requestsPerSecond
        ?? generalOpts.requestsPerMinute / 60
    const tileQueue = new TileFetchQueue({ requestsPerSecond: rps, requestConcurrency: generalOpts.requestConcurrency });

    const region = modeOpts.region;
    const regionSize: Size = {
        w: region.xy2.x - region.xy1.x + 1,
        h: region.xy2.y - region.xy1.y + 1,
    }
    const tilesTotal = regionSize.w * regionSize.h;

    const projectedDurationSeconds = clamp(Math.floor(tilesTotal / rps), 1, Infinity);

    logInfo(`archival of region X1 ${chalk.bold(region.xy1.x)} Y1 ${chalk.bold(region.xy1.y)} X2 ${chalk.bold(region.xy2.x)} Y2 ${chalk.bold(region.xy2.y)} (width ${chalk.bold(regionSize.w)} height ${chalk.bold(regionSize.h)}), totalling ${chalk.bold(humanizeNumber(tilesTotal) + " tiles")}. projected duration: ${chalk.bold(humanizeDuration(projectedDurationSeconds * 1000, { conjunction: " and " }))}`);
    if (projectedDurationSeconds > projectDurationLongTimeWarningSeconds) {
        if (!await confirm({ message: chalk.yellow(`The archival is projected to take a long time, continue?`) }))
            return;
    }

    const convertTileIndexToTilePos = (index: number): Position => {
        const localPos = convertIndexToXyPosition(index, regionSize.w);
        return {
            x: (region.xy1.x + localPos.x) % mapDimensionsInTiles,
            y: (region.xy1.y + localPos.y) % mapDimensionsInTiles,
        }
    };

    function* getTilePositionGenerator(): Generator<Position> {
        for (let i = 0; i < tilesTotal; i++) {
            yield convertTileIndexToTilePos(i);
        }
    }

    const cycler = new Cycler({
        workingDir: generalOpts.out,

        cycleDirpathPreFormatter(timeStart: Date) {
            return modeOpts.out
                .replaceAll('tile_x', region.xy1.x.toString())
                .replaceAll('tile_y', region.xy1.y.toString())
                .replaceAll('width_tiles', regionSize.w.toString())
                .replaceAll('height_tiles', regionSize.h.toString())
                .replaceAll('date', formatDateToFsSafeIsolike(timeStart))
        },

        cycleDirpathPostFormatter({
            timeEnd,
            previousCycleFmtedDirpath,
            elapsedMs
        }) {
            return previousCycleFmtedDirpath.replaceAll('duration', formatMsToDurationDirnamePart(elapsedMs));
        },

        async cycle({
            workingDir,
            outDirpath,
            errorsDirpath,
            writeTile,
            writeError,
        }) {
            await tileQueue.enqueue(
                getTilePositionGenerator,
                writeError,
                async (tilePos, res) => {
                    if (res.isOk())
                        await writeTile(tilePos, res.value);
                },
                tasksCompleted => tasksCompleted / tilesTotal
            )
        }
    });

    await cycler.start(generalOpts.loop);
}