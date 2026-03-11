import { Encoder } from '$lib/DiffFile/Encoder';

export const H_MAGIC = "!WPDIFF!";
export const H_MAGIC_BYTELEN = Encoder.stringBytelength(H_MAGIC);
const H_PAWPRINTS = [
    ':3', 'X3', ';3', '>X3',
    '.w.', '•w•', '-w-', 'uwu', 'owo', '~w~', '>w<', '>w>', '<w<', '^w^', '?w?', '!w!',
    '.m.', '•m•', '-m-', 'umu', 'omo', '>m<', '>m>', '<m<', '?m?', '!m!', 'qmq', '•ω•', 'qwq', '^ω^', ';w;', '=w=', '©w©', '%w%', '✓w✓', '™w™', 'TwTlwl', '$w$', ':3c', ':3<', 'ΩwΩ', 'TvT', 'OvO', '(WTF)w(WTF)', 'QAQ', 'QwQ', 'XmX', 'ᚢwᚢ', '0\/\/\/\/\/0', 'UnU', 'OnO', 'TvT', 'TnT', '>-<', 'ÒnÓ', 'ÓnÒ', 'ÒwÓ', 'ÓwÒ', 'ÒmÓ', 'ÓmÒ', 'UwO', 'OwU', 'iwi', 'õwÔ', '-wo', 'ow-', 'ow^', '^wo', '*w*', 'JwJ', 'OωO', 'UωU', 'ඞwඞ',
    '$w$', '>///<',
    "OωO", "|´・ω・)ノ", "ヾ(≧∇≦*)ゝ", "(☆ω☆)", "（╯‵□′）╯︵┴─┴", "￣﹃￣", "(/ω＼)", "∠( ᐛ 」∠)＿", "(๑•̀ㅁ•́ฅ)", "→_→", "୧(๑•̀⌄•́๑)૭", "٩(ˊᗜˋ*)و", "(ノ°ο°)ノ", "(´இ皿இ｀)", "⌇●﹏●⌇", "(ฅ´ω`ฅ)", "(╯°A°)╯︵○○○", "φ(￣∇￣o)", "ヾ(´･ ･｀｡)ノ\"", "( ง ᵒ̌皿ᵒ̌)ง⁼³₌₃", "(ó﹏ò｡)", "Σ(っ °Д °;)っ", "( ,,´･ω･)ﾉ\"(´っω･｀｡)", "╮(╯▽╰)╭ ", "o(*\/\/\/\/▽\/\/\/\/*)q ", "＞﹏＜", "( ๑´•ω•) \"(ㆆᴗㆆ)"
]

const H_PAWPRING_PEAK_BYTELEN = H_PAWPRINTS.reduce((maxLen, val) => {
    const len = Encoder.stringBytelength(val);
    return len > maxLen ? len : maxLen;
}, 0);


// ================================
// tiles

/** Encodes metadata about individual tile (1000x1000x pixel square). */
export const tileMetadataEncoder = new Encoder()
    .int('PIXELS_ADDED')
    .int('PIXELS_MODIFIED')
    .int('PIXELS_REMOVED')

/** Encodes information about an individual tile (1000x1000x pixel square). */
export const tileEncoder = tileMetadataEncoder.clone()
    .fieldLengthSpecifierFor('ADD_PIXELS')
    // tuples of: x, y, r, g, b
    .intList('ADD_PIXELS', -1)
    .fieldLengthSpecifierFor('MOD_PIXELS')
    // tuples of: x, y, r, g, b
    .intList('MOD_PIXELS', -1)
    .fieldLengthSpecifierFor('REM_PIXELS')
    // tuples of: x, y
    .intList('REM_PIXELS', -1);

// ================================
// diffs

/** Encodes metadata about all tiles. */
export const encoderDiffMetadata = new Encoder()
    .date('CREATED')
    // change count
    .int('PIXELS_TOTAL')
    .int('PIXELS_CREATED')
    .int('PIXELS_MODIFIED')
    .int('PIXELS_ERASED')
    .fieldLengthSpecifierFor('TILE_OFFSETS')
    .intList('TILE_OFFSETS', -1);

/** Encodes all tiles. */
export const diffEncoder = encoderDiffMetadata.clone()
    .fieldLengthSpecifierFor('TILES')
    .encoderList('TILES', tileEncoder);

// ================================
// file

/** Encodes the magic header. */
export const magicHeaderEncoder = new Encoder()
    .stringLiteral('MAGIC', H_MAGIC);

/** Encodes magic header and general metadata. */
export const generalMetadataOnlyEncoder = magicHeaderEncoder.clone()
    .int('VERSION')
    .enum('DIFF_TYPE', ["DIFFERENTIAL", "INCREMENTAL"])
    .int('DIFF_COUNT')
    .fieldLengthSpecifierFor('DIFF_OFFSETS')
    .intList('DIFF_OFFSETS', -1)
    .string('PAWPRINT', H_PAWPRING_PEAK_BYTELEN)

/** Encodes the magic header, general metadata and all data (as bytes). */
export const generalEncoder = generalMetadataOnlyEncoder.clone()
    .fieldLengthSpecifierFor('DIFFS')
    .encoderList('DIFFS', diffEncoder)

