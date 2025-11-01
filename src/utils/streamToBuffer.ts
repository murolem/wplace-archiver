import { err, ok, type Result } from 'neverthrow';
import { Readable } from 'node:stream'

/**
 * Converts a readable Node.JS stream to buffer.
 * Returns wrapped buffer or a wrapper error, if read errored.
 * @param stream Readable stream.
 */
export async function streamToBuffer(stream: Readable): Promise<Result<Buffer, unknown>> {
    return await new Promise(resolve => {
        const parts: Buffer[] = [];

        stream.on('data', chunk => parts.push(chunk));
        stream.on('end', () => resolve(ok(Buffer.concat(parts))));
        stream.on('error', error => {
            stream.destroy();
            resolve(err(error))
        })
    })
}