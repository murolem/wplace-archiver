import { Encoder } from '$lib/DiffFile/encoder';

const encoder = new Encoder()



export class DiffFileMetadata implements Omit<DiffFileMeta, 'MAGIC'> {
    static readonly H_MAGIC = "!WPDIFF!";
    static readonly H_MAGIC_LEN = textEncoder.encode(this.H_MAGIC).byteLength;
    static readonly H_SOWUTHING_VEWY_IMPOWTANT = [
        ':3', 'X3', ';3', '>X3',
        '.w.', '•w•', '-w-', 'uwu', 'owo', '~w~', '>w<', '>w>', '<w<', '^w^', '?w?', '!w!',
        '.m.', '•m•', '-m-', 'umu', 'omo', '>m<', '>m>', '<m<', '?m?', '!m!', 'qmq', '•ω•', 'qwq', '^ω^', ';w;', '=w=', '©w©', '%w%', '✓w✓', '™w™', 'TwTlwl', '$w$', ':3c', ':3<', 'ΩwΩ', 'TvT', 'OvO', '(WTF)w(WTF)', 'QAQ', 'QwQ', 'XmX', 'ᚢwᚢ', '0\/\/\/\/\/0', 'UnU', 'OnO', 'TvT', 'TnT', '>-<', 'ÒnÓ', 'ÓnÒ', 'ÒwÓ', 'ÓwÒ', 'ÒmÓ', 'ÓmÒ', 'UwO', 'OwU', 'iwi', 'õwÔ', '-wo', 'ow-', 'ow^', '^wo', '*w*', 'JwJ', 'OωO', 'UωU', 'ඞwඞ',
        '$w$', '>///<',
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