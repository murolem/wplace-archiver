import chalk from 'chalk';
import { markdownTable } from 'markdown-table';
import { variableName as vn } from '$cli/utils';
import { defaultErrOutModeGrabby, defaultErrOutModeGrabbyLeaderboardByRegion, defaultErrOutModeRegion, defaultOutModeGrabby, defaultOutModeGrabbyLeaderboardByRegion, defaultOutModeRegion, leaderboardPeriods } from '$cli/constants';

export const positionHelpPartFormats = `\
Position must be in one of following formats:
- Tile position as integers 'X,Y', like '1270,801' (Tahrawa, Iraq).
- Latitude (vertical) and longitude (horizontal) as floats 'LAT,LON', like '35.0074863,135.7885488' (Kioto, Japan).
- WPlace place share link like 'https://wplace.live/?lat=-34.67000883965724&lng=-58.43170931572267&zoom=11.226476250486172' (Buenos Aires, Argentina). ${chalk.bold("A link must be enclosed in quotation marks")}.`;


export const outPathHelp = `\
Output path for each tile in form of a pattern. A pattern may contain variables formatted as '%variable' that are replaced with their values on various archival stages.
    
${chalk.bold("Archival stages:")}
${markdownTable([
    ['Stage', 'Description'],
    ['→|C|  Pre', 'Run before a cycle starts, once.'],
    [' |→|  Cycle', 'Run during a cycle, once per tile/error.'],
    [' |C|→ Post', 'Run after a cycle finishes, once for each written path.']
])}

${chalk.bold("Variables available for all modes:")}
${markdownTable([
    ['Variable', 'Stage', 'Description', 'Example'],
    [vn('%date'), 'Pre', 'Archival cycle start time formatted as an iso-like string.', '2025-08-15T12-11-09.590Z'],
    [vn('%tile_start_x'), 'Pre', 'Starting tile position, X-component.', '255'],
    [vn('%tile_start_y'), 'Pre', 'Starting tile position, Y-component.', '1235'],
    [vn('%tile_x'), 'Cycle', 'Current tile position, X-component.', '255'],
    [vn('%tile_y'), 'Cycle', 'Current tile position, y-component.', '1235'],
    [vn('%duration'), 'Post', 'Amount of time it took to complete a cycle.', '16m, 1h17m'],
])}

${chalk.bold("Extra variables available in 'region' mode:")}
${markdownTable([
    ['Variable', 'Stage', 'Description', 'Example'],
    [vn('%width_tiles'), 'Pre', 'Width of region to archive in tiles.', '50'],
    [vn('%height_tiles'), 'Pre', 'Height of region to archive in tiles.', '30'],
])}

${chalk.bold("Extra variables available in 'grabby' mode:")}
${markdownTable([
    ['Variable', 'Stage', 'Description', 'Example'],
    [vn('%radius'), 'Pre', 'Circular radius of the area to grab.', '5'],
])}

${chalk.bold("Extra variables available in 'grabby' leaderboard mode:")}
${markdownTable([
    ['Variable', 'Stage', 'Description', 'Example'],
    [vn('%period'), 'Pre', 'Leaderboard period.', leaderboardPeriods.join(', ')],
])}

${chalk.bold("Extra variables available in 'grabby' leaderboard mode, by-region category:")}
${markdownTable([
    ['Variable', 'Stage', 'Description', 'Example'],
    [vn('%leaderboard_date'), 'Pre', 'Leaderboard archival cycle start time formatted as an iso-like string.', '2025-08-15T12-11-09.590Z'],
    [vn('%leaderboard_duration'), 'Post', 'Amount of time it took to complete a leaderboard cycle.', '16m, 1h17m'],
    [vn('%country_flag'), 'Internal cycle', 'Country flag emoji.', '🇦🇫'],
    [vn('%country'), 'Internal cycle', 'Country name.', 'Afghanistan'],
    [vn('%place'), 'Internal cycle', 'Place name.', 'Seoul'],
    [vn('%place_number'), 'Internal cycle', 'Place number.', '14'],
    [vn('%date'), 'Internal cycle', 'Place archival cycle start time formatted as an iso-like string.', '2025-08-15T12-11-09.590Z'],
    [vn('%duration'), 'Internal cycle', 'Amount of time it took to complete a place cycle.', '16m, 1h17m'],
])}
    
${chalk.bold("Default output paths:")}
- Mode Region: 
${defaultOutModeRegion}
- Mode Grabby:
${defaultOutModeGrabby}
- Mode Grabby (leaderboards, by region): 
${defaultOutModeGrabbyLeaderboardByRegion}

`;



export const outErrorPathHelp = `\
Output path for errors during the archival in form of a pattern. All variables available for --out are also available here. See help for --out option for more info on variables.

${chalk.bold("Extra variables available for all modes:")}
${markdownTable([
    ['Variable', 'Stage', 'Description', 'Example'],
    [vn('%attempt'), 'Cycle', 'Current attempt at fetching a tile.', '1, 2, 3'],
])}

${chalk.bold("Default error output paths:")}
- Mode Region: 
${defaultErrOutModeRegion}
- Mode Grabby:
${defaultErrOutModeGrabby}
- Mode Grabby (leaderboards, by region): 
${defaultErrOutModeGrabbyLeaderboardByRegion}


`;


