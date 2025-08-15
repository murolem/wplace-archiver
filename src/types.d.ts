import type { TilePosition } from '$lib/TilePosition'
import type { PlaceRaw } from '$src/saveGrabbyByRegion'
import type { Region } from '$src/saveRegion'

export type RegionOpts = {
    region: Region,
    out: string
}

export type GrabbyOpts = {
    startingTile: TilePosition,
    pixelThreshold: number,
    tileTolerance: number,
    radius: number,
    out: string
}

export type GrabbyByRegionOpts = {
    pixelThreshold: number,
    tileTolerance: number,
    radius: number,
    /** --out2 cli arg */
    placeOutDirpath: string,
    /** --out3 cli arg */
    fromPlaceOutDirpath: string,
    period: 'today' | 'week' | 'month' | 'all-time'
}


export type Place = PlaceRaw & {
    tilePos: TilePosition
};


export type GrabbyMetadataPlace = {
    id: number, // ex: 115328,
    name: string,// ex: "Mérida",
    countryId: number, // ex: 140,
    countryFlag: string,
    countryWithFlag: string,
    country: string,
    cityId: number, // ex: 2142,
    lastLongitude: number, // ex: -89.58875976562501
    lastLatitude: number, // ex: 21.003373619322986,
    pixelsPainted: number, // ex: 861488,
    leaderboardCategory: 'regions',
    leaderboardPeriod: 'today' | 'week' | 'month' | 'all-time',
    leaderboardNumber: number, // ex: 56,
}

export type GeneralOptions = {
    out: string,
    loop: boolean,
    requestsPerSecond: number,
    requestConcurrency: number,
    /** cycle start delay in seconds */
    cycleStartDelay: number,
    respectTooManyRequestsDelay: boolean
}

export type TileImage = ArrayBuffer;

export type Position = {
    x: number,
    y: number
}

export type Size = {
    w: number,
    h: number
}
