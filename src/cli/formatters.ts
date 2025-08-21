import { wrapStringToLength } from '$cli/utils';

/**
 * Formats out path example path.
 * @param str Path to format.
 */
export function formatOutPathExample(str: string): string {
    return wrapStringToLength(str, 30, [" ", "/"], '↴')
}

