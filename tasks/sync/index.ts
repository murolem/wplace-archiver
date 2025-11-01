import { program } from '@commander-js/extra-typings';
import { Logger } from '$logger';
import fs from 'fs-extra';
import { spawn } from '../../src/utils/spawn';
import chalk from 'chalk';
import path from 'path';
import { z } from 'zod';
import { ghReleaseAssetDigestSha256Schema } from '$tasks/utils/schema';
import { minimatch } from 'minimatch';
import { err, ok } from 'neverthrow';
import { checkIntegrity } from '$tasks/utils/checkIntegrity';
import { getIntRangeParser } from '$cli/parsers';
import { formatProgressToPercentage } from '$lib/utils/logging';
import { filesize as prettyFilesize } from "filesize";
import { validateCommandExistsSync } from '$tasks/utils/validateCommandExists';
import { fetchChunked } from '$tasks/utils/fetchChunked';
import { metadataLatestVersion, metadataSchemaLatest as OfflineReleaseMetadataSchemaLatest, parseMetadata, type Metadata, type MetadataLatest, type MetadataLatest as OfflineReleaseMetadataLatest } from './schema/offlineMeta';
const logger = new Logger("task:sync");
let { logDebug, logInfo, logError, logFatalAndThrow } = logger;

const programParsed = program
    .name("task:sync")
    .description(`\
Syncs archives with an archives repo, storing a local copy of any remote archive. 

${chalk.bold.yellow("Warning:")} sync task takes over the output directory, so make sure ${chalk.bold("not to store anything in there")} (besides archives created with this program), otherwise expect a possible ${chalk.bold.magenta("loss of data")}.`)
    .option("-q <query glob>", "Glob to select archives to sync. Run against archive release titles.", "*")
    .option("-o <path>", "Output directory path.", "archives-sync")
    .option("--repo <repo>", "Github repository containing archives formatted '<OWNER/REPO>'. Archives are assumed to be in form of releases.", "murolem/wplace-archives")
    .option("--chunk-size <MB>", "Chunk size in megabytes. Each part is downloaded in chunks. Note that smaller chunks will take longer to download due to additional request overhead.", getIntRangeParser(1, Infinity), 20)
    .option("--meta <name>", "Name for a JSON metadata file stored locally along each release.", ".meta.json")
    .option("--no-meta", "Disables storing a JSON metadata file locally along each release.")
    .option("--no-post-sync-verify", `Disables verifying part integrity after syncing. ${chalk.bold("May result in " + chalk.magenta("corrupted") + " archive parts")}.`)
    .option("--verify-synced", "Enables verifying integrity of already synced parts. If enabled, will run once on program start.")
    .option("--no-log-progress", "Disabled continuous logging of sync progress.")
    // .option("--loop <cron>", `Enables infinite syncing. Uses cron expression to plan for syncs (but ${chalk.italic("does not")} actually uses cron for scheduling). By default, runs every 30 minutes.`, "*/30 * * * *")
    .option('-v', "Enables verbose logging.")
    .parse();

const opts = programParsed.opts();
const releaseGlob = opts.q;
const outputDirpath = opts.o;
const chunkSizeBytes = opts.chunkSize * 1000 * 1000;

if (opts.v)
    Logger.setLogLevel('DEBUG');


validateCommandExistsSync("gh");


logInfo("fetching releases from the repo");

const releaseSchema = z.object({
    name: z.string(),
    createdAt: z.coerce.date(),
    publishedAt: z.coerce.date(),
});

let releasesList: z.infer<typeof releaseSchema>[];
{
    let releasesListStr: string;
    while (true) {
        const releasesListStrRes = await spawn('gh release list', {
            returnStdout: true,
            stdout: null,
            args: [
                '--repo', opts.repo,
                '--json', 'createdAt,name,publishedAt',
                "--limit", '999999999999999'
            ]
        });

        if (releasesListStrRes.isErr()) {
            logError({
                msg: "failed to retrieve releases list; retrying",
                data: releasesListStrRes.error
            });
            continue;
        }

        releasesListStr = releasesListStrRes.value;
        break;
    }

    try {
        releasesList = releaseSchema
            .array()
            .parse(
                JSON.parse(releasesListStr)
            );
    } catch (err) {
        logFatalAndThrow({
            msg: "failed to parse releases list",
            data: {
                rawData: releasesListStr,
                error: err
            }
        });
        throw ''//type guard
    }
}

const releasesFiltered = releasesList.filter(r => minimatch(r.name, releaseGlob));
logInfo(`${chalk.bold(releasesList.length)} releases found; ${chalk.bold(releasesFiltered.length)} left after filtering`);

if (releasesFiltered.length === 0)
    logFatalAndThrow("no releases left after filtering through the glob.");


if (fs.existsSync(outputDirpath)) {
    if (!fs.statSync(outputDirpath).isDirectory())
        logFatalAndThrow("output dirpath is not a directory: " + outputDirpath);
} else {
    fs.mkdirSync(outputDirpath);
}

const releaseMetadataSchema = z.object({
    body: z.string(), // example: "World archive `archive--2025-08-09T20-01-14.231Z--2025-08-09T22-23-30.212Z`.\n",
    assets: z.array(
        z.object({
            // apiUrl: z.string(), // example: https://api.github.com/repos/murolem/wplace-archives/releases/assets/285392660
            // contentType: z.string(), // example: audio/x-pn-audibleaudio
            // createdAt: z.coerce.date(), // example: 2025-08-23T05:34:28Z
            digest: z.string(), // example: sha256:feeff59e85d7b329f7c95532ff12ef9076adb3638c95b92d5e519d9729d0f096
            downloadCount: z.int(), // example: 10
            // id: z.string(), // example: RA_kwDOPbf4es4RAr8U
            // label: z.string(),
            name: z.string(), // example: archive--2025-08-09T20-01-14.231Z--2025-08-09T22-23-30.212Z.tar.gz.aa
            size: z.number(), // example: 9723904
            // state: z.string(), // example: uploaded
            // updatedAt: z.string(), // example: 2025-08-23T05:36:48Z
            url: z.string(), // example: https://github.com/murolem/wplace-archives/releases/download/world-2025-08-09T20-01-14.231Z/archive--2025-08-09T20-01-14.231Z--2025-08-09T22-23-30.212Z.tar.gz.a
        })
    )
});

for (const [i, release] of releasesFiltered.entries()) {
    const loggerRelease = logger.clone().appendLogPrefix(`release ${i + 1} of ${releasesFiltered.length}`);
    let { logDebug, logInfo, logError, logFatalAndThrow } = loggerRelease;

    logInfo(`fetching metadata for release ${chalk.bold(release.name)}`);

    let releaseMetadata: z.infer<typeof releaseMetadataSchema>;
    while (true) {
        const metadataRawRes = await spawn('gh release view', {
            returnStdout: true,
            stdout: null,
            args: [
                '--repo', opts.repo,
                '--json', 'body,assets',
                release.name
            ]
        });
        if (metadataRawRes.isErr()) {
            logError("failed to retrieve metadata; retrying");
            continue;
        }

        try {
            releaseMetadata = releaseMetadataSchema
                .parse(
                    JSON.parse(metadataRawRes.value)
                );
            break;
        } catch (err) {
            logFatalAndThrow({
                msg: "failed to parse release metadata",
                data: {
                    rawData: metadataRawRes.value,
                    error: err
                }
            });
            throw ''//type guard
        }
    }

    const releaseDirpath = path.join(outputDirpath, release.name);
    if (fs.existsSync(releaseDirpath)) {
        if (!fs.statSync(releaseDirpath).isDirectory())
            logFatalAndThrow("release dirpath is not a directory: " + releaseDirpath);
    } else {
        fs.mkdirSync(releaseDirpath);
    }

    logInfo(`${chalk.gray("release directory: " + releaseDirpath)}`);

    if (opts.meta) {
        let offlineMetadata: Metadata;
        const offlineMetadataFilepath = path.join(releaseDirpath, opts.meta);

        const createAndWriteOfflineMetadata = (): Metadata => {
            (offlineMetadata as MetadataLatest) = {
                metadataVersion: 2,
                title: release.name,
                created: release.createdAt > release.publishedAt ? release.createdAt : release.publishedAt,
                description: releaseMetadata.body,
                parts: releaseMetadata.assets.map(ass => ({
                    filename: ass.name,
                    digest: ass.digest,
                    sizeBytes: ass.size,
                }))
            }

            logDebug("writing metadata to: " + offlineMetadataFilepath);
            fs.writeJSONSync(offlineMetadataFilepath, offlineMetadata, { spaces: 4 });

            return offlineMetadata;
        };

        if (fs.existsSync(offlineMetadataFilepath)) {
            try {
                offlineMetadata = parseMetadata(fs.readJsonSync(offlineMetadataFilepath));
            } catch (err) {
                logError({
                    msg: "failed to parse offline release metadata; recreating",
                    data: {
                        error: err
                    }
                });


                // metadata corrupted > recreate
                offlineMetadata = createAndWriteOfflineMetadata();
            }

            // metadata of old version > upgrade
            if (offlineMetadata.metadataVersion !== metadataLatestVersion) {
                logInfo(chalk.gray("upgrading metadata"));
                createAndWriteOfflineMetadata();
            }
        } else {
            // metadata not exists > create
            createAndWriteOfflineMetadata();
        }
    }


    const fsScan = fs.readdirSync(releaseDirpath);
    const fsScanExpected: string[] = [
        ...(opts.meta ? [opts.meta] : []),
        ...releaseMetadata.assets
            .map(ass => ass.name)
    ]
    const fsScanExtra = fsScan.filter(e => !fsScanExpected.includes(e));
    const fsScanMissing = fsScanExpected.filter(e => !fsScan.includes(e));

    for (const e of fsScanExtra) {
        logInfo(chalk.bold.magenta(`purging extra: ${e}`));

        const entryPath = path.join(releaseDirpath, e);
        await fs.rm(entryPath, { force: true, recursive: true });
    }

    for (const [iAsset, asset] of releaseMetadata.assets.entries()) {
        const loggerAsset = loggerRelease.clone()
            .appendLogPrefix(`part ${iAsset + 1} of ${releaseMetadata.assets.length}`);

        let { logDebug, logInfo, logError, logFatalAndThrow } = loggerAsset;

        const assetFilepath = path.join(releaseDirpath, asset.name);
        const tryPurgeAsset = async () => await fs.rm(assetFilepath, { force: true });

        logInfo(`syncing part ${chalk.bold(asset.name)} \n${chalk.gray("to: " + assetFilepath)}`);

        // skip download if exists
        if (!fsScanMissing.includes(asset.name)) {
            logDebug("already synced");

            let needsRedownload = false;

            logDebug("verifying size of already synced");

            const currentSize = (await fs.stat(assetFilepath)).size;
            const expectedSize = asset.size;
            if (currentSize !== expectedSize) {
                logError(`synced, but size mismatch (${chalk.bold(currentSize + ' != ' + expectedSize)}); ${chalk.magenta.bold("purging")}, re-syncing`)
                needsRedownload = true;
            }

            // only check if size check has succeeded since if it has failed it's already queued for destruction
            if (opts.verifySynced && !needsRedownload) {
                logDebug("verifying integrity of already synced");

                let sha256HashExpected: string;
                {
                    try {
                        sha256HashExpected = ghReleaseAssetDigestSha256Schema.parse(asset.digest);
                    } catch (err) {
                        logFatalAndThrow({
                            msg: "failed to parse asset digest",
                            data: {
                                digest: asset.digest,
                                error: err,
                            }
                        });
                        throw ''//type guard
                    }
                }

                if (!await checkIntegrity(assetFilepath, sha256HashExpected)) {
                    logError(`synced, but integrity check failed; ${chalk.magenta.bold("purging")}, re-syncing`);
                    needsRedownload = true;
                }
            }

            if (needsRedownload) {
                await tryPurgeAsset();
            } else {
                continue;
            }
        }

        while (true) {
            // download
            logDebug("downloading")

            let bytesDown: number = 0;
            let chunkProgress: number = 0;
            let chunksTotal: number | null = null;

            const logChunkProgress = () => {
                const t = bytesDown / asset.size;

                const loggerChunk = loggerAsset.clone()
                    .appendLogPrefix(`chunk ${chunkProgress}` + (chunksTotal === null ? '' : ` of ${chunksTotal}`));

                loggerChunk.logInfo(`progress: ${formatProgressToPercentage(t, 0)} (${prettyFilesize(bytesDown)} => ${prettyFilesize(asset.size)})`);
            }

            try {
                const res = await fetchChunked(asset.url, {
                    chunkSize: chunkSizeBytes,

                    async onChunk(accum, chunk, { chunksTotal: chunksTotalArg, size }) {
                        if (!chunksTotal)
                            chunksTotal = chunksTotalArg;

                        await fs.appendFile(assetFilepath, new Uint8Array(chunk));

                        bytesDown += size;
                        chunkProgress++;

                        if (opts.logProgress)
                            logChunkProgress();
                    }
                })
                    .then(res => ok(res))
                    .catch(error => err(error));

                if (res.isErr()) {
                    logError({
                        msg: 'part download failed; retrying',
                        data: {
                            error: res.error
                        }
                    });

                    // remove any partially saved data
                    await tryPurgeAsset();
                    continue;
                }
            } catch (err) {
                logError({
                    msg: 'part download failed; retrying',
                    data: {
                        error: err
                    }
                });

                // remove any partially saved data
                await tryPurgeAsset();
                continue;
            }

            // verify
            if (opts.postSyncVerify) {
                logDebug("verifying integrity")
                let sha256HashExpected: string;
                {
                    try {
                        sha256HashExpected = ghReleaseAssetDigestSha256Schema.parse(asset.digest);
                    } catch (err) {
                        logFatalAndThrow({
                            msg: "failed to parse asset digest",
                            data: {
                                digest: asset.digest,
                                error: err,
                            }
                        });
                        throw ''//type guard
                    }
                }

                if (!await checkIntegrity(assetFilepath, sha256HashExpected)) {
                    logError(`integrity check failed; ${chalk.magenta.bold("purging")}, re-syncing`);
                    await tryPurgeAsset();
                    continue;
                }
            }

            logInfo("✅");

            break;
        }
    }
}

logInfo("✅ sync is complete");