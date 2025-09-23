import { spawn as nodeSpawn } from 'child_process';
import { err, ok, Result } from 'neverthrow';
import parseArgsStringToArgv from 'string-argv';
import fs from 'fs-extra';

export async function spawn(command: string, opts: Partial<{
    /** 
     * Stdin source.
     * @default inherit
     */
    stdin: 'inherit' | null | NodeJS.ReadableStream,

    /** 
     * Stdout target.
     * @default inherit
     */
    stdout: 'inherit' | null | NodeJS.WritableStream,

    /** 
     * Stdout target.
     * @default inherit
     */
    stderr: 'inherit' | null | NodeJS.WritableStream,

    /**
     * Whether to return stdout once the program finishes. Buffers output internally (but does not stop it).
     * @default false
     */
    returnStdout: boolean,

    /** Same as argument array in original `spawn()`. Will be appended. */
    args: string[],

    /** Environment variables. */
    env: Record<string, string>,

    /** Working directory. */
    cwd: string,

    /**
     * Callback when process is created.
     * @param process Process
     * @returns Void.
     */
    processCreatedCb: (process: ReturnType<typeof nodeSpawn>) => void | Promise<void>,

    /**
     * Timeout for the process, ms.
     */
    timeoutMs: number
}> = {}) {
    opts.stdin = opts.stdin === undefined ? 'inherit' : opts.stdin;
    opts.stdout = opts.stdout === undefined ? 'inherit' : opts.stdout;
    opts.stderr = opts.stderr === undefined ? 'inherit' : opts.stderr;
    opts.returnStdout ??= false;

    const firstSpaceIdx = command.indexOf(" ");
    const commandMain = command.slice(0, (firstSpaceIdx === -1 ? undefined : firstSpaceIdx));
    const argsStr = command.slice(commandMain.length + 1);

    return new Promise<Result<string, {
        reason: "non-zero exit code",
        error: {
            exitCode: number | null
        }
    } | {
        reason: "error",
        error: unknown
    }>>(async (resolve, reject) => {
        const dataChunks: Buffer[] = [];
        const spawnedProcess = nodeSpawn(commandMain, [
            ...parseArgsStringToArgv(argsStr),
            ...(opts.args ?? [])
        ], {
            stdio: [
                opts.stdin === 'inherit' ? 'inherit' : 'pipe',
                opts.stdout === 'inherit' ? 'inherit' : 'pipe',
                opts.stderr === 'inherit' ? 'inherit' : 'pipe'
            ],
            env: {
                ...process.env,
                FORCE_COLOR: "true",
                ...(opts.env ?? {})
            },
            cwd: opts.cwd,
            timeout: opts.timeoutMs
        })
            .on('exit', code => {
                if (code === 0)
                    return resolve(ok(
                        dataChunks
                            .map(chunk => chunk.toString())
                            .join("\n")
                            .trimEnd()
                    ));
                else
                    return resolve(err({ reason: "non-zero exit code", error: { exitCode: code } }));
            })
            .on('error', error => resolve(err({ reason: "error", error })));

        switch (opts.stdout) {
            case 'inherit': spawnedProcess.stdout?.pipe(process.stdout); break;
            case null: spawnedProcess.stdout?.pipe(fs.createWriteStream("/dev/null")); break;
            default: /* stream */ spawnedProcess.stdout?.pipe(opts.stdout!)
        }

        switch (opts.stderr) {
            case 'inherit': spawnedProcess.stderr?.pipe(process.stderr); break;
            case null: spawnedProcess.stderr?.pipe(fs.createWriteStream("/dev/null")); break;
            default: /* stream */ spawnedProcess.stderr?.pipe(opts.stderr!)
        }

        if (opts.returnStdout)
            spawnedProcess.stdout?.on('data', chunk => dataChunks.push(chunk));

        if (opts.processCreatedCb)
            await opts.processCreatedCb(spawnedProcess);
    })
}
