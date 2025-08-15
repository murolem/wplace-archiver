import { Logger } from '$utils/logger'
import type { GeneralOptions, GrabbyByRegionOpts, Place } from '$src/types'
import chalk from 'chalk'
import { applyNumberUnitSuffix, formatDateToFsSafeIsolike, formatMsToDurationDirnamePart } from '$src/lib/formatters'
import { Cycler } from '$lib/Cycler'
import { TilePosition } from '$lib/TilePosition'
import { err, ok } from 'neverthrow'
import { countries } from '$lib/countries'
import { z } from 'zod'
import sanitizeFilename from 'sanitize-filename'
import { saveGrabby } from '$src/saveGrabby'
import path from 'path'
import { isRetryableResponse } from '$lib/network'
const modeLogger = new Logger("mode-grabby-leaderboard-by-region");
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

export async function saveGrabbyByRegion(modeOpts: GrabbyByRegionOpts, generalOpts: GeneralOptions) {
    logInfo(chalk.bold.magenta("⭐ GRABBY LEADERBOARD ARCHIVAL MODE ⭐"));
    logInfo(`archiving leaderboard ${chalk.bold('by-region')}, ${chalk.bold(modeOpts.period)} period. countries to plow through: ${chalk.bold(countries.length)}`);

    const fetchCountryPlaces = async (id: number): Promise<Place[]> => {
        const url = `https://backend.wplace.live/leaderboard/region/all-time/${id}`;
        logInfo(`fetching all-time places \nurl: ${url}`)

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
        countryName: string,
        countryFlag: string,
        countryIndex: number,
        countriesTotal: number,
        placeIndex: number,
        placesTotal: number,
        place: Place
    }) => {
        const shareUrl = `https://wplace.live/?lat=${args.place.lastLatitude}&lng=${args.place.lastLongitude}&zoom=11`;
        logInfo(`[country ${args.countryIndex + 1} of ${args.countriesTotal}] [place ${args.placeIndex + 1} of ${args.placesTotal}] fetching place: ${chalk.bold(args.place.name)} (${applyNumberUnitSuffix(args.place.pixelsPainted)} pixels) \nwplace url: ${shareUrl}`);

        const grabbyWorkdir = path.join(
            generalOpts.out,
            modeOpts.placeOutDirpath
                .replaceAll('%period', modeOpts.period)
                .replaceAll('%country_flag', args.countryFlag)
                .replaceAll('%country', args.countryName)
                .replaceAll('%place_number', args.place.number.toString())
                .replaceAll('%place', sanitizeFilename(args.place.name))
        );
        await saveGrabby({
            ...modeOpts,
            startingTile: args.place.tilePos,
            out: modeOpts.fromPlaceOutDirpath
        }, {
            ...generalOpts,
            out: grabbyWorkdir,
            cycleStartDelay: 1
        });
    }

    const cycler = new Cycler({
        workingDir: generalOpts.out,
        cycleStartDelayMs: generalOpts.cycleStartDelay,

        cycleDirpathPreFormatter(timeStart) {
            return `grabs-by-region-archival-log/${formatDateToFsSafeIsolike(timeStart)}-%duration`;
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
            for (const [countryI, countryObj] of countries.entries()) {
                const countryWithFlag = `${countryObj.flag} ${countryObj.country}`;
                logInfo(`fetching country: ${chalk.bold(countryWithFlag)}`);

                const places = await fetchCountryPlaces(countryObj.index);
                for (const [placeI, place] of places.entries()) {
                    await archivePlace({
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
        }
    });

    await cycler.start(generalOpts.loop);
}

function unrawPlace(place: PlaceRaw): Place {
    return {
        ...place,
        tilePos: new TilePosition(
            lon2tile(place.lastLongitude, 11),
            lat2tile(place.lastLatitude, 11),
        )
    }
}

// converters from https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Common_programming_languages

function lon2tile(lon: number, zoom: number): number { return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom))); }
function lat2tile(lat: number, zoom: number): number { return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))); }

function tile2long(x: number, z: number): number {
    return (x / Math.pow(2, z) * 360 - 180);
}
function tile2lat(y: number, z: number): number {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}