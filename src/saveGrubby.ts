import { TileFetchQueue } from '$lib/TileFetchQueue';
import type { GeneralOptions, GrubbyOpts } from '$src/types';

export async function saveGrubby(modeOpts: GrubbyOpts, generalOpts: GeneralOptions) {
    const rps = generalOpts.requestsPerSecond
        ?? generalOpts.requestsPerMinute / 60
    const tileQueue = new TileFetchQueue({ requestsPerSecond: rps, requestConcurrency: generalOpts.requestConcurrency });


}

