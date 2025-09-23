import type { offlineSchemaBase } from '../base';
import type z from 'zod';
import { metadataSchemaLatest, type MapofVersionToSchema, type Metadata, type MetadataLatest, type MetadataVersion } from '../index';
import { Logger } from '$logger';
import type { ZodType } from 'zod';
const { logDebug, logFatalAndThrow } = new Logger("task:sync/schema/migrate");

type MigrationCb<T1 extends ZodType = typeof offlineSchemaBase, T2 extends ZodType = typeof offlineSchemaBase> =
    (data: z.infer<T1>) => z.infer<T2>;

const migrations: Partial<
    Record<MetadataVersion, {
        targetVersion: MetadataVersion,
        cb: MigrationCb<any, any>
    }>
> = {}

export function defineMigration<T1 extends MetadataVersion, T2 extends MetadataVersion>(
    fromVersion: T1,
    toVersion: T2,
    cb: MigrationCb<MapofVersionToSchema[T1], MapofVersionToSchema[T2]>
): void {
    if (fromVersion in migrations)
        logFatalAndThrow(`duplicate migration ${fromVersion} > ${toVersion}`);

    migrations[fromVersion] = {
        targetVersion: toVersion,
        cb
    }
}

// ==========

/**
 * Converts metadata to latest version. 
 * If metadata is already of latest version, does nothing.
 * @param metadata Metadata to convert.
 */
export function migrateToLatestMetadata(metadata: Metadata): MetadataLatest {
    let migrated = structuredClone(metadata);
    let migrationVersionChain = [metadata.metadataVersion];
    while (true) {
        const migrationCfg = migrations[metadata.metadataVersion as keyof typeof migrations];
        if (!migrationCfg)
            break;

        logDebug(`migrating metadata v${migrated.metadataVersion ?? '<no version?>'} > v${migrationCfg.targetVersion}`);

        migrated = migrationCfg.cb(migrated);

        migrationVersionChain.push(migrationCfg.targetVersion);
    }

    try {
        return metadataSchemaLatest.parse(migrated);
    } catch (err) {
        logFatalAndThrow({
            msg: "migration failed: failed to parse resulting migrated data according to the latest schema",
            data: {
                initialData: metadata,
                migratedData: migrated,
                migrationChain: migrationVersionChain,
                error: err
            }
        });
        throw ''//type guard
    }
}