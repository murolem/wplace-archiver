import type { Region } from '$src/saveRegion'

export type RegionOpts = {
    region: Region,
    out: string
}

export type GrabbyOpts = {
    startingTile: Position,
    threshold: number,
    radius: number,
    out: string
}

export type GeneralOptions = {
    out: string,
    loop: boolean,
    requestsPerSecond?: number,
    requestsPerMinute: number,
    requestConcurrency: number
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
