import { semverSchema } from '$tasks/utils/schema';
import { program } from '@commander-js/extra-typings';
import isValidPath from 'is-valid-path';

export function parseSemverSchema(value: string): string {
    try {
        return semverSchema.parse(value);
    } catch (err) {
        program.error(`failed to parse semver schema: invalid format; got: ${value}`);
    }
}

export function parsePath(pathStr: string): string {
    return isValidPath(pathStr)
        ? pathStr
        : program.error(`failed to parse path: path is invalid; got: ${pathStr}`);
}