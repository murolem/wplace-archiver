import type { TilePosition } from '$lib/utils/TilePosition'
import type { leaderboardPeriods } from '$src/cli'
import type { PlaceRaw } from '$src/saveGrabbyLeaderboardsByRegion'
import type { Region } from '$src/saveRegion'

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
    leaderboardPeriod: GrabbyByRegionOpts['period'],
    leaderboardNumber: number, // ex: 56,
}

export type Place = PlaceRaw & {
    tilePos: TilePosition
};

export type TileImage = ArrayBuffer;

export type Position = {
    x: number,
    y: number
}

export type Size = {
    w: number,
    h: number
}