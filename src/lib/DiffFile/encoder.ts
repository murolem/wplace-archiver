import type { StringOr } from '$utils/stringOr';
import { err, ok, type Result } from 'neverthrow';
import z from 'zod';
import { Logger } from '$logger';
import fs from 'fs/promises';
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

/**
 * Maps an array of field definitions a record with field names as keys and their types as values.
 */
type FieldsRecordUnwrapped<TFieldArr extends Field<any, any>[]> = {
    [Key in TFieldArr[number]['name']]: FieldDecodeResultUnwrapped<Extract<TFieldArr[number], { name: Key }>>
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
 * Byte encoder/decoder. Uses build-like style to construct a schema.
 * 
 * `encode()`/`decode()` methods can then be used to encode data and decode bytes, respectively.
 */
export class Encoder<T extends Field<StringOr<never> /* little trick to get type inference */, any>[]> {
    /** Internal store of fields. */
    private fields: Field<any, any>[] = [];

    /**
     * Encodes a `Record` based on constructed schema to bytes.
     * @param data Data to encode.
     * @returns Bytes.
     */
    encode(data: FieldsRecordUnwrapped<T>): Buffer {
        const buffs: Buffer[] = [];
        let totalLengthBytes = 0;
        for (const field of this.fields) {
            const buf = field.encode(data[field.name as keyof typeof data]);
            totalLengthBytes += buf.byteLength;

            logDebug(`encoding field '${field.name}' to ${buf.byteLength} bytes (bytes so far: ${totalLengthBytes})`);

            buffs.push(buf);
        }
        return Buffer.concat(buffs, totalLengthBytes);
    }

    /**
     * Decodes bytes into a `Record` based on constructed schema.
     * @param bytes Bytes.
     * @returns Decoded data.
     */
    decode(bytes: Buffer): FieldsRecordUnwrapped<T> {
        const decodedRecord: Partial<FieldsRecordUnwrapped<T>> = {};
        // maps field names to their bytelength
        const bytelengthSpecifiers: Record<string, number> = {};
        let currentOffsetBytes = 0;
        for (const field of this.fields) {
            logDebug(`decoding field '${field.name}'`);

            let sizeBytes = field.sizeBytes;
            if (sizeBytes === -1) {
                sizeBytes = bytelengthSpecifiers[field.name] ?? -1;
                if (sizeBytes === -1) {
                    logFatalAndThrow(`decode failed: encountered field '${field.name}' with unknown bytelength and no length specifier`);
                }
            }

            const offsetEnd = currentOffsetBytes + sizeBytes;
            if (offsetEnd > bytes.byteLength)
                logFatalAndThrow(`decode failed: attempted to read past buffer (range ${currentOffsetBytes}-${offsetEnd} size ${sizeBytes}; found end at ${bytes.byteLength})`);

            const decodedWrapped = field.decode(bytes.subarray(currentOffsetBytes, currentOffsetBytes + sizeBytes));
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

            if (field.role === 'length-specifier') {
                logDebug(`field is a length specifier for field '${field.forField}'`);
                bytelengthSpecifiers[field.forField] = decoded;
            }

            logDebug(`decoded ${sizeBytes} bytes (bytes so far: ${currentOffsetBytes})`);

            decodedRecord[field.name as keyof typeof decodedRecord] = decoded;
        }

        return decodedRecord as FieldsRecordUnwrapped<T>;
    }

    /**
     * Decodes bytes into a string.
     * @param bytes Bytes.
     * @returns Decoded string.
     * @throws {Error} On decode error.
     */
    private bytesToStr(bytes: Buffer): string {
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
    private bytesToInt(bytes: Buffer): number {
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
     * Registers a string field.
     * @param name Field name.
     * @param byteLength Length in bytes.
     * @returns Encoder with field type registered.
     */
    string<TName extends string>(name: TName, byteLength: number): Encoder<[...T, Field<TName, string>]> {
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
                msg: `failed to encode string: buffer overflow (expected <= ${sizeBytes} bytes, got ${dataBuf.length} bytes)`,
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
    stringLiteral<TName extends string, TLiteral extends string>(name: TName, literal: TLiteral): Encoder<[...T, Field<TName, TLiteral>]> {
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
    int<TName extends string>(name: TName): Encoder<[...T, Field<TName, number>]> {
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
    enum<TName extends string, TChoice extends string>(name: TName, choices: TChoice[]): Encoder<[...T, Field<TName, TChoice>]> {
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
    intList<TName extends string>(name: TName, length: number, separator = ','): Encoder<[...T, Field<TName, number[]>]> {
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
        const totalLengthBytes = this.calculateListBytelength(BYTELEN_NUMBER, separator, data.length);

        const buf = Buffer.alloc(totalLengthBytes);

        let currentByteOffset = 0;
        for (const num of data) {
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
            let end = currentByteOffset + BYTELEN_NUMBER;
            if (end > bytes.byteLength)
                break;

            const numRes = this.intDecode(bytes.subarray(currentByteOffset, BYTELEN_NUMBER));
            if (numRes.isErr())
                return err({ reason: 'failed to decode int list entry', data: {}, error: numRes.error });

            decoded.push(numRes.value);
            currentByteOffset += BYTELEN_NUMBER;

            end += sepByteLength;
            if (end > bytes.byteLength)
                break;
            const sepDecodedRes = this.stringDecode(bytes.subarray(currentByteOffset, sepByteLength));
            if (sepDecodedRes.isErr())
                return err({ reason: 'failed to decode int list entry separator', data: {}, error: sepDecodedRes.error });

            const sepDecoded = sepDecodedRes.value;
            if (sepDecoded !== separator)
                return err({ reason: 'failed to decode int list entry separator: separator sequence mismatch; expected ${separator} found ${sepDecoded}', data: {} });
            currentByteOffset += sepByteLength;
        }

        return ok(decoded);
    }


    private calculateListBytelength(valueByteLength: number, separator: string, entriesCount: number): number {
        const sepByteLength = textEncoder.encode(separator).byteLength;
        let totalLengthBytes = (valueByteLength + sepByteLength) * entriesCount;
        if (entriesCount >= 1) // negate trailing separated that was counted in
            totalLengthBytes -= sepByteLength;

        return totalLengthBytes;
    }


    /**
     * Registers a field length specifier field.
     * @param name Field name.
     * @param forField Target field.
     * @returns Encoder.
     */
    fieldLengthSpecifier<TName extends string>(name: TName, forField: T[number]['name']): T {
        this.fields.push({
            role: 'length-specifier',
            name,
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




    // int<TName>(name: TName): Encoder<[...T, Field<TName, number]> {
    //     this.fields.push({
    //         name,
    //         // decode: 
    //     })
    // }
}

const encoder = new Encoder()
    .stringLiteral('MAGIC', 'AFDSFSF')
    .string('FOO', 5)
    .string('BAR', 6)
    .int('HYIAA')
    .enum('fdsfs', ['aa', 'bb', 'cc']);

const encoded = encoder.encode({
    MAGIC: 'AFDSFSF',
    FOO: 'foo',
    BAR: 'bar',
    HYIAA: 123123123123,
    fdsfs: 'bb'
});
await fs.writeFile('./file2', encoded);

const decoded = encoder.decode(encoded);

console.log(decoded);
const buf = Buffer.alloc(BYTELEN_NUMBER);
buf.writeInt32LE(1234);
// console.log(buf.readInt32LE());
await fs.writeFile('./file3', buf);
const buf2 = await fs.readFile('./file3');
console.log(buf2.readInt32LE());
// .decode(Buffer.alloc(200));