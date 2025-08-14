import { Logger } from '$logger'
import type { GeneralOptions, GrabbyOpts, Position, TileImage } from '$src/types'
import chalk from 'chalk'
import { formatDateToFsSafeIsolike, formatMsToDurationDirnamePart } from '$src/lib/formatters'
import { TileFetchQueue } from '$lib/TileFetchQueue'
import { Cycler } from '$lib/Cycler'
import { wait } from '$utils/wait'
import sharp from 'sharp'
import { getTileLogPrefix } from '$lib/logging'
import { TilePosition } from '$lib/TilePosition'
import { convertIndexToXyPosition } from '$utils/converters'
const modeLogger = new Logger("mode-region");
const { logInfo, logError, logWarn } = modeLogger;

export async function saveGrabby(modeOpts: GrabbyOpts, generalOpts: GeneralOptions) {
    const rps = generalOpts.requestsPerSecond
        ?? generalOpts.requestsPerMinute / 60
    const tileQueue = new TileFetchQueue({ requestsPerSecond: rps, requestConcurrency: generalOpts.requestConcurrency });

    logInfo(chalk.gray("generating discovery offsets"));
    /** Position offsets for tile discovery. */
    const tileDiscoveryOffsets: Position[] = [];
    const diameter = modeOpts.radius * 2 + 1;
    for (let i = 0; i < diameter ** 2; i++) {
        // unsigned offset
        const offset = convertIndexToXyPosition(i, diameter);
        // turn signed
        offset.x -= modeOpts.radius;
        offset.y -= modeOpts.radius;

        // skip offset pointing at self
        if (offset.x === 0 && offset.y === 0)
            continue;

        tileDiscoveryOffsets.push(offset);
    }

    logInfo(`grabby archival with ${chalk.bold(modeOpts.radius + ' offset')} above ${chalk.bold(modeOpts.threshold + ' pixel threshold')} (${tileDiscoveryOffsets.length} discovery ring size, in tiles); starting at tile X1 ${chalk.bold(modeOpts.startingTile.x)} Y1 ${chalk.bold(modeOpts.startingTile.y)}`)
    logInfo(tileDiscoveryOffsets.map(e => `(${e.x}, ${e.y})`).join(" "));

    const cycler = new Cycler({
        workingDir: generalOpts.out,

        cycleDirpathPreFormatter(timeStart: Date) {
            return modeOpts.out
                .replaceAll('tile_x', modeOpts.startingTile.x.toString())
                .replaceAll('tile_y', modeOpts.startingTile.y.toString())
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

            const getNextPoolPos = () => {
                if (tilePosPoolLength === 0)
                    throw new Error("failed to get a next pool position: pool is empty");

                const posStr = tilePosPool.values().next().value!;
                tilePosPool.delete(posStr);
                tilePosPoolLength--;

                return TilePosition.fromString(posStr);
            }

            const tryAddTilePosToPool = (pos: TilePosition): void => {
                if (!isNewTilePos(pos)) {
                    return;
                }

                tilePosPool.add(pos.toString());
                tilePosPoolLength++;
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

            while (tilePosPoolLength > 0 || tilePosPoolInProgressLen > 0) {
                if (tilePosPoolLength === 0) {
                    await wait(100);
                    continue;
                }

                const tilePos = getNextPoolPos();
                markTilePosInProgress(tilePos);

                const logger = new Logger(getTileLogPrefix(tilePos));
                const { logInfo, logError, logWarn } = logger;

                logInfo(`processing pool: ${tilePosPoolLength} pending start, ${tilePosPoolInProgressLen} in progress`);

                const tileRes = await tileQueue.enqueue(
                    tilePos,
                    (attemptIndex, data) => writeError(tilePos, attemptIndex, data)
                )

                if (tileRes.isErr()) {
                    markTilePosComplete(tilePos);
                    continue;
                }

                const tileImage = tileRes.value;
                await writeTile(tilePos, tileImage);
                tilesSaved++;

                if (!await hasAtLeastNPixels(tileImage, modeOpts.threshold)) {
                    logInfo(chalk.gray("tile below the threshold"));
                    markTilePosComplete(tilePos);
                    continue;
                }

                logInfo("threshold passed, scheduling discovery for nearby tiles");
                for (const offset of tileDiscoveryOffsets) {
                    tryAddTilePosToPool(
                        new TilePosition(
                            tilePos.x + offset.x,
                            tilePos.y + offset.y,
                        )
                    )
                }

                markTilePosComplete(tilePos);
            }

            logInfo(`✅ grabby expansion complete: ${chalk.bold('saved ' + tilesSaved)} tiles out of ${chalk.bold(tilePosPoolCompleteLen + ' processed')}`);
        }
    });

    await cycler.start(generalOpts.loop);
}

async function hasAtLeastNPixels(tileImage: TileImage, pixels: number): Promise<boolean> {
    const buf = await sharp(tileImage)
        .raw()
        .toBuffer();
    const view = Uint8Array.from(buf);

    let nonEmptyPixelCount = 0;
    for (let i = 0; i < view.length; i += 4) {
        const [r, g, b] = view.slice(i, i + 3);
        if (r > 0 || g > 0 || b > 0)
            nonEmptyPixelCount++;

        if (nonEmptyPixelCount >= pixels)
            return true;
    }

    return false;
}

async function countPixels(tileImage: TileImage): Promise<number> {
    const buf = await sharp(tileImage)
        .raw()
        .toBuffer();
    const view = Uint8Array.from(buf);

    let nonEmptyPixelCount = 0;
    for (let i = 0; i < view.length; i += 4) {
        const [r, g, b] = view.slice(i, i + 3);
        if (r > 0 || g > 0 || b > 0)
            nonEmptyPixelCount++;
    }

    return nonEmptyPixelCount;
}