import { clamp } from '$utils/clamp';

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

export async function tryGetResponseBodyAsText(response: Response): Promise<string | null> {
    return await response.text()
        .catch(err => null);
}