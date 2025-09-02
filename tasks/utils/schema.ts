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

export const ghReleaseAssetDigestSchema = z.string()
    .refine(value => {
        const parts = value.split(":");
        if (parts.length !== 2)
            return false;
        if (parts[0] !== 'sha256')
            return false;

        return true;
    });

export const ghReleaseAssetDigestSha256Schema = z.string()
    .refine(value => ghReleaseAssetDigestSchema.safeParse(value).success)
    .transform(value => {
        return value.split(":")[1];
    })