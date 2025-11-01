import { Encoder, type InferEncoderSchema } from '$lib/DiffFile/Encoder';
import { err, ok } from 'neverthrow';

export const DIFF_META_H_MAGIC = "!WPDIFF!";
export const DIFF_META_H_MAGIC_BYTELEN = Encoder.stringBytelength(DIFF_META_H_MAGIC);
const DIFF_META_H_PAWPRINT_VARIANTS = [
    ':3', 'X3', ';3', '>X3',
    '.w.', '•w•', '-w-', 'uwu', 'owo', '~w~', '>w<', '>w>', '<w<', '^w^', '?w?', '!w!',
    '.m.', '•m•', '-m-', 'umu', 'omo', '>m<', '>m>', '<m<', '?m?', '!m!', 'qmq', '•ω•', 'qwq', '^ω^', ';w;', '=w=', '©w©', '%w%', '✓w✓', '™w™', 'TwTlwl', '$w$', ':3c', ':3<', 'ΩwΩ', 'TvT', 'OvO', '(WTF)w(WTF)', 'QAQ', 'QwQ', 'XmX', 'ᚢwᚢ', '0\/\/\/\/\/0', 'UnU', 'OnO', 'TvT', 'TnT', '>-<', 'ÒnÓ', 'ÓnÒ', 'ÒwÓ', 'ÓwÒ', 'ÒmÓ', 'ÓmÒ', 'UwO', 'OwU', 'iwi', 'õwÔ', '-wo', 'ow-', 'ow^', '^wo', '*w*', 'JwJ', 'OωO', 'UωU', 'ඞwඞ',
    '$w$', '>///<',
    "OωO", "|´・ω・)ノ", "ヾ(≧∇≦*)ゝ", "(☆ω☆)", "（╯‵□′）╯︵┴─┴", "￣﹃￣", "(/ω＼)", "∠( ᐛ 」∠)＿", "(๑•̀ㅁ•́ฅ)", "→_→", "୧(๑•̀⌄•́๑)૭", "٩(ˊᗜˋ*)و", "(ノ°ο°)ノ", "(´இ皿இ｀)", "⌇●﹏●⌇", "(ฅ´ω`ฅ)", "(╯°A°)╯︵○○○", "φ(￣∇￣o)", "ヾ(´･ ･｀｡)ノ\"", "( ง ᵒ̌皿ᵒ̌)ง⁼³₌₃", "(ó﹏ò｡)", "Σ(っ °Д °;)っ", "( ,,´･ω･)ﾉ\"(´っω･｀｡)", "╮(╯▽╰)╭ ", "o(*\/\/\/\/▽\/\/\/\/*)q ", "＞﹏＜", "( ๑´•ω•) \"(ㆆᴗㆆ)"
]

const DIFF_META_H_PAWPRINT_MAX_BYTELEN = DIFF_META_H_PAWPRINT_VARIANTS.reduce((maxLen, val) => {
    const len = Encoder.stringBytelength(val);
    return len > maxLen ? len : maxLen;
}, 0);

// file
export const encoderFileMagic = new Encoder()
    .stringLiteral('MAGIC', DIFF_META_H_MAGIC);

export const encoderFileMetadata = encoderFileMagic.clone()
    .int('VERSION')
    .enum('DIFF_TYPE', ["DIFFERENTIAL", "INCREMENTAL"])
    .int('DIFF_COUNT')
    .fieldLengthSpecifierFor('DIFF_OFFSETS')
    .intList('DIFF_OFFSETS', -1)
    .string('PAWPRINT', DIFF_META_H_PAWPRINT_MAX_BYTELEN)

export const encoderFile = encoderFileMetadata.clone()
    .fieldLengthSpecifierFor('DIFFS')
    .bytes('DIFFS', -1)

// diffs
export const encoderDiffMetadata = new Encoder()
    .date('CREATED')
    // change count
    .int('PIXELS_TOTAL')
    .int('PIXELS_CREATED')
    .int('PIXELS_MODIFIED')
    .int('PIXELS_ERASED')
    .fieldLengthSpecifierFor('TILE_OFFSETS')
    .intList('TILE_OFFSETS', -1);

export const encoderDiff = encoderDiffMetadata.clone()
    .fieldLengthSpecifierFor('TILES')
    .bytes('TILES', -1);

// tiles
export const encoderTileMetadata = new Encoder()
    .int('PIXELS_CREATED_TOTAL')
    .int('PIXELS_MODIFIED_TOTAL')
    .int('PIXELS_ERASED_TOTAL')
    .fieldLengthSpecifierFor('PIXEL_GROUP_OFFSETS')
    .intList('PIXEL_GROUP_OFFSETS', -1)

export const encoderTile = encoderTileMetadata.clone()
    // tuples of: x, y, r, g, b
    .fieldLengthSpecifierFor('PIXELS_CREATED')
    .intList('PIXELS_CREATED', -1)
    // tuples of: x, y, r, g, b
    .fieldLengthSpecifierFor('PIXELS_MODIFIED')
    .intList('PIXELS_MODIFIED', -1)
    // tuples of: x, y
    .fieldLengthSpecifierFor('PIXELS_ERASED')
    .intList('PIXELS_ERASED', -1);