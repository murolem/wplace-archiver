import type { StringOr } from '$utils/stringOr';
import { err, ok, type Result } from 'neverthrow';
import z from 'zod';
import { Logger } from '$logger';
import fsPromises from 'fs/promises';
import fs from 'fs';
import { createFileReader } from '$lib/fs/createFileReader';
import { pipeline } from 'stream/promises';
import { streamToBuffer } from '$utils/converters/streamToBuffer';
import type { Readable } from 'stream';
import type { MaybePromise } from 'bun';
import type { ResultUnwrapped } from '$utils/result';
const { logDebug, logFatalAndThrow } = new Logger('DiffFile/encoder');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number#number_encoding
const BYTELEN_NUMBER = 4;

// padding for strings
const BYTEPAD_STR = '\0';

/**
 * Describes a regular encoder field that has a name, type and some value.
 */
type FieldStandard<TName extends string, TType> = {
    /** Role of this field. */
    role: 'standard',

    /** Field name. */
    name: TName,

    /** 
     * Field encoder to bytes. 
     * 
     * The encoder field must validate the proper size in bytes on its own before encoding. */
    encode: (value: TType) => MaybePromise<Buffer>,

    /** 
     * Field decoder from bytes. 
     * 
     * The bytesize is always guaranteed by the internal decoder to be the exact size specified for this field. */
    decode: (bytes: Buffer) => MaybePromise<Result<TType, unknown>>,

    /** 
     * Field size in bytes. 
     * 
     * Can be set to `-1` to use a length specifier field instead (must define a length specifier field first).
     */
    byteLength: number
}

/**
 * Describes a specialized encoder field used to define bytelength of a subsequent field.
 * 
 * To use this field, a standard field must set its bytelength to `-1`.
 */
type FieldLengthSpecifier<TName extends string> = {
    /** Role of this field. */
    role: 'length-specifier',

    /** Field name. */
    name: TName,

    /** Field encoder to bytes. */
    encode: (value: number) => Buffer,

    /** Field decoder from bytes. */
    decode: (bytes: Buffer) => Result<number, unknown>,

    /** Field size in bytes. */
    byteLength: typeof BYTELEN_NUMBER,

    /** Name of a field this field defines bytelength for. */
    forField: string
}

/** Describes an encoder field. */
type Field<TName extends string, TType> = FieldStandard<TName, TType> | FieldLengthSpecifier<TName>;


/** Extracts decoded type wrapped in `Result<..>` from an encoder field definition. */
type FieldDecodeResultWrapped<T extends Field<any, any>> = Awaited<ReturnType<T['decode']>>;

/** Extracts decoded type from an encoder field definition. */
type FieldDecodeResultUnwrapped<T extends Field<any, any>> = ResultUnwrapped<FieldDecodeResultWrapped<T>>;

/**Extracts `T` record field whose `name` field is equal to `TName`. */
type ExtractTypeByNameProp<T, TName extends string> = Extract<T, { name: TName }>;

/**
 * Maps an array of field definitions to a record with field names as keys and their types as values.
 */
export type FieldsRecordUnwrapped<TFieldArr extends Field<any, any>[]> = {
    [Key in TFieldArr[number]['name']]: FieldDecodeResultUnwrapped<ExtractTypeByNameProp<TFieldArr[number], Key>>;
}


/**
 * Describes a field decode error.
 */
type FieldDecodeError = {
    reason: string,
    data: unknown,
    error?: unknown,
};

/**
 * Describes a field decode result.
 */
type FieldDecodeResult<T> = Result<T, FieldDecodeError>;


/**
 * Describes an encoder decode success.
 */
export type EncoderDecodeSuccess<T> = {
    byteLength: number,
    decoded: T,
}

/**
 * Describes an encoder decode result.
 */
export type EncoderDecodeResult<T> = EncoderDecodeSuccess<T>;


/**
 * Extracts schema from an encoder.
 */
export type InferEncoderSchema<T extends Encoder<any>> = ReturnType<T['decode']>;

/**
 * Byte encoder/decoder. Uses build-like style to construct a schema.
 * 
 * `encode()`/`decode()` methods can then be used to encode data and decode bytes, respectively.
 */
export class Encoder<T extends Field<StringOr<never>, any>[] = []> {
    /** Internal store of fields. */
    private fields: Field<any, any>[] = [];

    /**
     * Decodes bytes into a string.
     * @param bytes Bytes.
     * @returns Decoded string.
     * @throws {Error} On decode error.
     */
    static bytesToStr(bytes: Buffer): string {
        try {
            return textDecoder.decode(bytes);
        } catch (err) {
            logFatalAndThrow({
                msg: "failed to decode bytes to string",
                data: {
                    error: err
                }
            });
            throw ''//type guard
        }
    }

    /**
     * Decodes bytes into an integer. Does not do any checks on the resulting value.
     * @param bytes Bytes.
     * @returns Decoded integer.
     * @throws {Error} On decode error.
     */
    static bytesToInt(bytes: Buffer): number {
        try {
            return bytes.readInt32LE();
        } catch (err) {
            logFatalAndThrow({
                msg: "failed to decode bytes to string",
                data: {
                    error: err
                }
            });
            throw ''//type guard
        }
    };

    /**
     * Creates a new instance of the Encoder.
     * @param fields Optional field definitions. **You probably want to use {@link Encoder.clone} instead since passing them here does not inherit the types**
     */
    constructor(fields?: Field<any, any>[]) {
        if (fields)
            this.fields = fields;
    }

    /** 
     * Creates a copy of this encoder instance (with types preserved).
     * 
     * **Note that the defined fields from the original are reused instead of being copied.**
     */
    clone(): this {
        return new Encoder([...this.fields]) as any;
    }


    /**
     * Encodes a `Record` based on constructed schema to bytes.
     * @param data Data to encode.
     * @returns Bytes.
     */
    async encode(data: FieldsRecordUnwrapped<T>): Promise<Buffer> {
        logDebug("starting encode (reverse order)");

        const buffs: Buffer[] = [];
        // bytelengths of enumerated fields
        const fieldBytelengths: Record<string, number> = {};

        let totalLengthBytes = 0;
        // iterate backwards so that we can compute the bytelength specifiers after the fields they are specifying for.
        // with normal order of iteration, we would have to backtrack to do that-so, let's not.
        for (let i = this.fields.length - 1; i >= 0; i--) {
            const field = this.fields[i];
            logDebug(`|> encoding ${field.role} field '${field.name}'`);

            let buf: Buffer;
            if (field.role === 'standard') {
                buf = await field.encode(data[field.name as keyof typeof data]);
            } else {
                const targetFieldBytelength = fieldBytelengths[field.forField];
                if (targetFieldBytelength === undefined) {
                    logFatalAndThrow({
                        msg: "encode failed: encountered a bytelength specifier field, but did not encounter a field for which to specify the length for",
                        data: {
                            field
                        }
                    })
                    throw '';//type guard
                }

                buf = field.encode(targetFieldBytelength);
            }

            fieldBytelengths[field.name] = buf.byteLength;
            totalLengthBytes += buf.byteLength;

            logDebug(`encoded field to ${buf.byteLength} bytes; bytes so far: ${totalLengthBytes}`);

            buffs.push(buf);
        }

        return Buffer.concat(buffs.reverse(), totalLengthBytes);
    }

    /**
     * A universal decode. Decodes bytes directly or by reading from a filepath, producing a `Record` based on constructed schema.
     * @param source Data source.
     * @returns Decoded data.
     */
    async decode(source: Buffer | string): Promise<EncoderDecodeResult<T>> {
        logDebug("starting decode");

        return await (typeof source === 'string'
            ? this.decodeFile(source)
            : this.decodeBytes(source)
        );
    }

    /**
     * Reads a file asynchronously, decoding it into a `Record` based on constructed schema.
     * Bytes are read on per-need basis, meaning any extra bytes will not be read. 
     * For example, if needing to only read the head with a head schema, only the head segment will be actually read.
     * @param filepath Path to file.
     * @returns Decoded data.
     */
    async decodeFile(filepath: string): Promise<EncoderDecodeResult<T>> {
        if (!fs.existsSync(filepath))
            logFatalAndThrow("decode file failed: file does not exists: " + filepath);

        const read = await createFileReader(filepath);

        const lazyDecoder = this.lazyDecoder();
        for await (const step of lazyDecoder) {
            if (step.done) {
                // @ts-ignore
                delete step.done;
                return step;
            } else {
                const bytes = await read(step.bytesWant);
                if (bytes.byteLength < step.bytesWant)
                    logFatalAndThrow(`decode failed: stream run out of bytes; expected ${step.bytesWant} got ${bytes.byteLength}`);

                step.feedBytes(bytes);
            }
        }

        // shouldn't happen
        logFatalAndThrow("decode failed: unexpected loop exit");
        throw ''//type guard
    }

    /**
     * Decodes bytes into a `Record` based on constructed schema.
     * Bytes are read on per-need basis, meaning any extra bytes will not be read. 
     * For example, if needing to only read the head with a head schema, only the head segment will be actually read.
     * @param filepath Path to file.
     * @returns Decoded data.
     */
    async decodeBytes(bytes: Buffer): Promise<EncoderDecodeResult<T>> {
        const lazyDecoder = this.lazyDecoder();
        for await (const step of lazyDecoder) {
            if (step.done) {
                // @ts-ignore
                delete step.done;
                return step;
            } else {
                step.feedBytes(bytes, true);
            }
        }

        // shouldn't happen
        logFatalAndThrow("decode failed: unexpected loop exit");
        throw ''//type guard
    }

    /**
     * A step-by-step decoder that feeds on bytes lazily, requesting chunks from caller.
     * Uses the built schema to decode the data.
     * 
     * Always guarantees a requested bytesize for each field, otherwise throwing an error.
     * @returns 
     */
    private async *lazyDecoder(): AsyncGenerator<{
        /** Whether the decoder is done. When it's done, the result is yielded. */
        done: false,
        bytesWant: number,
        bytesFed: number,
        bytesFedEnd: number,
        feedBytes(bytesSource: Buffer, useOffset?: boolean): void
    } | ({
        done: true,
    } & EncoderDecodeResult<T>)
    > {
        const decodedRecord: Partial<FieldsRecordUnwrapped<T>> = {};
        // maps field names to their bytelength
        const bytelengthSpecifiers: Record<string, number> = {};
        let currentOffsetBytes = 0;
        for (const field of this.fields) {
            logDebug(`<| decoding ${field.role} field '${field.name}'`);

            let byteLength = field.byteLength;
            if (byteLength === -1) {
                byteLength = bytelengthSpecifiers[field.name] ?? -1;
                if (byteLength === -1) {
                    logFatalAndThrow(`decode failed: encountered field '${field.name}' with unknown bytelength and no length specifier field`);
                }
            }

            const offsetEnd = currentOffsetBytes + byteLength;
            const bytes = Buffer.alloc(byteLength);
            let bytesFed = false;
            yield {
                done: false,
                bytesWant: byteLength,
                bytesFed: currentOffsetBytes,
                bytesFedEnd: offsetEnd,
                feedBytes(bytesSource: Buffer, useOffset?: boolean) {
                    if (useOffset) {
                        if (offsetEnd > bytesSource.byteLength)
                            logFatalAndThrow(`decode failed: attempted to read past buffer (range ${currentOffsetBytes}-${offsetEnd} size ${byteLength}; buffer end at ${bytesSource.byteLength})`);

                        bytesSource.copy(bytes, 0, currentOffsetBytes, offsetEnd);
                    } else {
                        bytesSource.copy(bytes);
                    }

                    bytesFed = true;
                }
            }

            if (!bytesFed)
                logFatalAndThrow("decode failed: expected next chunk of bytes but did not receive any");
            else if (bytes.byteLength < byteLength)
                logFatalAndThrow(`decode failed: attempted to read past buffer (range ${currentOffsetBytes}-${offsetEnd} size ${byteLength}; buffer end at ${bytes.byteLength}) #2`);

            const decodedWrapped = await field.decode(bytes);
            if (decodedWrapped.isErr()) {
                logFatalAndThrow({
                    msg: `failed to decode field '${field.name}'`,
                    data: {
                        error: decodedWrapped.error
                    }
                });
                throw ''//type guard
            }

            const decoded = decodedWrapped.value;
            currentOffsetBytes += byteLength;

            if (field.role === 'length-specifier')
                bytelengthSpecifiers[field.forField] = decoded;

            logDebug(`decoded ${byteLength} bytes; bytes so far: ${currentOffsetBytes}`);

            if (field.role === 'standard')
                decodedRecord[field.name as keyof typeof decodedRecord] = decoded;
        }

        yield {
            done: true,
            byteLength: currentOffsetBytes,
            decoded: decodedRecord as any
        };
    }


    /**
     * Registered a binary field.
     * @param name Field name.
     * @param byteLength Length in bytes. Can be set to `-1` to use a length specifier field instead (must define a length specifier field first).
     */
    bytes<TName extends string>(name: TName, byteLength: number): Encoder<[...T, FieldStandard<TName, Buffer>]> {
        this.fields.push({
            role: 'standard',
            name,
            encode: data => this.bytesEncode(data, byteLength),
            decode: this.bytesDecode,
            byteLength
        });

        return this as any;
    }

    private bytesEncode = async (data: Buffer | Readable, byteLength: number): Promise<Buffer> => {
        let dataBuf: Buffer
        if (data instanceof Buffer) {
            dataBuf = data;
        } else {
            const dataBufRes = await streamToBuffer(data as Readable);
            if (dataBufRes.isErr()) {
                logFatalAndThrow({
                    msg: `failed to encode bytes: readable stream read error`,
                    data: dataBufRes.error
                })
                throw ''//guard
            }

            dataBuf = dataBufRes.value;
        }

        if (dataBuf.byteLength !== byteLength)
            logFatalAndThrow(`failed to encode bytes: bytesize mismatch (expected = ${byteLength} bytes, got = ${dataBuf.byteLength} bytes)`);

        return dataBuf;
    }

    private bytesDecode = (bytes: Buffer): FieldDecodeResult<Buffer> => {
        return ok(bytes);
    }

    /**
     * Registers a string field.
     * @param name Field name.
     * @param byteLength Length in bytes.
     * @returns Encoder with field type registered.
     */
    string<TName extends string>(name: TName, byteLength: number): Encoder<[...T, FieldStandard<TName, string>]> {
        this.fields.push({
            role: 'standard',
            name,
            encode: data => this.stringEncode(data, byteLength),
            decode: this.stringDecode,
            byteLength
        });

        return this as any;
    }

    private stringEncode = (data: string, byteLength: number): Buffer => {
        const dataBuf = Buffer.from(textEncoder.encode(data));
        if (dataBuf.byteLength > byteLength)
            logFatalAndThrow({
                msg: `failed to encode string: string is larger then the field size (expected <= ${byteLength} bytes, got ${dataBuf.length} bytes)`,
                data: {
                    string: data
                }
            })

        // exact length = return right away
        if (dataBuf.byteLength === byteLength) {
            return dataBuf;
        }

        // length mismatch = pad end
        const buf = Buffer.alloc(byteLength);
        dataBuf.copy(buf);
        buf.write('\0'.repeat(byteLength - buf.byteLength), buf.byteLength);
        return buf;
    }

    private stringDecode = (bytes: Buffer): FieldDecodeResult<string> => {
        const res = z.string().safeParse(Encoder.bytesToStr(bytes));
        if (res.success) {
            if (res.data.includes(BYTEPAD_STR))
                return ok(res.data.substring(0, res.data.indexOf(BYTEPAD_STR)))
            else
                return ok(res.data);
        } else {
            return err({ reason: 'string parse error', data: { bytes }, error: res.error });
        }
    }


    /**
     * Registers a string literal field.
     * @param name Field name.
     * @param literal String literal.
     * @returns Encoder with field type registered.
     */
    stringLiteral<TName extends string, TLiteral extends string>(name: TName, literal: TLiteral): Encoder<[...T, FieldStandard<TName, TLiteral>]> {
        const byteLength = textEncoder.encode(literal).byteLength;
        this.fields.push({
            role: 'standard',
            name,
            encode: this.stringLiteralEncode,
            decode: bytes => this.stringLiteralDecode(bytes, literal),
            byteLength
        });

        return this as any;
    }

    private stringLiteralEncode = <TLiteral extends string>(data: TLiteral): Buffer => {
        return Buffer.from(data);
    }

    private stringLiteralDecode = <TLiteral extends string>(bytes: Buffer, literal: TLiteral): FieldDecodeResult<TLiteral> => {
        const res = z.literal(literal).safeParse(Encoder.bytesToStr(bytes));
        if (res.success)
            return ok(res.data);
        else
            return err({ reason: 'string literal parse error', data: { bytes }, error: res.error });
    }


    /**
     * Registers an integer field.
     * @param name Field name.
     * @returns Encoder with field type registered.
     */
    int<TName extends string>(name: TName): Encoder<[...T, FieldStandard<TName, number>]> {
        this.fields.push({
            role: 'standard',
            name,
            encode: this.intEncode,
            decode: this.intDecode,
            byteLength: BYTELEN_NUMBER
        });

        return this as any;
    }

    private intEncode = (data: number): Buffer => {
        if (data % 1 !== 0)
            logFatalAndThrow(`encode int failed: not an integer; got ${data}`);

        const buf = Buffer.alloc(BYTELEN_NUMBER)
        buf.writeInt32LE(data);
        return buf;
    }


    private intDecode = (bytes: Buffer): FieldDecodeResult<number> => {
        const num = Encoder.bytesToInt(bytes);
        if (isNaN(num))
            return err({ reason: 'integer parse error: conversion failure', data: { bytes }, error: 'NaN' });

        return ok(num);
    }


    /**
    * Registers a date field.
    * @param name Field name.
    * @returns Encoder with field type registered.
    */
    date<TName extends string>(name: TName): Encoder<[...T, FieldStandard<TName, Date>]> {
        this.fields.push({
            role: 'standard',
            name,
            encode: this.dateEncode,
            decode: this.dateDecode,
            byteLength: BYTELEN_NUMBER
        });

        return this as any;
    }

    private dateEncode = (date: Date): Buffer => {
        return this.intEncode(date.getTime())
    }

    private dateDecode = (bytes: Buffer): FieldDecodeResult<Date> => {
        const msRes = this.intDecode(bytes);
        if (msRes.isErr())
            return err({ reason: "date decode error", data: bytes, error: msRes.error });

        return ok(new Date(msRes.value));
    }


    /**
     * Registers an enum field.
     * @param name Field name.
     * @param choices Enum values.
     * @returns Encoder with field type registered.
     */
    enum<TName extends string, TChoice extends string>(name: TName, choices: TChoice[]): Encoder<[...T, FieldStandard<TName, TChoice>]> {
        this.fields.push({
            role: 'standard',
            name,
            encode: data => this.enumEncode(data, choices),
            decode: bytes => this.enumDecode(bytes, choices),
            byteLength: BYTELEN_NUMBER
        });

        return this as any;
    }

    private enumEncode = <TChoice extends string>(data: TChoice, choices: TChoice[]): Buffer => {
        const idx = choices.indexOf(data);
        return this.intEncode(idx);
    }

    private enumDecode = <TChoice extends string>(bytes: Buffer, choices: TChoice[]): FieldDecodeResult<TChoice> => {
        const idxRes = this.intDecode(bytes);
        if (idxRes.isErr())
            return err({ reason: 'enum parse error: failed to parse index', data: {}, error: idxRes.error });

        const idx = idxRes.value;
        if (idx < 0 || idx >= choices.length)
            return err({ reason: `enum parse error: index out of bounds; got ${idx}, expected 0-${choices.length}`, data: {} });

        return ok(choices[idx]);
    }


    /**
     * Registers an integer list field.
     * @param name Field name.
     * @param length Total items. Can be set to `-1` to use a bytelength length specifier field instead (must define a bytelength length specifier field first).
     * @param separator List separator. Comma `,` by default.
     * @returns Encoder with field type registered.
     */
    intList<TName extends string>(name: TName, length: number): Encoder<[...T, FieldStandard<TName, number[]>]> {
        this.fields.push({
            role: 'standard',
            name,
            encode: this.intListEncode,
            decode: this.intListDecode,
            byteLength: length === -1
                ? length
                : BYTELEN_NUMBER * length
        });

        return this as any;
    }

    private intListEncode = (nums: number[]): Buffer => {
        const totalLengthBytes = BYTELEN_NUMBER * nums.length;
        const buf = Buffer.alloc(totalLengthBytes);

        let currentByteOffset = 0;
        for (const num of nums) {
            if (num % 1 !== 0)
                logFatalAndThrow(`encode int list failed: not an integer; got ${num}`);

            this.intEncode(num).copy(buf, currentByteOffset)
            currentByteOffset += BYTELEN_NUMBER;
        }

        return buf;
    }

    private intListDecode = (bytes: Buffer): FieldDecodeResult<number[]> => {
        const nums: number[] = [];

        let currentByteOffset = 0;
        while (true) {
            // decode item
            let end = currentByteOffset + BYTELEN_NUMBER;
            if (end > bytes.byteLength)
                break;

            const numRes = this.intDecode(bytes.subarray(currentByteOffset, end));
            if (numRes.isErr())
                return err({ reason: 'failed to decode int list entry', data: {}, error: numRes.error });

            nums.push(numRes.value);
            currentByteOffset = end;
        }

        return ok(nums);
    }



    // /**
    // * Registers an encoder field.
    // * 
    // * An encoder field is a bytefield that uses another encoder to encode and decode itself.
    // * @param name Field name.
    // * @param encoder Encoder.
    // * @returns Encoder with field type registered.
    // */
    // subencoder<TName extends string, TEncoder extends Encoder>(name: TName, encoder: TEncoder): Encoder<[...T, FieldStandard<TName, Awaited<ReturnType<TEncoder['decode']>>>]> {
    //     this.fields.push({
    //         role: 'standard',
    //         name,
    //         encode: data => this.subencoderEncode(data, encoder),
    //         decode: data => this.subencoderDecode(data, encoder) as any,
    //         byteLength: BYTELEN_NUMBER
    //     });

    //     return this as any;
    // }

    // private subencoderEncode = async <T extends Encoder>(data: Parameters<T['encode']>[0], encoder: T): Promise<Buffer> => {
    //     return await encoder.encode(data);
    // }

    // private subencoderDecode = async <T extends Encoder>(bytes: Buffer, encoder: T): Promise<Array<Awaited<ReturnType<T['decode']>>>> => {
    //     const decodedArr: any[] = [];
    //     let byteOffset = 0;
    //     while (true) {
    //         const decodedRes = await encoder.decode(bytes);
    //         decodedArr.push(decodedRes.decoded);
    //         byteOffset += decodedRes.byteLength;
    //         if (byteOffset >= bytes.length)
    //             break;
    //     }
    //     return decodedArr;
    // }


    // /**
    // * Registers an encoder list field.
    // * @param name Field name.
    // * @param encoder Encoder.
    // * @param lengthItems Length of the field in items. Can be set to `-1` to use a length specifier field instead (must define a length specifier field first).
    // * @returns Encoder with field type registered.
    // */
    // subencoderList<TName extends string, TEncoder extends Encoder>(name: TName, encoder: TEncoder, lengthItems: number): Encoder<[...T, FieldStandard<TName, Awaited<ReturnType<TEncoder['decode']>>>]> {
    //     this.fields.push({
    //         role: 'standard',
    //         name,
    //         encode: data => this.subencoderEncode(data, encoder),
    //         decode: data => this.subencoderDecode(data, encoder) as any,
    //         byteLength: BYTELEN_NUMBER
    //     });

    //     return this as any;
    // }

    // private subencoderListEncode = async <T extends Encoder>(data: Array<Parameters<T['encode']>[0]>, encoder: T): Promise<Buffer> => {
    //     const encoded: Buffer[] = [];
    //     for (const entry of data) {
    //         encoded.push(await encoder.encode(data));
    //     }
    //     return Buffer.concat(encoded);
    // }

    // private subencoderListDecode = async <T extends Encoder>(bytes: Buffer, encoder: T): Promise<Array<Awaited<ReturnType<T['decode']>>>> => {
    //     return await encoder.decode(bytes) as any;
    // }






    /**
     * Registers a field length specifier field.
     * @param name Field name.
     * @param forField Target field.
     * @returns Encoder.
     */
    fieldLengthSpecifierFor(forField: string): Encoder<T> {
        this.fields.push({
            role: 'length-specifier',
            name: forField + "_BYTELEN",
            encode: this.fieldLengthSpecifierEncode,
            decode: this.fieldLengthSpecifierDecode,
            byteLength: BYTELEN_NUMBER,
            forField
        });

        return this as any;
    }

    private fieldLengthSpecifierEncode = (data: number): Buffer => {
        return this.intEncode(data);
    }

    private fieldLengthSpecifierDecode = (bytes: Buffer): FieldDecodeResult<number> => {
        return this.intDecode(bytes);
    }


    /**
     * Calculates size of string in bytes.
     */
    static stringBytelength = (str: string): number => {
        return textEncoder.encode(str).byteLength;
    }
}