import z from 'zod';

export type OfflineSchemaBase = z.infer<typeof offlineSchemaBase>;
export const offlineSchemaBase = z.object({
    metadataVersion: z.number()
})