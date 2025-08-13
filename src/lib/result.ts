import { stringify, stringifyError } from '$lib/stringify';
import type { Err } from 'neverthrow';

export function stringifyErr(value: Err<any, any>): string {
    const body = value.error();
    return stringify({
        ...body,
        error: body.error === undefined ? undefined : stringifyError(body.error)
    });
}


// export type Success<T extends unknown = unknown> = {
//     success: true,
//     data: T
// }
// export function makeSuccess<T extends unknown>(data: T): Success<T> {
//     return { success: true, data }
// }

// export type Failure<R extends string = string, C extends unknown = unknown, E extends unknown = unknown> = {
//     success: false,
//     reason: R,
//     context: C,
//     error?: E
// };

// const foo = makeFailure('asfsadf', { bobop: 123 });

// export function makeFailure<R extends string, C extends unknown = unknown, E extends unknown = unknown>(reason: R, context?: C, error?: E): Failure<R, C, E> {
//     return {
//         success: false,
//         reason,
//         context,
//         error
//     } satisfies Failure<R, C, E>;
// }
// export function stringifyFailure<T extends Failure>(value: T): string {
//     return stringify({
//         ...value,
//         // @ts-ignore FUCK TYPESCRIPT
//         error: value.error === undefined ? undefined : stringifyError(value.error)
//     });
// }

// export type Result<D extends unknown = unknown, ER extends string = string, EC extends unknown | undefined = undefined, EE extends unknown | undefined = undefined> = Success<D> | Failure<ER, EC, EE>;
// export function makeResult<T extends Result>(value: T): T { return value; }