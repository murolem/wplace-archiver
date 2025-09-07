import z from 'zod';
import { clamp } from '$utils/clamp';
import { Logger } from '$logger';
import { err, ok, Result } from 'neverthrow';
const logger = new Logger("fetchChunked")
const { logError, logFatalAndThrow } = logger;

const rangeSizeValidator = z.int().positive();

export const defaultContinueOn: FetchChunkedOpts['continueOn'] = (response, error) => {
    // console.log(response, error);

    if (response && response.status >= 500)
        return true;
    else if (error !== undefined)
        return true;

    return false;
}

export const defaultOnChunkResponse: FetchChunkedOpts['onChunkResponse'] = async (response, onRangeChunkCb) => {
    const bytes = await response.arrayBuffer();
    onRangeChunkCb(bytes);
}

export const defaultOnChunk: FetchChunkedOpts['onChunk'] = async (accum, chunk) => {
    accum.push(chunk);
}


export type FetchChunkedOpts = RequestInit & {
    /** 
     * Whether to continue when a response is received/error is thrown.
     * 
     * 
     * By default uses {@link defaultContinueOn} - returns true on 5XX codes and general errors (caught with try catch).
     * 
     * @param response Received response, if any.
     * @param error Thrown error, if any.
     */
    continueOn: (response?: Response, error?: unknown) => boolean,

    /**
     * Chunk size in bytes.
     * Only used when {@link FetchChunkedOpts.continue} is enabled and server supports ranges requests.
     * 
     * @default 
     * 10 * 1000 * 1000 (10MB)
     */
    chunkSize: number,

    /**
     * Callback for when a range response is received.
     * 
     * By default uses {@link defaultOnChunkResponse} - response body is awaited and passed to {@link FetchChunkedOpts.onChunk}. 
     * @param response Response.
     */
    onChunkResponse(response: Response, onRangeChunkCb: (chunk: ArrayBuffer) => void): Promise<void>

    /** 
     * Callback for when a range chunk is received.
     * Only used when {@link FetchChunkedOpts.continue} is enabled and server supports ranges requests.
     * 
     * By default uses {@link defaultOnChunk} - accumulates all received chunks.
     * @param accum Accumulator for chunks. When resource is fully fetched, accum is concatenated and result is returned.
     * @param chunk Bytes.
     * @param args Extra arguments. 
    */
    onChunk(accum: ArrayBuffer[], chunk: ArrayBuffer, args: {
        /** Size of chunk in bytes. */
        size: number,

        /** Size of entire resource in bytes. If total size is unknown, set to `-1`. */
        sizeTotal: number,

        /** Total chunk count. */
        chunksTotal: number,

        /** Response. */
        response: Response
    }): Promise<void>,

    /** 
     * Callback for when entire resource has been fetched.
     * Only used when {@link FetchChunkedOpts.continue} is enabled and server supports ranges requests.
     */
    onComplete(): void,
}

/**
 * Fetches URL using HTTP Range Requests. 
 * If server does not support range requests, fallbacks to regular fetch.
 * @param url Url to fetch.
 * @param opts Fetch options with some extra.
 * 
 * @throws {Error} If server does not support range requests.
 */
export async function fetchChunked(url: string, opts: Partial<FetchChunkedOpts>): Promise<Uint8Array> {
    // distinct own opts
    const opts2 = {
        continueOn: opts.continueOn ?? defaultContinueOn,
        chunkSize: rangeSizeValidator.parse(opts.chunkSize ?? 10 * 1000 * 1000),
        onRangeResponse: opts.onChunkResponse ?? defaultOnChunkResponse,
        onChunk: opts.onChunk ?? defaultOnChunk,
        onComplete: opts.onComplete
    };

    // cleanup fetch init
    for (const opt in opts2) {
        delete opts[opt as keyof FetchChunkedOpts];
    }

    // check for range support
    const head = await fetch(url, {
        ...opts,
        method: 'HEAD'
    });

    const acceptRangesHead = head.headers.get('Accept-Ranges');
    if (!acceptRangesHead || acceptRangesHead === 'none')
        throw new Error("server does not support range requests ('Accept-Ranges' header is missing or 'none'); got: " + acceptRangesHead);

    // get range metadata
    const contentLengthHead = head.headers.get('Content-Length');
    if (!contentLengthHead)
        throw new Error("'Content-Length' header missing");

    const contentLength = parseInt(contentLengthHead);
    if (isNaN(contentLength))
        throw new Error("'Content-Length' parse error: value is NaN; got: " + contentLengthHead);

    const chunkCount = Math.ceil(contentLength / opts2.chunkSize);

    // fetch ranges
    const accum: ArrayBuffer[] = [];
    let byteOffset = 0;
    while (true) {
        const bytesOffsetEnd = clamp(byteOffset + opts2.chunkSize - 1, 0, contentLength - 1);
        if (bytesOffsetEnd < byteOffset)
            break;

        const headers = {
            ...(opts.headers ?? {}),
            'Range': 'bytes=' + byteOffset + '-' + bytesOffsetEnd
        }
        const reqOpts: RequestInit = {
            ...opts,
            headers
        }

        let responseRes: Result<Response, unknown>;
        try {
            responseRes = await fetch(url, reqOpts)
                .then(res => ok(res))
                .catch(error => err(error));
        } catch (error) {
            console.log("ERROR")
            if (opts2.continueOn?.(undefined, error)) {
                continue;
            } else {
                logFatalAndThrow({
                    msg: "fetch error",
                    data: error
                });
                throw '' //type guard
            }
        }

        if (responseRes.isErr()) {
            if (opts2.continueOn?.(undefined, responseRes.error)) {
                continue;
            } else {
                logFatalAndThrow({
                    msg: "fetch error (#2)",
                    data: responseRes.error
                });
                throw '' //type guard
            }
        }


        const response = responseRes.value;

        if (!response.ok && opts2.continueOn?.(response, undefined))
            continue;

        await opts2.onRangeResponse(response, async (chunk) => {
            await opts2.onChunk(accum, chunk, {
                size: chunk.byteLength,
                sizeTotal: contentLength ?? -1,
                chunksTotal: chunkCount,
                response
            });
        })

        byteOffset += opts2.chunkSize;
    }

    opts2.onComplete?.();

    const arr = new Uint8Array();
    for (const buf of accum) {
        // @ts-ignore its fine
        arr.set(buf, buf.byteLength);
    }

    return arr;
}