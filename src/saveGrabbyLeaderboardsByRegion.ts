import { Logger } from '$utils/logger'
import type { Place } from '$src/types'
import chalk from 'chalk'
import { applyNumberUnitSuffix, formatDateToFsSafeIsolike, formatMsToDurationDirnamePart, substituteOutVariables } from '$lib/utils/formatters'
import { Cycler, type FnGetErrorWriteFilepath, type FnGetTileWriteFilepath, type FnMarkFilepathWritten } from '$lib/Cycler'
import { TilePosition } from '$lib/utils/TilePosition'
import { err, ok } from 'neverthrow'
import { countries } from '$lib/countries'
import { z } from 'zod'
import sanitizeFilename from 'sanitize-filename'
import { saveGrabby } from '$src/saveGrabby'
import { isRetryableResponse } from '$lib/utils/network'
import type { GrabbyByRegionOpts, GeneralOpts } from '$cli/types'
const modeLogger = new Logger("grabby leaderboard by-region");
const { logInfo, logError, logWarn, logFatal } = modeLogger;

export type PlaceRaw = z.infer<typeof rawPlaceSchema>;
const rawPlaceSchema = z.object({
    "id": z.number(), // ex: 115328,
    "name": z.string(),// ex: "Mérida",
    "cityId": z.number(), // ex: 2142,
    "number": z.number(), // ex: 56,
    "countryId": z.number(), // ex: 140,
    "pixelsPainted": z.number(), // ex: 861488,
    "lastLatitude": z.number(), // ex: 21.003373619322986,
    "lastLongitude": z.number(), // ex: -89.58875976562501
});

export async function saveGrabbyLeaderboardsByRegion(modeOpts: GrabbyByRegionOpts, generalOpts: GeneralOpts) {
    logInfo(chalk.bold.magenta("⭐ GRABBY LEADERBOARD ARCHIVAL MODE ⭐"));
    logInfo(`archiving leaderboard ${chalk.bold('by-region')}, period ${chalk.bold(modeOpts.period)}. countries to plow through: ${chalk.bold(countries.length)}`);

    const fetchCountryPlaces = async (id: number): Promise<Place[]> => {
        const url = `https://backend.wplace.live/leaderboard/region/${modeOpts.period}/${id}`;
        logInfo(`fetching ${chalk.bold(modeOpts.period)} places \n` + chalk.gray(`from: ${url}`));

        let places: PlaceRaw[];
        while (true) {
            const responseRes = await fetch(url)
                .then(res => ok(res))
                .catch(error => err(err));

            if (responseRes.isErr()) {
                logError("fetch error, retrying");
                continue;
            } else if (!responseRes.value.ok) {
                if (isRetryableResponse(responseRes.value)) {
                    logError("fetch error #2, retrying");
                    continue
                } else {
                    logFatal({
                        msg: "fetch error",
                        data: {
                            response: responseRes.value
                        },
                        throw: true
                    })
                    throw ''//type guard
                }
            }

            const jsonRes = await responseRes.value.json()
                .then(res => ok(res))
                .catch(error => err(error));
            if (jsonRes.isErr()) {
                logError("json retrieval failed, retrying");
                continue;
            }

            const parsedRes = rawPlaceSchema.array().safeParse(jsonRes.value);
            if (!parsedRes.success) {
                logFatal({
                    msg: "failed to parse the country data returned by Wplace: schema mismatch",
                    data: {
                        json: jsonRes.value,
                        parseError: parsedRes.error
                    },
                    stringifyData: true,
                    throw: true
                });
                throw ''//type guard
            }

            places = parsedRes.data;
            break;
        }

        return places.map(unrawPlace);
    }

    const archivePlace = async (args: {
        getTileWriteFilepath: FnGetTileWriteFilepath,
        getErrorWriteFilepath: FnGetErrorWriteFilepath,
        markFilepathWritten: FnMarkFilepathWritten,
        tileToTileImageFilepathMap: Map<string, string>,
        countryName: string,
        countryFlag: string,
        countryIndex: number,
        countriesTotal: number,
        placeIndex: number,
        placesTotal: number,
        place: Place
    }) => {
        const shareUrl = `https://wplace.live/?lat=${args.place.lastLatitude}&lng=${args.place.lastLongitude}&zoom=11`;
        logInfo(`[country ${args.countryIndex + 1} of ${args.countriesTotal}] [place ${args.placeIndex + 1} of ${args.placesTotal}] fetching place: ${chalk.bold(args.place.name)} (${applyNumberUnitSuffix(args.place.pixelsPainted)} pixels) in country ${chalk.bold(args.countryFlag + ' ' + args.countryName)} \n` + chalk.gray(`wplace url: ${shareUrl}`));

        const out = args.getTileWriteFilepath(args.place.tilePos)
        // attempt doesn't matter here, since we don't substitute attempt variable.
        const errOut = args.getErrorWriteFilepath(args.place.tilePos, -1)

        const saveGrabbyRes = await saveGrabby({
            ...modeOpts,
            startingTile: args.place.tilePos,
        }, {
            ...generalOpts,
            out,
            errOut,
            // use 0 because the delay is applied to parent cycler
            cycleStartDelay: 0
        }, {
            extraPreStageVarSubstitutions: {
                // mode specific
                '%category': 'by-region',
                '%period': modeOpts.period,
                '%country_flag': args.countryFlag,
                '%country': args.countryName,
                '%place': sanitizeFilename(args.place.name),
                '%place_number': args.place.number.toString(),
            },
            tileToTileImageFilepathMap: modeOpts.reuseTiles ? args.tileToTileImageFilepathMap : undefined
        });

        // propagate written paths to cycler for this mode
        saveGrabbyRes.postWrittenTileImagePaths.forEach(filePath => args.markFilepathWritten(filePath, true));
        saveGrabbyRes.postWrittenErrorPaths.forEach(filePath => args.markFilepathWritten(filePath, false));

        if (modeOpts.reuseTiles)
            saveGrabbyRes.writtenTileToTileImageFilepathMap.forEach((value, key) => args.tileToTileImageFilepathMap.set(key, value));
    }

    await new Cycler()
        .startDelay(generalOpts.cycleStartDelay)
        .outputFilepath(generalOpts.out, generalOpts.errOut, {
            pre({ pattern, cycleStarted }) {
                return substituteOutVariables(pattern, {
                    '%leaderboard_date': formatDateToFsSafeIsolike(cycleStarted),
                });
            },

            cycle({ pattern, cycleStarted, preStageFmtedFilepath, tilePos, attemptIndex }) {
                return substituteOutVariables(preStageFmtedFilepath, {
                });
            },

            post({ writtenPath, cycleStarted, cycleFinished: cycleEnded, cycleElapsedMs }) {
                return substituteOutVariables(writtenPath, {
                    '%leaderboard_duration': formatMsToDurationDirnamePart(cycleElapsedMs)
                });
            }
        })
        .cycle(async ({
            getTileWriteFilepath,
            getErrorWriteFilepath,
            markFilepathWritten
        }) => {
            const tileToTileImageFilepathMap = new Map<string, string>();

            for (const [countryI, countryObj] of countries.entries()) {
                const countryWithFlag = `${countryObj.flag} ${countryObj.country}`;
                logInfo(`fetching country: ${chalk.bold(countryWithFlag)}`);

                const places = await fetchCountryPlaces(countryObj.index);
                for (const [placeI, place] of places.entries()) {
                    await archivePlace({
                        getTileWriteFilepath,
                        getErrorWriteFilepath,
                        markFilepathWritten,
                        tileToTileImageFilepathMap,
                        countryName: countryObj.country,
                        countryFlag: countryObj.flag,
                        place,
                        countryIndex: countryI,
                        countriesTotal: countries.length,
                        placeIndex: placeI,
                        placesTotal: places.length
                    });
                }
            }
        })
        .start()
}

function unrawPlace(place: PlaceRaw): Place {
    return {
        ...place,
        tilePos: TilePosition.fromLatLon(place.lastLatitude, place.lastLongitude)
    }
}