# wplace-archiver

An CLI archiver script for wplace.live. Preserve 🧡

Currently archived: see [wplace-archives](https://github.com/murolem/wplace-archives).

## Usage

This is Command Line Utility, meaning it will only run through console/terminal. Just running the EXE file **will not work**.

---

Grab a binary from [releases](https://github.com/murolem/wplace-archiver/releases/latest). Binaries are available for linux-x64 and windows-x64 (untested).

To run:

```bash
./wplace_archiver [args] <mode> [mode args]
```

where:

-   `[args]` are optional general arguments.
-   `<mode>` is a archival mode. Currently, only `region` mode is available.
-   `[mode args]` are mode-specific arguments. Some arguments could be required, some are optional.

See [Modes](#Modes) for the list of available modes.

The script operates on **tiles**. A tile is a 1000x1000px image that holds pixels of a part of a map. Entire map is 2048x2048 tiles.

For help (to see available commands), run:

```bash
./wplace_archiver help
```

To see commands for a specific mode, run:

```bash
./wplace_archiver help [mode]
```

## Positions

Each more (except leaderboards), requires at least one position - to start from. A position must be one in one following formats:

-   Tile position as integers `X,Y`, like `1270,801` (Tahrawa, Iraq).
-   Latitude (vertical) and longitude (horizontal) as floats `LAT,LON`, like `35.0074863,135.7885488` (Kioto, Japan). Can be useful for specifying a location from for example Google Maps.
-   WPlace place share link like `"https://wplace.live/?lat=-34.67000883965724&lng=-58.43170931572267&zoom=11.226476250486172"` (Buenos Aires, Argentina). **A link must be enclosed in quotation marks**. Easiest way to point to a location.

**To get your current tile position:**

1. Open Developer tools.
2. Go to Network tab.
3. Press "All" or "XHR" tab.
4. Move around.
5. Click on any .png file that appears in the list.
6. Click on "Headers" tab for that request.
7. You will see a URL (or part of it) that looks something like `/files/s0/tiles/1792/708.png`. `1792/708` is a tile position of nearby tile; `1792` is X and `708` is Y.

## Modes

### Grabby [leaderboards]

A grabby mode that allows to archive leaderboards.

-   The mode is toggled one when in grabby mode, by passing `--leaderboard`.
-   Leaderboard category is toggled by `--by-<category>`. Currently only `--by-region` is available.
-   Available periods: `--today`, `--week`, `--month`, `--all-time`.

Example (regions, all time): `./wplace_archiver grabby --leaderboard --by-region --all-time`.

To get help on this mode (see available commands), run:

```bash
./wplace_archiver help grabby
```

### Grabby

Code: `grabby`

Grabs tiles around starting tile until there are no more tiles to grab within a radius. The grab radius is also configurable, as well as minimum amount of pixels in a tile. Best mode for archiving places, since it works on any configuration of tiles and doesn't get onto empty tiles much.

```bash
./wplace_archiver grabby position [--radius <value>] [--pixel-threshold <amount>] [--tile-tolerance <radius>]
```

For example, to archive the entirety of Moscow, run: `./wplace_archiver grabby "https://wplace.live/?lat=55.75110762714915&lng=37.61692349677732&zoom=11.591409617122986"`.

To get help on this mode (see available commands), run:

```bash
./wplace_archiver help grabby
```

**Note:** if you want to go paint while archival in progress, press Ctrl+C to pause the archival and free bandwidth to the server. This should help tiles load. Pressing Enter will resume the process. Currently works only for this mode, and not in between runs.

### Region

Code: `region`

Allows to save a rectangular region of the map.

-   To save a region with upper left corner at `position`, width `width_tiles` and height `height_tiles`, run:

```bash
./wplace_archiver region position --size width_tiles,height_tiles [--center]
```

Example: `./wplace_archiver region 570,710 --size 50,50`

-   To save a region with upper left corner at `position` and lower right corner at `tile_x2` and `tile_y2`, run:

```bash
./wplace_archiver region position --to tile_x2,tile_y2
```

Example: `./wplace_archiver region 570,710 --to 600,750`

-   To save a region centered at `position` with radius `radius_tiles`, run:

```bash
./wplace_archiver region position --radius radius_tiles
```

Example: `./wplace_archiver region 594,733 --radius 8`

To get help on this mode (see available commands), run:

```bash
./wplace_archiver help region
```

#### Additional options

To make the initial position a center of a region instead of the npm startupper left corner, pass `--center`.

```bash
./wplace_archiver region position --size width_tiles,height_tiles --center
```

Example: `./wplace_archiver region 594,733 --size 20,40 --center`

## Continuous archival

Allows to run the archival continuously. Once once archival "cycle" is done, next starts, saving tiles to a new folder.

Can be enabled by passing `--loop`.

Example: `./wplace_archiver grabby 1792,708 --loop`.

## Rate limiting

Defaults should work as is, without getting rate limited. The server has pretty low limits on amount of requests per second, so for a better speed some tweaking might be required. Though it's easy to get rate limited with such a low limit - and at the moment of writing this, the delay requested by the server is **one minute**.

-   To change the requests per second limit, use `--rps` option.
-   To change the amount of simultaneous requests, use `--rc` option.

## Developing

### Setup

Requires Bun installed.

Install dependencies:

```bash
bun i
```

### Running

Run with:

```bash
bun start
```

This is the equivalent to running `./wplace_archiver`.

### Building

Bun is used as a compiler for CLI binaries.

Build for all configured platforms with:

```bash
bun run build
```

Build for current platform:

```bash
bun run build:current
```
