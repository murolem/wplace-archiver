import { z } from 'zod';
import * as semver from 'semver';
import { program } from 'commander';

export const semverSchema = z.string()
    .refine(str => semver.valid(str));