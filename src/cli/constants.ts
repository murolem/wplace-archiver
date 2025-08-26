import { variableName as vn } from '$cli/utils';

export const defaultOutModeRegion = [
    'archives/regions/region-X',
    vn('%tile_start_x'),
    '-Y',
    vn('%tile_start_y'),
    '-W',
    vn('%width_tiles'),
    '-H',
    vn('%height_tiles'),
    '/',
    vn('%date'),
    '+',
    vn('%duration'),
    '/',
    vn('%tile_x'),
    '/',
    vn('%tile_y'),
    '.',
    vn('%tile_ext'),
].join("");

export const defaultErrOutModeRegion = [
    'archives/regions/region-X',
    vn('%tile_start_x'),
    '-Y',
    vn('%tile_start_y'),
    '-W',
    vn('%width_tiles'),
    '-H',
    vn('%height_tiles'),
    '/',
    vn('%date'),
    '+',
    vn('%duration'),
    '-ERRORS/X',
    vn('%tile_x'),
    '-Y',
    vn('%tile_y'),
    '-N',
    vn('%attempt'),
    '.',
    vn('%err_ext')
].join("");

export const defaultOutModeGrabby = [
    'archives/grabs/grab-X',
    vn('%tile_start_x'),
    '-Y',
    vn('%tile_start_y'),
    '-R',
    vn('%radius'),
    '/',
    vn('%date'),
    '+',
    vn('%duration'),
    '/',
    vn('%tile_x'),
    '/',
    vn('%tile_y'),
    '.',
    vn('%tile_ext')
].join("");

export const defaultErrOutModeGrabby = [
    'archives/grabs/grab-X',
    vn('%tile_start_x'),
    '-Y',
    vn('%tile_start_y'),
    '-R',
    vn('%radius'),
    '/',
    vn('%date'),
    '+',
    vn('%duration'),
    '-ERRORS/',
    'X',
    vn('%tile_x'),
    '-Y',
    vn('%tile_y'),
    '-N',
    vn('%attempt'),
    '.',
    vn('%err_ext')
].join("");

export const defaultOutModeGrabbyLeaderboardByRegion = [
    'archives/grabs leaderboard/',
    vn('%category'),
    '/',
    vn('%period'),
    '/',
    vn('%leaderboard_date'),
    '+',
    vn('%leaderboard_duration'),
    '/',
    vn('%country_flag'),
    ' ',
    vn('%country'),
    '/',
    vn('%place'),
    ' #',
    vn('%place_number'),
    '/',
    vn('%date'),
    '-R',
    vn('%radius'),
    '+',
    vn('%duration'),
    '/',
    vn('%tile_x'),
    '/',
    vn('%tile_y'),
    '.',
    vn('%tile_ext')
].join("");

export const defaultErrOutModeGrabbyLeaderboardByRegion = [
    'archives/grabs leaderboard-ERRORS/',
    vn('%category'),
    '--',
    vn('%period'),
    '--',
    vn('%leaderboard_date'),
    '+',
    vn('%leaderboard_duration'),
    '/',
    vn('%country_flag'),
    ' ',
    vn('%country'),
    '--',
    vn('%place'),
    ' #',
    vn('%place_number'),
    '-R',
    vn('%radius'),
    '--X',
    vn('%tile_x'),
    '-Y',
    vn('%tile_y'),
    '-N',
    vn('%attempt'),
    '.',
    vn('%err_ext')
].join("");

export const leaderboardPeriods = [
    'today',
    'week',
    'month',
    'all-time'
] as const;

/** Regex matching a single out variable. */
export const outVariableRegex = /%\w*/;

export type OutVariableName = typeof outVariableNames[number];
/** Out path variable names. */
export const outVariableNames = [
    // general
    '%date',
    '%tile_start_x',
    '%tile_start_y',
    '%tile_x',
    '%tile_y',
    '%duration',
    '%tile_ext',
    // region mode
    '%width_tiles',
    '%height_tiles',
    // grabby mode
    '%radius',
    // grabby leaderboard mode
    '%category',
    '%period',
    // grabby leaderboard mode, by-region cat
    '%country_flag',
    '%country',
    '%place',
    '%place_number',
    '%leaderboard_date',
    '%leaderboard_duration',
    // errors
    '%attempt',
    '%err_ext'
] as const;

/**
 * Out path variable names in order of substitution.
 * 
 * Variables with names that start the same should be in order of longer name > shorter name, 
 * otherwise a shorter name variable could get substituted first.
 */
export const outVariableNamesSubstitutionOrder: OutVariableName[] = [
    '%date',
    '%tile_start_x',
    '%tile_start_y',
    '%tile_x',
    '%tile_y',
    '%duration',
    '%tile_ext',
    '%width_tiles',
    '%height_tiles',
    '%radius',
    '%category',
    '%period',
    '%country_flag',
    '%country',
    '%place_number',
    '%leaderboard_date',
    '%leaderboard_duration',
    '%place',
    '%attempt',
    '%err_ext'
];