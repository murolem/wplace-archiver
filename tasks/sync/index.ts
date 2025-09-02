import { program } from '@commander-js/extra-typings';
import { Logger } from '$logger';
import fs from 'fs-extra';
import { spawn } from '../utils/spawn';
import chalk from 'chalk';
import path from 'path';
import { z } from 'zod';
import { ghReleaseAssetDigestSha256Schema } from '$tasks/utils/schema';
import { minimatch } from 'minimatch';
import makeFetchRetry from 'fetch-retry';
import streamp from 'stream/promises';
import { err, ok } from 'neverthrow';
import { checkIntegrity } from '$tasks/utils/checkIntegrity';
import { getIntRangeParser } from '$cli/parsers';
import { formatProgressToPercentage } from '$lib/logging';
import { filesize as prettyFilesize } from "filesize";
import { validateCommandExistsSync } from '$tasks/utils/validateCommandExists';
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
    .option("--timeout <minutes>", "Sync timeout for a part download, minutes. If download exceeds timeout, it will be restarted.", getIntRangeParser(1, Infinity), 20)
    .option("--meta <name>", "Name for a JSON metadata file stored locally along each release.", ".meta.json")
    .option("--no-meta", "Disables storing a JSON metadata file locally along each release.")
    .option("--no-post-sync-verify", `Disables verifying part integrity after syncing. ${chalk.bold("May result in " + chalk.magenta("corrupted") + " archive parts")}.`)
    .option("--verify-synced", "Enables verifying integrity of already synced parts. If enabled, will run once on program start.")
    .option("--log-sync-progress <frequency_seconds>", "Frequency of sync progress continuous logging, seconds.", getIntRangeParser(1, Infinity), 1)
    .option("--no-log-sync-progress", "Disabled continuous logging of sync progress.")
    // .option("--loop <cron>", `Enables infinite syncing. Uses cron expression to plan for syncs (but ${chalk.italic("does not")} actually uses cron for scheduling). By default, runs every 30 minutes.`, "*/30 * * * *")
    .option('-v', "Enables verbose logging.")
    .parse();

const opts = programParsed.opts();
const releaseGlob = opts.q;
const outputDirpath = opts.o;
const logSyncProgressEnabled: boolean = opts.logSyncProgress !== false;
const logSyncProgressFrequencySec: number = typeof opts.logSyncProgress === 'number' ? opts.logSyncProgress : -1;
const timeoutMs = opts.timeout * 60 * 1000;

if (opts.v)
    Logger.setLogLevel('DEBUG');

const fetchRetry = makeFetchRetry(fetch, {
    retries: 9999999999,
    retryDelay: 1000,
});


validateCommandExistsSync("gh");


logInfo("fetching releases from the repo");

const releaseSchema = z.object({
    name: z.string(),
    createdAt: z.coerce.date(),
    publishedAt: z.coerce.date(),
});

let releasesList: z.infer<typeof releaseSchema>[];
{
    const releasesListStrRes = await spawn('gh release list', {
        args: [
            '--repo', opts.repo,
            '--json', 'createdAt,name,publishedAt',
            "--limit", '999999999999999'
        ]
    });

    if (releasesListStrRes.isErr())
        logFatalAndThrow({
            msg: "failed to retrieve releases list",
            data: releasesListStrRes.error
        });



    try {
        releasesList = releaseSchema
            .array()
            .parse(
                JSON.parse(releasesListStrRes._unsafeUnwrap())
            );
    } catch (err) {
        logFatalAndThrow({
            msg: "failed to parse releases list",
            data: {
                rawData: releasesListStrRes._unsafeUnwrap(),
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

type OfflineReleaseMetadata = z.infer<typeof offlineReleaseMetadataSchema>;
const offlineReleaseMetadataSchema = z.object({
    metadataVersion: z.literal(1),
    name: z.string(),
    created: z.coerce.date(),
    description: z.string(),
    artifacts: z.object({
        name: z.string(),
        digest: z.string(),
        size: z.number(),
        downloadCount: z.int()
    }).array(),
})

for (const [i, release] of releasesFiltered.entries()) {
    const logger2 = logger.clone().appendLogPrefix(`rel ${i + 1} of ${releasesFiltered.length}`);
    let { logDebug, logInfo, logError, logFatalAndThrow } = logger2;

    logInfo(`fetching metadata for release ${chalk.bold(release.name)}`);

    let releaseMetadata: z.infer<typeof releaseMetadataSchema>;
    while (true) {
        const metadataRawRes = await spawn('gh release view', {
            noInheritStdout: true,
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
        let offlineMetadata: OfflineReleaseMetadata;
        const offlineMetadataFilepath = path.join(releaseDirpath, opts.meta);

        const ensureOfflineMetadata = (): void => {
            offlineMetadata = {
                metadataVersion: 1,
                name: release.name,
                created: release.createdAt > release.publishedAt ? release.createdAt : release.publishedAt,
                description: releaseMetadata.body,
                artifacts: releaseMetadata.assets.map(ass => ({
                    name: ass.name,
                    digest: ass.digest,
                    size: ass.size,
                    downloadCount: ass.downloadCount
                }))
            }

            fs.writeJSONSync(offlineMetadataFilepath, offlineMetadata, { spaces: 4 });
        };

        if (fs.existsSync(offlineMetadataFilepath)) {
            try {
                offlineMetadata = offlineReleaseMetadataSchema
                    .parse(fs.readJsonSync(offlineMetadataFilepath))
            } catch (err) {
                logError({
                    msg: "failed to parse offline release metadata; recreating",
                    data: {
                        error: err
                    }
                });
                ensureOfflineMetadata();
            }
        } else {
            ensureOfflineMetadata();
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
        let { logDebug, logInfo, logError, logFatalAndThrow } = logger2.clone()
            .appendLogPrefix(`part ${iAsset + 1} of ${releaseMetadata.assets.length}`);

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
                logError(`synced, but size mismatch (${chalk.bold(currentSize + ' !== ' + expectedSize)}); ${chalk.magenta.bold("purging")}, re-syncing`)
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

            let logSyncProgressHandle: ReturnType<typeof setInterval> | null = null;
            if (logSyncProgressEnabled) {
                logSyncProgressHandle = setInterval(async () => {
                    const currentSize = (await fs.exists(assetFilepath))
                        ? (await fs.stat(assetFilepath)).size
                        : 0;
                    const expectedSize = asset.size;

                    const t = currentSize / expectedSize;
                    logInfo(`progress: ${formatProgressToPercentage(t, 0)} (${prettyFilesize(currentSize)} => ${prettyFilesize(expectedSize)})`);
                }, logSyncProgressFrequencySec * 1000)
            }

            try {
                const res = await fetchRetry(asset.url, {
                    signal: AbortSignal.timeout(timeoutMs),
                    async retryOn(attempt, error, response) {
                        if (error === null && response && response.ok)
                            return false;

                        // remove any partially saved data
                        await tryPurgeAsset();

                        // retry on any network error, or 5xx status codes
                        if (error !== null || (response && response.status >= 500)) {
                            logError("downloaded failed; retrying");
                            return true;
                        } else {
                            logFatalAndThrow({
                                msg: "downloaded failed; non-recoverable",
                                data: {
                                    responseStatus: response?.status,
                                    responseStatusText: response?.statusText,
                                    response
                                }
                            });
                            throw ''//type guard
                        }
                    }
                })
                    // @ts-ignore its fine
                    .then(res => streamp.pipeline(res.body!, fs.createWriteStream(assetFilepath)))
                    .then(ok)
                    .catch(err);

                if (logSyncProgressHandle)
                    clearTimeout(logSyncProgressHandle);

                if (res.isErr()) {
                    logError({
                        msg: 'download failed (#2); retrying',
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
                    msg: 'download failed (#3); retrying',
                    data: {
                        error: err
                    }
                });

                if (logSyncProgressHandle)
                    clearTimeout(logSyncProgressHandle);

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