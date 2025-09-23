import { offlineSchemaBase } from './base';
import z from 'zod';

export type OfflineMetaSchema = z.infer<typeof offlineMetaSchema>;
export const offlineMetaSchema = offlineSchemaBase.extend({
    /** Version of this metadata. */
    metadataVersion: z.literal(1),

    /** Archive name (not file name). */
    name: z.string(),

    /** Date of creation. */
    created: z.coerce.date(),

    /** Description body. */
    description: z.string(),

    /** Archive parts. */
    artifacts: z.object({
        /** Part filename.  */
        name: z.string(),

        /** Part hash in format `<algorithm>:<hash>`. */
        digest: z.string(),

        /** Size in bytes. */
        size: z.number(),

        /** Number of downloads. */
        downloadCount: z.int()
    }).array(),
});