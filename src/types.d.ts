import type { Region } from '$src/saveRegion'

export type RegionOpts = {
    region: Region,
    out: string
}

export type GeneralOptions = {
    out: string,
    loop: boolean,
    requestsPerSecond?: number,
    requestsPerMinute: number,
    requestConcurrency: number
}