import { Logger } from '$utils/logger'
import type { Position, TileImage } from '$src/types'
import chalk from 'chalk'
import { applyNumberUnitSuffix, formatDateToFsSafeIsolike, formatMsToDurationDirnamePart, substituteOutVariables } from '$src/lib/formatters'
import { TileFetchQueue } from '$lib/TileFetchQueue'
import { Cycler } from '$lib/Cycler'
import { wait } from '$utils/wait'
import { Jimp } from "jimp";
import { getTileLogPrefix } from '$lib/logging'
import { TilePosition } from '$lib/TilePosition'
import { err, ok, type Result } from 'neverthrow'
import PQueue from 'p-queue'
import { SigintConfirm } from '$utils/sigintConfirm'
import { noop } from '$utils/noop'
import type { GrabbyOpts, GeneralOpts, OutVariableWeakMap } from '$cli/types'
const modeLogger = new Logger("grabby");
const { logInfo, logError, logWarn } = modeLogger;

export async function saveGrabby(
    modeOpts: GrabbyOpts,
    generalOpts: GeneralOpts,
    internalOpts?: {
        /** Extra variable substitution to perform on pre cycle. */
        extraPreStageVarSubstitutions: OutVariableWeakMap
    }) {
    const tileQueue = new TileFetchQueue({
        requestsPerSecond: generalOpts.requestsPerSecond,
        requestConcurrency: generalOpts.requestConcurrency
    });
    const processingQueue = new PQueue({ concurrency: generalOpts.requestConcurrency, interval: 1000 /** do not change */, intervalCap: generalOpts.requestsPerSecond });

    logInfo(chalk.gray("generating discovery offsets"));
    /** Position offsets for tile discovery. */
    const tileDiscoveryOffsets: Position[] = [];
    for (let x = -Math.floor(modeOpts.tileTolerance); x <= Math.ceil(modeOpts.tileTolerance); x++) {
        for (let y = -Math.floor(modeOpts.tileTolerance); y <= Math.ceil(modeOpts.tileTolerance); y++) {
            const offset = new TilePosition(x, y);
            // skip offset pointing at self
            if (offset.x === 0 && offset.y === 0)
                continue;
            else if (offset.length() > modeOpts.tileTolerance)
                continue;

            tileDiscoveryOffsets.push(offset);
        }
    }

    logInfo(`grabby archival at ${chalk.bold("X" + modeOpts.startingTile.x)} ${chalk.bold("Y" + modeOpts.startingTile.y)} with ${chalk.bold(modeOpts.radius + ' tile radius')} above ${chalk.bold(modeOpts.tileTolerance + ' tile tolerance threshold')} (${tileDiscoveryOffsets.length} offsets per tile). ${chalk.bold("pixel threshold")} is set to ${chalk.bold(modeOpts.pixelThreshold + " pixels")}.`)

    /** external variable to hold written paths. this is just a hacky way so that we could return them. */
    const postWrittenTileImagePaths = new Set<string>();
    const postWrittenErrorPaths = new Set<string>();

    await new Cycler()
        .loop(generalOpts.loop)
        .startDelay(generalOpts.cycleStartDelay)
        .outputFilepath(generalOpts.out, generalOpts.errOut, {
            pre({ pattern, cycleStarted }) {
                return substituteOutVariables(pattern, {
                    // extras, if any (first here to ignore conflict props in case there are any)
                    ...internalOpts?.extraPreStageVarSubstitutions,
                    // general
                    '%date': formatDateToFsSafeIsolike(cycleStarted),
                    '%tile_start_x': modeOpts.startingTile.x.toString(),
                    '%tile_start_y': modeOpts.startingTile.y.toString(),
                    '%tile_ext': 'png',
                    // mode specific
                    '%radius': modeOpts.radius.toString(),
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

            post({ writtenPath, cycleStarted, cycleFinished: cycleEnded, cycleElapsedMs, isTileImagePath }) {
                const res = substituteOutVariables(writtenPath, {
                    '%duration': formatMsToDurationDirnamePart(cycleElapsedMs)
                });

                if (isTileImagePath)
                    postWrittenTileImagePaths.add(res);
                else
                    postWrittenErrorPaths.add(res);

                return res;
            }
        })
        .cycle(async ({
            writeTile,
            writeError,
            getTileWriteFilepath,
            getErrorWriteFilepath
        }) => {
            type PositionStringified = string;

            let tilesSaved = 0;

            const tilePosPool = new Set<PositionStringified>();
            const tilePosPoolInProgress = new Set<PositionStringified>();
            const tilePosPoolComplete = new Set<PositionStringified>();
            let tilePosPoolLength = 0;
            let tilePosPoolInProgressLen = 0;
            let tilePosPoolCompleteLen = 0;

            const isNewTilePos = (pos: TilePosition): boolean => {
                const posStr = pos.toString();
                return !tilePosPoolInProgress.has(posStr)
                    && !tilePosPoolComplete.has(posStr)
                    && !tilePosPool.has(posStr);
            }

            const isTilePosWithinBounds = (pos: TilePosition): boolean => {
                // why do I have to make this assertion typescript??? dumbass
                return (modeOpts.startingTile as TilePosition).distance(pos) <= modeOpts.radius;
            }

            const tryGetNextPoolPos = (): TilePosition | null => {
                if (tilePosPoolLength === 0)
                    return null;

                const posStr = tilePosPool.values().next().value!;
                tilePosPool.delete(posStr);
                tilePosPoolLength--;

                return TilePosition.fromString(posStr);
            }

            const tryAddTilePosToPool = (pos: TilePosition): Result<
                void,
                { reason: 'outside-radius' }
                | { reason: 'already-pooled' }
            > => {
                if (!isTilePosWithinBounds(pos))
                    return err({ reason: 'outside-radius' })
                else if (!isNewTilePos(pos)) {
                    return err({ reason: 'already-pooled' });
                }

                tilePosPool.add(pos.toString());
                tilePosPoolLength++;

                return ok();
            }

            const tryAddTilePositionsToPool = (positions: TilePosition[]): {
                total: number,
                success: number,
                outsideRadius: number,
                alreadyPooled: number
            } => {
                return positions.reduce((accum, value) => {
                    const res = tryAddTilePosToPool(value);
                    if (res.isOk()) {
                        accum.success++;
                        return accum;
                    }

                    switch (res.error.reason) {
                        case 'already-pooled': accum.alreadyPooled++; break;
                        case 'outside-radius': accum.outsideRadius++; break;
                        default: throw new Error("not impl");
                    }

                    return accum;
                }, {
                    total: positions.length,
                    success: 0,
                    outsideRadius: 0,
                    alreadyPooled: 0
                });
            }

            const markTilePosInProgress = (tilePos: TilePosition): void => {
                tilePosPoolInProgress.add(tilePos.toString());
                tilePosPoolInProgressLen++;
            }
            const markTilePosComplete = (tilePos: TilePosition): void => {
                tilePosPoolInProgress.delete(tilePos.toString());
                tilePosPoolInProgressLen--;
                tilePosPoolComplete.add(tilePos.toString());
                tilePosPoolCompleteLen++;
            }

            tryAddTilePosToPool(new TilePosition(modeOpts.startingTile.x, modeOpts.startingTile.y));

            const task = async () => {
                const tilePos = tryGetNextPoolPos();
                if (tilePos === null)
                    return;

                markTilePosInProgress(tilePos);
                const tilePosOffset = tilePos.clone().subtract(modeOpts.startingTile);

                const logger = new Logger(getTileLogPrefix(tilePos));
                const { logInfo, logError, logWarn } = logger;

                logInfo(`processing offset ${chalk.bold("X" + tilePosOffset.x)} ${chalk.bold("Y" + tilePosOffset.y)}`);

                const tileRes = await tileQueue.enqueue(
                    tilePos,
                    writeError
                )

                if (tileRes.isErr()) {
                    markTilePosComplete(tilePos);
                    return;
                }

                const tileImage = tileRes.value;
                await writeTile(tilePos, tileImage);
                tilesSaved++;

                const pixelCount = await countPixels(tileImage);
                if (pixelCount < modeOpts.pixelThreshold) {
                    logInfo(chalk.gray(`tile below the threshold (${pixelCount} < ${modeOpts.pixelThreshold}), skipping`));
                    markTilePosComplete(tilePos);
                    return;
                }

                logInfo(chalk.gray(`pixel threshold passed (${applyNumberUnitSuffix(pixelCount)} > ${modeOpts.pixelThreshold}), scheduling discovery for nearby tiles`));
                const scheduledRes = tryAddTilePositionsToPool(
                    tileDiscoveryOffsets.map(offset => new TilePosition(
                        tilePos.x + offset.x,
                        tilePos.y + offset.y,
                    ))
                );
                logInfo(chalk.gray(`nearby tiles: ${scheduledRes.success}/${scheduledRes.total}/${scheduledRes.alreadyPooled}/${scheduledRes.outsideRadius} (scheduled/total/already pooled/outside radius)\npool: ${tilePosPoolLength}/${tilePosPoolInProgressLen}/${tilesSaved}/${tilePosPoolCompleteLen} (scheduled/in progress/complete saved/complete total)`));

                markTilePosComplete(tilePos);
            }

            const sigintConfirm = new SigintConfirm();
            while (tilePosPoolLength > 0 || tilePosPoolInProgressLen > 0) {
                if (sigintConfirm.inSigintMode) {
                    tileQueue.pause();
                    processingQueue.pause();
                    await sigintConfirm.sigintPromise;
                    tileQueue.start();
                    processingQueue.start();
                }

                // do not schedule on pause, otherwise it would fill up the processing queue.
                if (tileQueue.isPaused) {
                    await wait(200);
                    continue;
                }

                // prevents constant useless scheduling
                await wait(1000 / generalOpts.requestConcurrency);

                await processingQueue.onSizeLessThan(generalOpts.requestConcurrency);

                processingQueue.add(task);
            }

            await processingQueue.onIdle();

            logInfo(`✅ grabby archival complete: saved ${chalk.bold(tilesSaved + " tiles")} out of ${chalk.bold(tilePosPoolCompleteLen + ' processed')}`);
            logInfo(`========================================`);
        })
        .start();

    return {
        postWrittenTileImagePaths,
        postWrittenErrorPaths
    }
}

async function countPixels(tileImage: TileImage): Promise<number> {
    const imgJimp = await Jimp.fromBuffer(tileImage);
    const view = Uint8Array.from(imgJimp.bitmap.data);

    let nonEmptyPixelCount = 0;
    for (let i = 0; i < view.length; i += 4) {
        // check alpha
        if (view[i + 4] > 0)
            nonEmptyPixelCount++;
    }

    return nonEmptyPixelCount;
}