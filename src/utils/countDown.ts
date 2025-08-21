import { Logger } from '$logger';
import { wait } from '$utils/wait';
const logger = new Logger("countdown");
const { logInfo } = logger;

/**
 * Prints message every second for `seconds` duration.
 * @param seconds 
 * @param getMessage 
 */
export async function countDown(seconds: number, getMessage: (secondsLeft: number) => string, logFn?: (msg: string) => unknown): Promise<void> {
    if (seconds < 0)
        throw new Error("expected 'seconds' to be positive or zero");

    for (let i = seconds; i >= 0; i--) {
        (logFn ?? logInfo)(getMessage(i));

        if (i > 0)
            await wait(1000);
    }
}