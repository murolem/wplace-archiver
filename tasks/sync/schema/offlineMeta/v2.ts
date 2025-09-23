import { offlineSchemaBase } from './base';
import z from 'zod';

export type OfflineMetaSchema = z.infer<typeof offlineMetaSchema>;
export const offlineMetaSchema = offlineSchemaBase.extend({
    /** Version of this metadata. */
    metadataVersion: z.literal(2),

    /** 
     * Archive release name.
     * @example world-2025-09-22T17-49-18.014Z
     */
    title: z.string(),

    /** Archive release creation date. */
    created: z.coerce.date(),

    /** Archive release description. */
    description: z.string(),

    /** Archive parts. */
    parts: z.object({
        /** Part filename.  */
        filename: z.string(),

        /** Part hash in format `<algorithm>:<hash>`. */
        digest: z.string(),

        /** Size in bytes. */
        sizeBytes: z.number()
    }).array(),
});
