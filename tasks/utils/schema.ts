import { z } from 'zod';
import * as semver from 'semver';

export const semverSchema = z.string()
    .refine(str => semver.valid(str));