import { clamp } from '$utils/math/clamp';
import { Response as ResponseUndici } from 'undici';

export function getExpDelayCalculator(config: {
    startingDelayMs: number,
    factor: number,
    maxDelayMs: number
}) {
    const c = config;
    c.startingDelayMs = clamp(c.startingDelayMs, 0, Infinity);
    c.factor = clamp(c.factor, 0, Infinity);
    c.maxDelayMs = clamp(c.maxDelayMs, 0, Infinity);

    return (attemptIndex: number) => {
        return clamp(c.startingDelayMs * (c.factor ** attemptIndex), 0, c.maxDelayMs);
    }
}

export async function tryGetResponseBodyAsText(response: Response | ResponseUndici): Promise<string | null> {
    return await response.text()
        .catch(err => null);
}

export function isRetryableStatus(status: number): boolean {
    if (status >= 500)
        return true;

    switch (status) {
        case 408: return true // timeout
        case 429: return true // too many requests
        default: return false
    }
}

export function isRetryableResponse(response: Response | ResponseUndici): boolean {
    return isRetryableStatus(response.status);
}