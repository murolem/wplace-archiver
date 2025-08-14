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

export type GeneralOptions = {
    out: string,
    loop: boolean,
    requestsPerSecond: number,
    requestConcurrency: number,
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
