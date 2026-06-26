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
import fs from 'fs-extra';
import { wait } from '$utils/wait'
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

    let cyclesDone = 0;
    let mergeTileInitialIndex = -1;
    let cycleStartedAtTs = 0;

    await new Cycler()
        .loop(generalOpts.loop)
        .startDelay(0)
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
            cycleStartedAtTs = Date.now();
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
            const sleepFor = 60_000;
            const baseImage = new Jimp({ width: regionSizeTiles.w * 1000, height: regionSizeTiles.h * 1000, color: '#9ebdff' });

            const posGen = getTilePositionGenerator();
            const tilesMax = regionSizeTiles.w * regionSizeTiles.h;
            let idx = 0;
            for(const pos of posGen) {
                logInfo(`Merging tile ${++idx} of ${tilesMax} potential`);
                const filepath = path.join(args.tileColumnsDirpath, pos.x.toString(), pos.y + ".png");
                if(!fs.existsSync(filepath))
                    continue;
                
                logDebug("Loading image: " + filepath);
                try {

                    baseImage.blit({ 
                        src: await Jimp.read(filepath),  
                        x: (pos.x - region.xy1.x) * 1000,
                        y: (pos.y - region.xy1.y) * 1000,
                    });
                } catch (err) {
                    logError({ msg: "Merge failed; skipping", data: { error: err } });
                    return;
                }
            }

            const cropFactor = new Vector2(.25, .45);
            const translateFactor = new Vector2(.35, .2);
            // translateFactor.y += .1;
            const scaleFator = 5;

            logInfo("Cropping");

            const cropRect = { 
                x: 0,
                y: 0,
                w: 0,
                h: 0,
            }

            // const scaleFactor = map(cropFactor, 0, 1, 1, 0);

            cropRect.w = regionSizeTiles.w * 1000 * (1 - cropFactor.x);
            cropRect.h = regionSizeTiles.h * 1000 * (1 - cropFactor.y);

            cropRect.x = translateFactor.x * regionSizeTiles.w * 1000;
            cropRect.y = translateFactor.y * regionSizeTiles.h * 1000;

            cropRect.x = Math.floor(cropRect.x);
            cropRect.y = Math.floor(cropRect.y);
            cropRect.w = Math.floor(cropRect.w);
            cropRect.h = Math.floor(cropRect.h);

            baseImage.crop(cropRect)
            // logInfo("Scaling");
            // baseImage.scale({ f: .5, mode: ResizeStrategy.NEAREST_NEIGHBOR })

            const saveDirpath = path.join(args.tileColumnsDirpath, "..");
            const saveFilenamePrefix =  "merged-";
            if(mergeTileInitialIndex === -1) {
                if(fs.existsSync(saveDirpath)) {
                    logInfo("Calculating initial merge file index")
                    const matchingFiles = await fs.readdir(saveDirpath)
                        .then(list => list.filter(name => name.startsWith(saveFilenamePrefix) && fs.statSync(path.join(saveDirpath, name)).isFile() ));

                    mergeTileInitialIndex = matchingFiles
                        .map(item => parseInt(/\d+/.exec(item)?.[0] || "0"))
                        .sort((a, b) => b - a) // desc
                        [0] + 1 || 0;

                    logInfo(`Starting with index: ${mergeTileInitialIndex}`);
                }
            }


            const saveFilepath = path.join(saveDirpath, saveFilenamePrefix + ((mergeTileInitialIndex + cyclesDone).toString().padStart(7, '0')) + ".png");
            logInfo("Merge complete; saving to: \n" + chalk.gray(path.resolve(saveFilepath)));
            await baseImage.write(saveFilepath as any);

            logInfo(`Removing dir: ` + args.tileColumnsDirpath);
            fs.removeSync(args.tileColumnsDirpath);

            cyclesDone++;
            const elapsedSinceCycleStart = Date.now() - cycleStartedAtTs;
            const sleepForActual = clamp(sleepFor - elapsedSinceCycleStart, 0, Infinity);
            logInfo(`Sleeping for ${Math.floor(sleepForActual / 1000)} seconds...`);
            await wait(sleepForActual)
        })
        .start();
}