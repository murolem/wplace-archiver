
import { Logger } from '$logger';
const { logFatalAndThrow } = new Logger("task:sync/schema");
import type { z, ZodType } from 'zod';
import './v1';
import './v2';
import { err, ok, type Result } from 'neverthrow';
import { offlineSchemaBase } from '$tasks/sync/schema/offlineMeta/base';

export type Metadata = z.infer<MapofVersionToSchema[MetadataVersion]>;
export type MetadataVersion = keyof MapofVersionToSchema;
export type MapofVersionToSchema = typeof mapofVersionToSchema;
export const mapofVersionToSchema = {
    1: (await import('./v1')).offlineMetaSchema,
    2: (await import('./v2')).offlineMetaSchema,
} satisfies Record<number, ZodType>;

export const metadataLatestVersion: MetadataVersion = 2;

export type MetadataLatest = z.infer<typeof metadataSchemaLatest>;
export const metadataSchemaLatest = mapofVersionToSchema[metadataLatestVersion];

// =========

/**
 * Parses metadata. Throws if parsing failed.
 * @param metadata 
 * @throws {Error} If metadata version is unknown.
 * @throws {Error} If metadata is malformed.
 */
export function parseMetadata(metadata: unknown): Metadata {
    const parsed = parseMetadataSafe(metadata);
    if (!parsed.isOk()) {
        logFatalAndThrow({
            msg: "failed to parse metadata",
            data: parsed.error
        });
        throw ''//type guard
    }

    return parsed.value;
}

/**
 * Parses metadata without throwing errors on parse failure.
 * @param metadata Metadata to parse.
 */
export function parseMetadataSafe(metadata: unknown): Result<
    Metadata,
    { reason: 'parse-error', error: unknown, data: unknown }
    | { reason: 'unknown-version', version: number, data: unknown }
> {
    const parsedBaseRes = offlineSchemaBase.safeParse(metadata);
    if (!parsedBaseRes.success)
        return err({ reason: 'parse-error', error: parsedBaseRes.error, data: metadata });

    const matchingSchema = mapofVersionToSchema[parsedBaseRes.data.metadataVersion as MetadataVersion];
    if (!matchingSchema)
        return err({ reason: 'unknown-version', version: parsedBaseRes.data.metadataVersion, data: metadata });

    try {
        return ok(matchingSchema.parse(metadata));
    } catch (error) {
        return err({ reason: 'parse-error', error, data: metadata });
    }
}