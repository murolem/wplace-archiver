import { z } from 'zod';
import * as semver from 'semver';
import { program } from 'commander';

export const semverSchema = z.string()
    .refine(str => semver.valid(str));

export function parseSemverSchema(value: string): string {
    try {
        return semverSchema.parse(value);
    } catch (err) {
        program.error(`failed to parse semver schema: invalid format; got: ${value}`);
    }
}