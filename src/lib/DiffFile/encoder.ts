import type { StringOr } from '$utils/stringOr';
import { err, ok, type Result } from 'neverthrow';
import z from 'zod';
import { Logger } from '$logger';
import fsPromises from 'fs/promises';
import fs from 'fs';
import { createFileReader } from '$lib/fs/createFileReader';
const { logDebug, logFatalAndThrow } = new Logger('DiffFile/encoder');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number#number_encoding
const BYTELEN_NUMBER = 4;

const BYTEPAD_STR = '\0';
// const BYTELEN_CHAR =

/**
 * Describes a regular encoder field that has a name, type and some value.
 */
type FieldStandard<TName extends string, TType> = {
    /** Role of this field. */
    role: 'standard',

    /** Field name. */
    name: TName,

    /** Field encoder to bytes. */
    encode: (value: TType) => Buffer,

    /** Field decoder from bytes. */
    decode: (bytes: Buffer) => Result<TType, unknown>,

    /** 
     * Field size in bytes. 
     * 
     * Can be set to `-1` for fields with variable length. 
     * Such field requires a length specifier field to be defined for itself preceding this field.
     */
    sizeBytes: number
}

/**
 * Describes a specialized encoder field used to define bytelength of a subsequent field.
 * 
 * A standard field requires a length specifier field if its bytelength is set to `-1`.
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
    sizeBytes: typeof BYTELEN_NUMBER,

    /** Name of a field this field defines bytelength for. */
    forField: string
}

/** Describes an encoder field. */
type Field<TName extends string, TType> = FieldStandard<TName, TType> | FieldLengthSpecifier<TName>;


/** Extracts decoded type wrapped in `Result<..>` from an encoder field definition. */
type FieldDecodeResultWrapped<T extends Field<any, any>> = ReturnType<T['decode']>;

/** Extracts decoded type from an encoder field definition. */
type FieldDecodeResultUnwrapped<T extends Field<any, any>> = ReturnType<FieldDecodeResultWrapped<T>['_unsafeUnwrap']>;

type ExtractTypeByNameProp<T, TName extends string> = Extract<T, { name: TName }>;

/**
 * Maps an array of field definitions a record with field names as keys and their types as values.
 */
type FieldsRecordUnwrapped<TFieldArr extends Field<any, any>[]> = {
    [Key in TFieldArr[number]['name']]: FieldDecodeResultUnwrapped<ExtractTypeByNameProp<TFieldArr[number], Key>>;
}

/**
 * Describes a decoder error.
 */
type DecodeError = {
    reason: string,
    data: unknown,
    error?: unknown,
};

/**
 * Describes a decode result.
 */
type DecodeResult<T> = Result<T, DecodeError>;

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
     * Encodes a `Record` based on constructed schema to bytes.
     * @param data Data to encode.
     * @returns Bytes.
     */
    encode(data: FieldsRecordUnwrapped<T>): Buffer {
        logDebug("starting encode (reverse order)");

        const buffs: Buffer[] = [];
        // bytelengths of enumerated fields
        const fieldBytelengths: Record<string, number> = {};

        let totalLengthBytes = 0;
        // iterate backwards so that we can compute the byte length specifiers after the fields they are specifying for.
        // with normal order of iteration, we would have to backtrack to do that-so, let's not.
        for (let i = this.fields.length - 1; i >= 0; i--) {
            const field = this.fields[i];
            logDebug(`|> encoding ${field.role} field '${field.name}'`);

            let buf: Buffer;
            if (field.role === 'standard') {
                buf = field.encode(data[field.name as keyof typeof data]);
            } else {
                const targetFieldBytelength = fieldBytelengths[field.forField];
                if (targetFieldBytelength === undefined) {
                    logFatalAndThrow({
                        msg: "encode failed: encountered a byte length specifier field, but did not encounter a field for which to specify the length for",
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
    async decode(source: Buffer | string): Promise<FieldsRecordUnwrapped<T>> {
        logDebug("starting decode");

        return await (typeof source === 'string'
            ? this.decodeFile(source)
            : this.decodeBytes(source)
        );
    }

    /**
     * A step-bys-step decoder that feeds on bytes lazily, requesting chunks from caller.
     * @returns 
     */
    private *lazyDecoder(): Generator<{
        done: false,
        bytesWant: number,
        bytesFed: number,
        bytesFedEnd: number,
        feedBytes(bytesSource: Buffer, useOffset?: boolean): void
    } | {
        done: true,
        value: FieldsRecordUnwrapped<T>
    }> {
        const decodedRecord: Partial<FieldsRecordUnwrapped<T>> = {};
        // maps field names to their bytelength
        const bytelengthSpecifiers: Record<string, number> = {};
        let currentOffsetBytes = 0;
        for (const field of this.fields) {
            logDebug(`<| decoding ${field.role} field '${field.name}'`);

            let sizeBytes = field.sizeBytes;
            if (sizeBytes === -1) {
                sizeBytes = bytelengthSpecifiers[field.name] ?? -1;
                if (sizeBytes === -1) {
                    logFatalAndThrow(`decode failed: encountered field '${field.name}' with unknown bytelength and no length specifier`);
                }
            }

            const offsetEnd = currentOffsetBytes + sizeBytes;
            const bytes = Buffer.alloc(sizeBytes);
            let bytesFed = false;
            yield {
                done: false,
                bytesWant: sizeBytes,
                bytesFed: currentOffsetBytes,
                bytesFedEnd: offsetEnd,
                feedBytes(bytesSource: Buffer, useOffset?: boolean) {
                    if (useOffset) {
                        if (offsetEnd > bytesSource.byteLength)
                            logFatalAndThrow(`decode failed: attempted to read past buffer (range ${currentOffsetBytes}-${offsetEnd} size ${sizeBytes}; buffer end at ${bytesSource.byteLength})`);

                        bytesSource.copy(bytes, 0, currentOffsetBytes, offsetEnd);
                    } else {
                        bytesSource.copy(bytes);
                    }

                    bytesFed = true;
                }
            }

            if (!bytesFed)
                logFatalAndThrow("decode failed: expected next chunk of bytes but did not receive any");
            else if (bytes.byteLength < sizeBytes)
                logFatalAndThrow(`decode failed: attempted to read past buffer (range ${currentOffsetBytes}-${offsetEnd} size ${sizeBytes}; buffer end at ${bytes.byteLength}) #2`);

            const decodedWrapped = field.decode(bytes);
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
            currentOffsetBytes += sizeBytes;

            if (field.role === 'length-specifier')
                bytelengthSpecifiers[field.forField] = decoded;

            logDebug(`decoded ${sizeBytes} bytes; bytes so far: ${currentOffsetBytes}`);

            if (field.role === 'standard')
                decodedRecord[field.name as keyof typeof decodedRecord] = decoded;
        }

        yield {
            done: true,
            value: decodedRecord as FieldsRecordUnwrapped<T>
        };
    }

    /**
     * Reads a file asynchronously, decoding it into a `Record` based on constructed schema.
     * Only the needed amount of bytes is read.
     * @param filepath Path to file.
     * @returns Decoded data.
     */
    async decodeFile(filepath: string): Promise<FieldsRecordUnwrapped<T>> {
        if (!fs.existsSync(filepath))
            logFatalAndThrow("decode file failed: file does not exists: " + filepath);

        const read = await createFileReader(filepath);

        const lazyDecoder = this.lazyDecoder();
        for (const step of lazyDecoder) {
            if (step.done)
                return step.value;
            else {
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
     * Decodes bytes into a `Record` based on constructed schema. Any extra bytes are ignored.
     * @param filepath Path to file.
     * @returns Decoded data.
     */
    decodeBytes(bytes: Buffer): FieldsRecordUnwrapped<T> {
        const lazyDecoder = this.lazyDecoder();
        for (const step of lazyDecoder) {
            if (step.done)
                return step.value;
            else
                step.feedBytes(bytes, true);
        }

        // shouldn't happen
        logFatalAndThrow("decode failed: unexpected loop exit");
        throw ''//type guard
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
            sizeBytes: byteLength
        });

        return this as any;
    }

    private stringEncode = (data: string, sizeBytes: number): Buffer => {
        const dataBuf = Buffer.from(textEncoder.encode(data));
        if (dataBuf.byteLength > sizeBytes)
            logFatalAndThrow({
                msg: `failed to encode string: string is larger then the field size (expected <= ${sizeBytes} bytes, got ${dataBuf.length} bytes)`,
                data: {
                    string: data
                }
            })

        // exact length = return right away
        if (dataBuf.byteLength === sizeBytes) {
            return dataBuf;
        }

        // length mismatch = pad end
        const buf = Buffer.alloc(sizeBytes);
        dataBuf.copy(buf);
        buf.write('\0'.repeat(sizeBytes - buf.byteLength), buf.byteLength);
        return buf;
    }

    private stringDecode = (bytes: Buffer): DecodeResult<string> => {
        const res = z.string().safeParse(this.bytesToStr(bytes));
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
            sizeBytes: byteLength
        });

        return this as any;
    }

    private stringLiteralEncode = <TLiteral extends string>(data: TLiteral): Buffer => {
        return Buffer.from(data);
    }

    private stringLiteralDecode = <TLiteral extends string>(bytes: Buffer, literal: TLiteral): DecodeResult<TLiteral> => {
        const res = z.literal(literal).safeParse(this.bytesToStr(bytes));
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
            sizeBytes: BYTELEN_NUMBER
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


    private intDecode = (bytes: Buffer): DecodeResult<number> => {
        const num = this.bytesToInt(bytes);
        if (isNaN(num))
            return err({ reason: 'integer parse error: conversion failure', data: { bytes }, error: 'NaN' });

        return ok(num);
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
            sizeBytes: BYTELEN_NUMBER
        });

        return this as any;
    }

    private enumEncode = <TChoice extends string>(data: TChoice, choices: TChoice[]): Buffer => {
        const idx = choices.indexOf(data);
        return this.intEncode(idx);
    }

    private enumDecode = <TChoice extends string>(bytes: Buffer, choices: TChoice[]): DecodeResult<TChoice> => {
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
     * @param length Total items. Can be set to `-1` to use a field length specifier.
     * @param separator List separator. Comma `,` by default.
     * @returns Encoder with field type registered.
     */
    intList<TName extends string>(name: TName, length: number, separator = ','): Encoder<[...T, FieldStandard<TName, number[]>]> {
        this.fields.push({
            role: 'standard',
            name,
            encode: data => this.intListEncode(data, separator),
            decode: bytes => this.intListDecode(bytes, separator),
            sizeBytes: length === -1
                ? length
                : BYTELEN_NUMBER * length
        });

        return this as any;
    }

    private intListEncode = (data: number[], separator: string): Buffer => {
        const sepByteLength = textEncoder.encode(separator).byteLength;
        const totalLengthBytes = Encoder.listBytelength(BYTELEN_NUMBER, separator, data.length);

        const buf = Buffer.alloc(totalLengthBytes);

        let currentByteOffset = 0;
        for (const num of data) {
            if (num % 1 !== 0)
                logFatalAndThrow(`encode int list failed: not an integer; got ${num}`);

            buf.writeInt32LE(num, currentByteOffset);
            currentByteOffset += BYTELEN_NUMBER;

            buf.write(separator, currentByteOffset);
            currentByteOffset += sepByteLength;
        }

        return buf;
    }

    private intListDecode = (bytes: Buffer, separator: string): DecodeResult<number[]> => {
        const sepByteLength = textEncoder.encode(separator).byteLength;
        const decoded: number[] = [];

        let currentByteOffset = 0;
        while (true) {
            // decode item
            let end = currentByteOffset + BYTELEN_NUMBER;
            if (end > bytes.byteLength)
                break;

            const numRes = this.intDecode(bytes.subarray(currentByteOffset, end));
            if (numRes.isErr())
                return err({ reason: 'failed to decode int list entry', data: {}, error: numRes.error });

            decoded.push(numRes.value);
            currentByteOffset = end;

            // decode sep
            end += sepByteLength;
            if (end > bytes.byteLength)
                break;

            const sepDecodedRes = this.stringDecode(bytes.subarray(currentByteOffset, end));
            if (sepDecodedRes.isErr())
                return err({ reason: 'failed to decode int list entry separator', data: {}, error: sepDecodedRes.error });

            const sepDecoded = sepDecodedRes.value;
            if (sepDecoded !== separator)
                return err({ reason: `failed to decode int list entry separator: separator sequence mismatch; expected '${separator}' found '${sepDecoded}'`, data: {} });
            currentByteOffset = end;
        }

        return ok(decoded);
    }


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
            sizeBytes: BYTELEN_NUMBER,
            forField
        });

        return this as any;
    }

    private fieldLengthSpecifierEncode = (data: number): Buffer => {
        return this.intEncode(data);
    }

    private fieldLengthSpecifierDecode = (bytes: Buffer): DecodeResult<number> => {
        return this.intDecode(bytes);
    }


    /**
     * Calculates size of string in bytes.
     */
    static stringBytelength = (str: string): number => {
        return textEncoder.encode(str).byteLength;
    }

    /**
     * Calculates size in bytes of a list of entries with byte size {@link valueByteLength} joined using {@link separator}.
     * @param valueByteLength Size of a single entry in bytes.
     * @param separator Separator used to separate entries of this list.
     * @param entriesCount Number of entries in the list.
     * @returns Byte length of resulting list.
     */
    static listBytelength(valueByteLength: number, separator: string, entriesCount: number): number {
        const sepByteLength = textEncoder.encode(separator).byteLength;
        let totalLengthBytes = (valueByteLength + sepByteLength) * entriesCount;
        if (entriesCount >= 1) // negate trailing separated that was counted in
            totalLengthBytes -= sepByteLength;

        return totalLengthBytes;
    }
}