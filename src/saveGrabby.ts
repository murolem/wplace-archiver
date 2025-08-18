import { Logger } from '$utils/logger'
import type { GeneralOptions, GrabbyOpts, Position, TileImage } from '$src/types'
import chalk from 'chalk'
import { applyNumberUnitSuffix, formatDateToFsSafeIsolike, formatMsToDurationDirnamePart } from '$src/lib/formatters'
import { TileFetchQueue } from '$lib/TileFetchQueue'
import { Cycler } from '$lib/Cycler'
import { wait } from '$utils/wait'
import { Jimp } from "jimp";
import { getTileLogPrefix } from '$lib/logging'
import { TilePosition } from '$lib/TilePosition'
import { err, ok, type Result } from 'neverthrow'
import PQueue from 'p-queue'
import { SigintConfirm } from '$utils/sigintConfirm'
const modeLogger = new Logger("mode-region");
const { logInfo, logError, logWarn } = modeLogger;

export async function saveGrabby(modeOpts: GrabbyOpts, generalOpts: GeneralOptions) {
    const tileQueue = new TileFetchQueue({
        requestsPerSecond: generalOpts.requestsPerSecond,
        requestConcurrency: generalOpts.requestConcurrency,
        respectTooManyRequestsDelay: generalOpts.respectTooManyRequestsDelay
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

    const cycler = new Cycler({
        workingDir: generalOpts.out,
        cycleStartDelayMs: generalOpts.cycleStartDelay * 1000,

        cycleDirpathPreFormatter(timeStart: Date) {
            return modeOpts.out
                .replaceAll('%tile_x', modeOpts.startingTile.x.toString())
                .replaceAll('%tile_y', modeOpts.startingTile.y.toString())
                .replaceAll('%date', formatDateToFsSafeIsolike(timeStart))
        },

        cycleDirpathPostFormatter({
            timeEnd,
            previousCycleFmtedDirpath,
            elapsedMs
        }) {
            return previousCycleFmtedDirpath.replaceAll('%duration', formatMsToDurationDirnamePart(elapsedMs));
        },

        async cycle({
            workingDir,
            outDirpath,
            errorsDirpath,
            writeTile,
            writeError,
        }) {
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
                    (attemptIndex, data) => writeError(tilePos, attemptIndex, data)
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

                logInfo(chalk.gray(`pixel threshold assed (${applyNumberUnitSuffix(pixelCount)} > ${modeOpts.pixelThreshold}), scheduling discovery for nearby tiles`));
                const scheduledRes = tryAddTilePositionsToPool(
                    tileDiscoveryOffsets.map(offset => new TilePosition(
                        tilePos.x + offset.x,
                        tilePos.y + offset.y,
                    ))
                );
                logInfo(chalk.gray(`pixel threshold passed (${applyNumberUnitSuffix(pixelCount)} > ${modeOpts.pixelThreshold}); scheduled ${scheduledRes.success}/${scheduledRes.total}/${scheduledRes.alreadyPooled}/${scheduledRes.outsideRadius} (scheduled/total/already pooled/outside radius)\npool: ${tilePosPoolLength}/${tilePosPoolInProgressLen}/${tilesSaved}/${tilePosPoolCompleteLen} (scheduled/in progress/complete saved/complete total)`));

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
        }
    });

    await cycler.start(generalOpts.loop);
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