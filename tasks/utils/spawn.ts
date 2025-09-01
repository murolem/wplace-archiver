import { spawn as nodeSpawn } from 'child_process';
import { err, Ok, ok, Result } from 'neverthrow';
import parseArgsStringToArgv from 'string-argv';

export async function spawn(command: string, opts: Partial<{
    /** Disabled piping spawned process stdout to current process stdout. */
    noInheritStdout: boolean,

    noReturnStdout: boolean,

    pipeStdin: boolean,

    /** Same as argument array in original `spawn()`. Will be appended. */
    args: string[],

    env: Record<string, string>,

    cwd: string,

    processCreatedCb: (process: ReturnType<typeof nodeSpawn>) => void,

    timeoutMs: number
}> = {}) {
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
    }>>((resolve, reject) => {
        const dataChunks: Buffer[] = [];
        const spawnedProcess = nodeSpawn(commandMain, [
            ...parseArgsStringToArgv(argsStr),
            ...(opts.args ?? [])
        ], {
            stdio: [
                opts.pipeStdin ? "pipe" : "inherit",
                "pipe",
                "pipe"
            ],
            env: {
                ...process.env,
                FORCE_COLOR: "true",
                ...(opts.env ?? {})
            },
            cwd: opts.cwd ?? process.cwd(),
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

        if (!opts.noInheritStdout) {
            spawnedProcess.stdout?.pipe(process.stdout);
            spawnedProcess.stderr?.pipe(process.stderr);
        }

        if (!opts.noReturnStdout)
            spawnedProcess.stdout?.on('data', chunk => dataChunks.push(chunk));

        opts.processCreatedCb?.(spawnedProcess);
    })
}
