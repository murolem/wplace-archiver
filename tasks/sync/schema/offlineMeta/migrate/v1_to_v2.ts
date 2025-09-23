import { defineMigration } from './index';

export const migrate = defineMigration(1, 2, data => {
    return {
        metadataVersion: 2,
        title: data.name,
        created: data.created,
        description: data.description,
        parts: data.artifacts.map(e => ({
            filename: e.name,
            digest: e.digest,
            sizeBytes: e.size
        }))
    }
});