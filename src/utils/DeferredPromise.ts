import { noop } from './noop';

/**
 * A promise `resolve` function.
*/
export type Resolve<T = any> =
    /**
     * @param value a value to resolve the promise with.
     */
    (value: T) => void;

/**
 * A promise `reject` function.
*/
export type Reject<T = any> =
    /**
     * @param reason an optional reject reason.
     */
    (reason?: T) => void;

/**
 * A function that executes in promise.
 */
export type Executor<T = any, A = any> =
    /**
     * @param resolve a function that resolves the promise.
     * @param reject a function that rejects the promise.
     */
    (resolve: Resolve<T>, reject: Reject<A>) => void;

/**
 * A regular Promise but with its `resolve` and `reject` handles exposed.
 */
export class DeferredPromise<T> extends Promise<T> {
    resolve: Resolve<T>;
    reject: Reject<T>;

    constructor(executor: Executor<T> = noop) {
        let resolveHandle: Resolve<T>;
        let rejectHandle: Reject<T>;
        super((resolve, reject) => {
            resolveHandle = resolve;
            rejectHandle = reject;

            executor(resolve, reject);
        });

        this.resolve = resolveHandle!;
        this.reject = rejectHandle!;
    }
}