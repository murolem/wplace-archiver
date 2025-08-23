import { program } from '@commander-js/extra-typings';
import { Logger } from '$logger';
import * as semver from 'semver';
import { spawn } from './utils/spawn';
import chalk from 'chalk';
import path from 'path';
import { z } from 'zod';
import { semverSchema } from '$tasks/utils/schema';
import { editor as promptEditor } from '@inquirer/prompts';
const { logDebug, logInfo, logError, logFatalAndThrow } = new Logger("task:build_and_upload");

const programParsed = program
    .name("task:build_and_upload")
    .argument('<version>', "Semver version to mark the build with.")
    .option('-v', "Enables verbose logging.")
    .parse();

const opts = programParsed.opts();

if (opts.v)
    Logger.setLogLevel('DEBUG');

const version = programParsed.args[0];
if (!semver.valid(version))
    program.error(`invalid semver version: ${version}`);

logInfo("fetching latest version metadata from repo")

const latestReleaseRes = await spawn("gh release view --json tagName", { noInheritStdout: true })
if (latestReleaseRes.isErr())
    logFatalAndThrow({ msg: `failed to fetch latest release info`, data: latestReleaseRes.error });

let latestReleaseJson;
try {
    // @ts-ignore what is your problem TS annoying little asshole
    latestReleaseJson = JSON.parse(latestReleaseRes.value);
} catch (err) {
    // @ts-ignore
    logFatalAndThrow({ msg: "failed to parse latest release info json", data: latestReleaseRes.value });
}

const latestReleaseJsonParsed = z.object({
    tagName: semverSchema
}).safeParse(latestReleaseJson);
if (!latestReleaseJsonParsed.success)
    logFatalAndThrow({
        msg: `failed to parse latest release info`, data: latestReleaseJsonParsed.error
    });

const repoVersion = latestReleaseJsonParsed.data!.tagName;
logInfo("repo version: " + chalk.bold(repoVersion));
if (semver.compare(version, repoVersion) <= 0)
    logFatalAndThrow(`failed to create release: version ${chalk.bold(version)} is behind repo version ${chalk.bold(repoVersion)}`);

const notes = await promptEditor({
    message: "Type Release Notes",
    default: `\n\n**Full Changelog**: https://github.com/murolem/wplace-archiver/compare/${repoVersion}...${version}`,
    postfix: ".md",
    waitForUseInput: false
});

const platforms = [
    "windows-x64",
    "linux-x64"
] as const;

logInfo(`building version ${chalk.bold(version)}`);

const artifacts: string[] = [];
for (const platform of platforms) {
    logInfo(`↳ building platform ${chalk.bold(platform)}`);

    let outfile = path.join("dist", `wplace-archiver_${version}_${platform}`);
    if (platform === 'windows-x64')
        outfile += ".exe";

    const target = `bun-${platform}`;
    const command = `bun build ./src/cli/index.ts --compile --minify --sourcemap --outfile "${outfile}" --target ${target}`;
    logDebug("command: " + command);

    const buildRes = await spawn(command);
    if (buildRes.isErr())
        logFatalAndThrow({ msg: `build failed: ${buildRes.error.reason}`, data: buildRes.error.error });

    artifacts.push(outfile);

    logDebug(`built: ${path.resolve(outfile)}`);
}

logInfo(`creating release ${chalk.bold(version)}`);

const releaseCreateRes = await spawn(`gh release create ${version}`, { args: ["-t", version, "-n", notes] });
if (releaseCreateRes.isErr())
    logFatalAndThrow({ msg: `release creation failed failed`, data: releaseCreateRes.error });

logInfo(`uploading artifacts`);

while (true) {
    const uploadRes = await spawn(`gh release upload ${version}`, { args: artifacts });
    if (uploadRes.isErr()) {
        logError({ msg: `upload failed, retrying`, data: uploadRes.error });
        continue;
    }

    break;
}

logInfo(`✅ all done! \nrelease: ` + chalk.bold(`https://github.com/murolem/wplace-archiver/releases/tag/${version}`));