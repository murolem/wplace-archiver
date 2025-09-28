import type { StringOr } from '$utils/stringOr';
import { pipe, z, ZodType } from 'zod';
import fs from 'fs/promises';
import { pipeline } from 'node:stream/promises';
import { text } from 'node:stream/consumers';
import { Logger } from '$logger';
import { getModuleFilenameNoExt } from '$utils/getModuleFilename';
import { err, ok, type Result } from 'neverthrow';
const { logDebug, logInfo, logFatalAndThrow } = new Logger(getModuleFilenameNoExt(__filename));

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const H_MAGIC = "!WPDIFF!";

const BYTESIZE_BIT_FLAG = 4;
const BYTESIZE_INT = 4;


const bytesToStr = (bytes: Uint8Array): string => textDecoder.decode(bytes);
const bytesToInt = (bytes: Uint8Array): number => {
    const num = Buffer.from(bytes).readInt32BE();
    return num;
};


type zSchemaResultError = {
    reason: string,
    data: unknown,
    error?: unknown,
};
type zSchemaResult<T> = Result<T, zSchemaResultError>;

const zStringLiteral = <T extends string>(literal: T) =>
    (bytes: Uint8Array): zSchemaResult<T> => {
        const res = z.literal(literal).safeParse(bytesToStr(bytes));
        if (res.success)
            return ok(res.data)
        else
            return err({ reason: 'string literal parse error', data: { bytes }, error: res.error });
    };

const zString = (bytes: Uint8Array): zSchemaResult<string> => {
    const res = z.string().safeParse(bytesToStr(bytes));
    if (res.success)
        return ok(res.data)
    else
        return err({ reason: 'string parse error', data: { bytes }, error: res.error });
}

const zInt = (bytes: Uint8Array): zSchemaResult<number> => {
    const strRes = z.string().safeParse(bytesToStr(bytes));
    if (!strRes.success)
        return err({ reason: 'integer parse error', data: { bytes }, error: strRes.error });

    const num = parseInt(strRes.data);
    if (isNaN(num))
        return err({ reason: 'integer parse error: conversion failure', data: { bytes, 'parsed string': strRes }, error: 'NaN' });

    return ok(num);
}

const zIntToStringLiteralMap = <T extends string>(values: T[]) =>
    (bytes: Uint8Array): zSchemaResult<T> => {
        const idx = bytesToInt(bytes);
        if (idx < 0 || idx > values.length - 1)
            return err({ reason: `integer -> string map parse error: index out of range; got ${idx}, expected 0 <= i <= ${values.length - 1}`, data: { bytes, idx } });

        return ok(values[idx]);
    }

// const zBitFlagString = <T extends string>(values: T[]) =>
//     (bytes: Uint8Array): zSchemaResult<T> => {
//         const flag = bytesToInt(bytes);
//         if (isNaN(flag))
//             return err({ reason: 'parse failure: got NaN from bytes', data: { bytes } });
//         else if (flag === 0)
//             return err({ reason: 'parse failure: bit flag is not set', data: { bytes, flag } });

//         const power = Math.log2(flag);
//         if (power % 1 != 0)
//             return err({ reason: 'parse failure: not a bit flag', data: { bytes, flag, power } });

//         const idx = power;
//         if (idx > values.length - 1)
//             return err({ reason: `parse failure: bit flag overflow (${power} > ${values.length - 1})`, data: { bytes, flag, power } });

//         return ok(values[idx]);
//     }

/** 
 * Comma-separated list of integers.
 * @param length Number of entries.
 */
const zIntListComma = (length: number) =>
    (bytes: Uint8Array): zSchemaResult<number[]> => {
        const str = bytesToStr(bytes);
        const entries = str.split(",");
        if (entries.length !== length)
            return err({ reason: `integer list parse error: list length mismatch; expected ${length} got ${entries.length}`, data: { bytes, str, entries } });

        let gotNan = false;
        const nums = entries.map(e => {
            const num = parseInt(e);
            if (isNaN(num))
                gotNan = true;

            return num;
        });

        if (gotNan)
            return err({ reason: "integer list parse error: got NaN after conversion", data: { bytes, str, entries, nums } });

        return ok(nums);
    }


// const headMeta = [
//     /** Magic number for the file format. */
//     { kind: 'field', name: 'MAGIC', lengthBytes: textEncoder.encode(H_MAGIC).byteLength, schema: zStringLiteral(H_MAGIC) },
//     /** Type of the diff file. */
//     {
//         kind: 'field', name: 'DIFF_TYPE', lengthBytes: BYTESIZE_BIT_FLAG, schema: zBitFlagString([
//             "DIFFERENTIAL",
//             "INCREMENTAL",
//         ])
//     },
//     /** Number of diffs included in the diff file. */
//     { kind: 'field-length', name: "DIFFS_COUNT", lengthBytes: BYTESIZE_INT, for: 'DIFF_OFFSETS' },
//     /** Diff byte offsets for each included diff. First offset is always 0. Comma-separated. */
//     { kind: 'field', name: "DIFF_OFFSETS", lengthBytes: BYTESIZE_INT, schema: zIntListComma },
// ] satisfies HeadMetaField[];

// const H_MAGIC = textEncoder.encode("!WPDIFF!");
/** Version of the file format. */
const H_VERSION = new Uint8Array(1);
/** SHA-256 hash of the base archive. */
const H_BASE_ARCHIVE_SHA256 = new Uint8Array(32);
/** SHA-256 hash of the diff archive. */
const H_DIFF_ARCHIVE_SHA256 = new Uint8Array(32);
/** Diff archive title. */
const H_DIFF_ARCHIVE_TITLE = new Uint8Array(256);
/** Number of changes. For 2048 x 2048 map (4 mil), it is 2 ^ 22. */
const H_CHANGES = new Uint8Array(22);
/** Number of additions. */
const H_ADDITIONS = new Uint8Array(22);
/** Number of modifies. */
const H_MODIFIES = new Uint8Array(22);
/** Number of deletions. */
const H_DELETIONS = new Uint8Array(22);
const H_EXTRA_VERYIMPORTANT = textEncoder.encode(">///<");

// export const diffFileSchema: Uint8Array[] = [
//     H_MAGIC,
//     H_VERSION,
//     H_BASE_ARCHIVE_SHA256,
//     H_DIFF_ARCHIVE_SHA256,
//     H_DIFF_ARCHIVE_TITLE,
//     H_CHANGES,
//     H_ADDITIONS,
//     H_MODIFIES,
//     H_DELETIONS,
//     H_EXTRA_VERYIMPORTANT
// ]

/**
 * Archive diff file, `.wpd`.
 * 
 * Represents changes between two archives.
 */
export class DiffFile {
    /**
     * Load diff file from disk.
     * @param filepath 
     * @throws {Error} If load fails (file doesn't exists, format mismatch, etc.).
     */
    static async load(filepath: string): Promise<DiffFile> {

    }

    /**
     * Compute a diff between two tiles.
     * @param baseTileFilepath Path to tile 1.
     * @param topTileFilepath Path to tile 2. 
     */
    static async diff(baseTileFilepath: string, topTileFilepath: string): Promise<DiffFile> {

    }

    /**
     * Write diff file to disk.
     */
    async write(filepath: string): Promise<void> {
        // const headerBytes =         
    }

    /**
     * Checks whether given file is a diff file.
     * @param filepath 
     */
    static async isDiffFile(filepath: string): boolean {

    }
}

type DiffFileMetaField = keyof DiffFileMeta;
type DiffFileMeta = {
    /** Magic string. */
    MAGIC: typeof H_MAGIC,
    /** Version of the diff file. */
    VERSION: 1,
    /** Type of the diff file. */
    DIFF_TYPE: 'DIFFERENTIAL' | 'INCREMENTAL',
    /** Number of diffs included. */
    DIFF_COUNT: number,
    /** Byte offsets for each included diff, counting from after the metadata block. First offset is always 0. */
    DIFF_OFFSETS: number[],
    /** Something very important. */
    DIFF_SOWUTHING_VEWY_IMPOWTANT: string
}


export class DiffFileMetadata implements Omit<DiffFileMeta, 'MAGIC'> {
    static readonly H_MAGIC = "!WPDIFF!";
    static readonly H_MAGIC_LEN = textEncoder.encode(this.H_MAGIC).byteLength;
    static readonly H_SOWUTHING_VEWY_IMPOWTANT = [
        ':3', 'X3', ';3', '>X3',
        '.w.', '•w•', '-w-', 'uwu', 'owo', '~w~', '>w<', '>w>', '<w<', '^w^', '?w?', '!w!',
        '.m.', '•m•', '-m-', 'umu', 'omo', '>m<', '>m>', '<m<', '?m?', '!m!', 'qmq', '•ω•', 'qwq', '^ω^', ';w;', '=w=', '©w©', '%w%', '✓w✓', '™w™', 'TwTlwl', '$w$', ':3c', ':3<', 'ΩwΩ', 'TvT', 'OvO', '(WTF)w(WTF)', 'QAQ', 'QwQ', 'XmX', 'ᚢwᚢ', '0\/\/\/\/\/0', 'UnU', 'OnO', 'TvT', 'TnT', '>-<', 'ÒnÓ', 'ÓnÒ', 'ÒwÓ', 'ÓwÒ', 'ÒmÓ', 'ÓmÒ', 'UwO', 'OwU', 'iwi', 'õwÔ', '-wo', 'ow-', 'ow^', '^wo', '*w*', 'JwJ', 'OωO', 'UωU', 'ඞwඞ',
        '$w$',
        "OωO", "|´・ω・)ノ", "ヾ(≧∇≦*)ゝ", "(☆ω☆)", "（╯‵□′）╯︵┴─┴", "￣﹃￣", "(/ω＼)", "∠( ᐛ 」∠)＿", "(๑•̀ㅁ•́ฅ)", "→_→", "୧(๑•̀⌄•́๑)૭", "٩(ˊᗜˋ*)و", "(ノ°ο°)ノ", "(´இ皿இ｀)", "⌇●﹏●⌇", "(ฅ´ω`ฅ)", "(╯°A°)╯︵○○○", "φ(￣∇￣o)", "ヾ(´･ ･｀｡)ノ\"", "( ง ᵒ̌皿ᵒ̌)ง⁼³₌₃", "(ó﹏ò｡)", "Σ(っ °Д °;)っ", "( ,,´･ω･)ﾉ\"(´っω･｀｡)", "╮(╯▽╰)╭ ", "o(*\/\/\/\/▽\/\/\/\/*)q ", "＞﹏＜", "( ๑´•ω•) \"(ㆆᴗㆆ)"
    ].map(val => textEncoder.encode(val));
    static readonly H_SOWUTHING_VEWY_IMPOWTANT_LEN = this.H_SOWUTHING_VEWY_IMPOWTANT.reduce((maxLen, val) => {
        const len = val.byteLength;
        if (len > maxLen)
            return len;
        else
            return maxLen;
    }, 0)

    VERSION;
    DIFF_TYPE;
    DIFF_COUNT;
    DIFF_OFFSETS;
    DIFF_SOWUTHING_VEWY_IMPOWTANT;

    constructor(metadata: DiffFileMeta) {
        this.VERSION = metadata.VERSION;
        this.DIFF_TYPE = metadata.DIFF_TYPE;
        this.DIFF_COUNT = metadata.DIFF_COUNT;
        this.DIFF_OFFSETS = metadata.DIFF_OFFSETS;
        this.DIFF_SOWUTHING_VEWY_IMPOWTANT = metadata.DIFF_SOWUTHING_VEWY_IMPOWTANT;
    }

    /**
     * Reads diff file metadata.
     * @param filepath 
     */
    static async read(filepath: string): DiffFileMetadata {
        const readBytes = await createReader(filepath);
        const fail = (reason: string, data?: unknown) => {
            logFatalAndThrow({
                msg: "failed to read diff file metadata: " + reason,
                data
            });
            throw ''//type guard
        }
        const unwrapOrFail = <T>(field: DiffFileMetaField, res: zSchemaResult<T>, getReason?: (res: zSchemaResultError) => string) => {
            if (res.isErr()) {
                const err = res.error;
                fail(getReason ? `${getReason(res.error)} (${err.reason})` : err.reason, { field, data: err.data, error: err.error });
                throw ''//type guard
            }

            return res.value;
        }
        const logReadNext = (field: DiffFileMetaField) => logDebug(`reading field '${field}'`);

        logReadNext('MAGIC');
        const MAGIC = unwrapOrFail(
            'MAGIC',
            zStringLiteral(this.H_MAGIC)(await readBytes(this.H_MAGIC_LEN)),
            res => `not a diff file; expected magic '${this.H_MAGIC}', found '${res.data}'`
        );

        logReadNext('VERSION');
        const VERSION = unwrapOrFail(
            'VERSION',
            zInt(await readBytes(1))
        );
        if (VERSION !== 1)
            fail(`unsupported metadata version '${VERSION}'`);
        const VERSION_TYPED = VERSION as 1;

        logReadNext('DIFF_TYPE');
        const DIFF_TYPE = unwrapOrFail(
            'DIFF_TYPE',
            zIntToStringLiteralMap([
                'DIFFERENTIAL',
                'INCREMENTAL'
            ] as DiffFileMeta['DIFF_TYPE'][])(await readBytes(BYTESIZE_BIT_FLAG))
        );

        logReadNext('DIFF_COUNT');
        const DIFF_COUNT = unwrapOrFail(
            'DIFF_COUNT',
            zInt(await readBytes(BYTESIZE_INT))
        );

        logReadNext('DIFF_OFFSETS');
        const DIFF_OFFSETS = unwrapOrFail(
            'DIFF_OFFSETS',
            zIntListComma(DIFF_COUNT)(await readBytes(BYTESIZE_INT))
        );

        logReadNext('DIFF_SOWUTHING_VEWY_IMPOWTANT');
        const DIFF_SOWUTHING_VEWY_IMPOWTANT = unwrapOrFail(
            'DIFF_SOWUTHING_VEWY_IMPOWTANT',
            zString(await readBytes(this.H_SOWUTHING_VEWY_IMPOWTANT_LEN)),
            res => 'something of importance is missing'
        );
        logInfo("pawprint: " + DIFF_SOWUTHING_VEWY_IMPOWTANT);

        return new DiffFileMetadata({
            MAGIC,
            VERSION: VERSION_TYPED,
            DIFF_TYPE,
            DIFF_COUNT,
            DIFF_OFFSETS,
            DIFF_SOWUTHING_VEWY_IMPOWTANT,
        });
    }

    /**
     * Checks whether given file is a diff file.
     * @param filepath Path to file.
     */
    static async isDiffFile(filepath: string): Promise<boolean> {
        f(encoder.e
        const readBytes = await createReader(filepath);

        const magic = bytesToStr(await readBytes(this.H_MAGIC_LEN));
        return magic === this.H_MAGIC;
    }
}

async function createReader(filepath: string) {
    if (!(await fs.exists(filepath)))
        logFatalAndThrow("failed to read diff file: file does not exists: " + filepath);

    const rh = await fs.open(filepath, 'r');
    const readBytes = async (size: number): Promise<Uint8Array> => {
        const res = await rh.read(Buffer.alloc(size), 0, size, null);
        if (res.bytesRead !== size)
            logFatalAndThrow(`failed to read diff file: requested read of ${size} bytes, but got ${res.bytesRead} bytes`);

        return res.buffer;
    }

    return readBytes;
}

console.log(await DiffFileMetadata.read("./file"));
// await fs.writeFile('./file2', textEncoder.encode('0001'));