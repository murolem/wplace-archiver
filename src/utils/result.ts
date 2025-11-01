import type { Result } from 'neverthrow';

/** Unwraps value from a Result type. */
export type ResultUnwrapped<T extends Result<any, any>> = ReturnType<T['_unsafeUnwrap']>;