import { Logger } from '$utils/logger'
import type { Position, Size } from '$src/types'
import { clamp } from '$utils/clamp'
import { convertIndexToXyPosition } from '$utils/converters'
import chalk from 'chalk'
import humanizeDuration from "humanize-duration"
// @ts-ignore no types
import humanizeNumber from 'humanize-number'
import { confirm } from '@inquirer/prompts'
import { formatDateToFsSafeIsolike, formatMsToDurationDirnamePart, substituteOutVariables } from '$src/lib/formatters'
import { TileFetchQueue } from '$lib/TileFetchQueue'
import { Cycler } from '$lib/Cycler'
import { mapDimensionsInTiles } from '$src/constants'
import { noop } from '$utils/noop'
import { TilePosition } from '$lib/TilePosition'
import type { RegionOpts, GeneralOpts } from '$cli/types'
import { Jimp, ResizeStrategy } from 'jimp'
import path from 'path';
import { Vector2 } from '$lib/vector'
const logger = new Logger("mode-region");
const { logDebug, logInfo, logError, logWarn } = logger;

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
    const regionSizeTiles: Size = {
        w: region.xy2.x - region.xy1.x + 1,
        h: region.xy2.y - region.xy1.y + 1,
    }
    const tilesTotal = regionSizeTiles.w * regionSizeTiles.h;

    const projectedDurationSeconds = clamp(Math.floor(tilesTotal / generalOpts.requestsPerSecond), 1, Infinity);

    logInfo(`archival of region X1 ${chalk.bold(region.xy1.x)} Y1 ${chalk.bold(region.xy1.y)} X2 ${chalk.bold(region.xy2.x)} Y2 ${chalk.bold(region.xy2.y)} (width ${chalk.bold(regionSizeTiles.w)} height ${chalk.bold(regionSizeTiles.h)}), totalling ${chalk.bold(humanizeNumber(tilesTotal) + " tiles")}. projected duration: ${chalk.bold(humanizeDuration(projectedDurationSeconds * 1000, { conjunction: " and " }))}`);
    if (projectedDurationSeconds > projectDurationLongTimeWarningSeconds) {
        if (!await confirm({ message: chalk.yellow(`The archival is projected to take a long time, continue?`) }))
            return;
    }

    const convertTileIndexToTilePos = (index: number): TilePosition => {
        const localPos = convertIndexToXyPosition(index, regionSizeTiles.w);
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
                    '%width_tiles': regionSizeTiles.w.toString(),
                    '%height_tiles': regionSizeTiles.h.toString(),
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
        .post(async function (args) {
            const baseImage = new Jimp({ width: regionSizeTiles.w * 1000, height: regionSizeTiles.h * 1000 });

            const posGen = getTilePositionGenerator();
            const tilesMax = regionSizeTiles.w * regionSizeTiles.h;
            let idx = 0;
            for(const pos of posGen) {
                logInfo(`Merging tile ${++idx} of ${tilesMax} potential`);
                const filepath = path.join(args.tileColumnsDirpath, pos.x.toString(), pos.y + ".png");
                logDebug("Loading image: " + filepath);
                baseImage.blit({ 
                    src: await Jimp.read(filepath),  
                    x: (pos.x - region.xy1.x) * 1000,
                    y: (pos.y - region.xy1.y) * 1000,
                });
            }

            const cropFactor = 0.75;
            const translateFactor = new Vector2(.8, 1);
            const scaleFator = 5;

            logInfo("Cropping");
            baseImage.crop({ 
                x: (regionSizeTiles.w * (cropFactor / 2) * translateFactor.x) * 1000,
                y: (regionSizeTiles.h * (cropFactor / 2) * translateFactor.y) * 1000,
                w: (regionSizeTiles.w * (cropFactor / 2)) * 1000,
                h: (regionSizeTiles.h * (cropFactor / 2)) * 1000,
            })
            logInfo("Scaling");
            baseImage.scale({ f: scaleFator, mode: ResizeStrategy.NEAREST_NEIGHBOR })

            const saveFilepath = path.join(args.tileColumnsDirpath, "merged.png");
            logInfo("Merge complete; saving to: \n" + chalk.gray(saveFilepath));
            await baseImage.write(saveFilepath as any);
        })
        .start();
}