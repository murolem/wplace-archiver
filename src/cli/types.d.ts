import type { outVariableNames } from '$cli/constants'

export type GeneralOpts = {
    out: string,
    errOut: string | null,
    loop: boolean,
    requestsPerSecond: number,
    requestConcurrency: number,
    /** cycle start delay in seconds */
    cycleStartDelay: number,
    freebind?: string,
    v?: boolean
}

export type RegionOpts = {
    region: Region,
}

export type GrabbyOpts = {
    startingTile: TilePosition,
    pixelThreshold: number,
    tileTolerance: number,
    radius: number,
}

export type GrabbyByRegionOpts = {
    pixelThreshold: number,
    tileTolerance: number,
    radius: number,
    period: 'today' | 'week' | 'month' | 'all-time',
    reuseTiles: boolean
}

/**
 * Weak out variable-value mapping.
 */
export type OutVariableWeakMap = Partial<Record<typeof outVariableNames[number], string>>;