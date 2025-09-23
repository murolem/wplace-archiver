import { Logger } from '$utils/logger'
import type { Position, TileImage } from '$src/types'
import chalk from 'chalk'
import { applyNumberUnitSuffix, formatDateToFsSafeIsolike, formatMsToDurationDirnamePart, substituteOutVariables } from '$src/lib/formatters'
import { TileFetchQueue } from '$lib/TileFetchQueue'
import { Cycler } from '$lib/Cycler'
import { wait } from '$utils/wait'
import { Jimp } from "jimp";
import { getTileLogPrefix } from '$lib/logging'
import { TilePosition } from '$lib/TilePosition'
import { err, ok, type Result } from 'neverthrow'
import PQueue from 'p-queue'
import { SigintConfirm } from '$utils/sigintConfirm'
import type { GrabbyOpts, GeneralOpts, OutVariableWeakMap, DiffOpts } from '$cli/types'
import fs from 'fs-extra';
import { getTempdir } from '$utils/tempdir'
import { convergeFilenames } from '$utils/convergePaths'
import { concatFilesGlob } from '$utils/concatFiles'
import path from 'path';
import { unpackArchive } from '$lib/pack'
import cryptoRandomString from 'crypto-random-string'
const modeLogger = new Logger("diff-create");
const { logDebug, logInfo, logError, logWarn, logFatalAndThrow } = modeLogger;

export async function diffCreate(
    modeOpts: DiffOpts,
    generalOpts: GeneralOpts
) {
    const tempdir = getTempdir();

    const unpackedDirpath1 = await unpackArchive(modeOpts.keyArchive, path.join(tempdir, cryptoRandomString({ length: 15 })));
    // const unpackedDirpath2 = await unpackArchive(modeOpts.targetArchive, path.join(tempdir, cryptoRandomString({ length: 15 })));

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

