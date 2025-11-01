import { Logger } from '$utils/logger'
import type { GeneralOpts, DiffOpts } from '$cli/types'
import { getTempdir } from '$utils/tempdir'
import path from 'path'
import { ensureArchiveUnpacked } from '$lib/utils/pack'
import cryptoRandomString from 'crypto-random-string'
import { DiffFile } from '$lib/DiffFile'
import { toOsPath } from '$utils/toOsPath'
const modeLogger = new Logger("diff-create");
const { logDebug, logInfo, logError, logWarn, logFatalAndThrow } = modeLogger;

export async function diffCreate(
    modeOpts: DiffOpts,
    generalOpts: GeneralOpts
) {
    const tempdir = getTempdir();

    const unpackedDirpath1 = await ensureArchiveUnpacked(modeOpts.keyArchive, path.join(tempdir, cryptoRandomString({ length: 15 })));
    const unpackedDirpath2 = await ensureArchiveUnpacked(modeOpts.targetArchive, path.join(tempdir, cryptoRandomString({ length: 15 })));

    // const concatResArchiveFilepath = path.join(tempdir, "archive.tar.gz");
    // logInfo("concatenating")
    // logDebug("to: " + concatResArchiveFilepath);

    // await concatFilesGlob(
    //     modeOpts.keyArchive,
    //     concatResArchiveFilepath
    // )

    console.log(unpackedDirpath1);

    logInfo("clearing temp files");
    // fs.rm(tempdir, { force: true, recursive: true });
}

Logger.setLogLevel('DEBUG')


const archive1 = "working/world-2025-09-21T18-24-43.963Z/*.tar.gz*";
const archive2 = "working/world-2025-09-21T21-23-47.681Z/*.tar.gz*";

const working1Dirpath = await ensureArchiveUnpacked(archive1, "working/w1");
const working2Dirpath = await ensureArchiveUnpacked(archive2, "working/w2");

const diffFile = await DiffFile.create(
    toOsPath(`${working1Dirpath}/0/0.png`),
    toOsPath(`${working2Dirpath}/0/0.png`),
)
// console.log(diffFile);