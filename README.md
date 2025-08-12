# wplace-archiver

An CLI archiver script for wplace.live. Preserve 🧡

Currently archived: see [wplace-archives](https://github.com/murolem/wplace-archives).

## Usage

Get a binary from [releases](https://github.com/murolem/wplace-archiver/releases). Binaries are available for linux-x64 and windows-x64 (untested).

To run:

```bash
./wplace_archiver [args] <mode> [mode args]
```

where:

-   `[args]` are optional general arguments.
-   `<mode>` is a archival mode. Currently, only `region` mode is available.
-   `[mode args]` are mode-specific arguments. Some arguments could be required, some are optional.

See [Modes](#Modes) for the list of available modes.

For help, run:

```bash
./wplace_archiver help
```

## Modes

### Region

Code: `region`

Allows to save a rectangular region of the map.

-   To save a region with upper left corner at `tile_x` and `tile_y` and width `width_tiles` and height `height_tiles`, run:

```bash
./wplace_archiver region tile_x,tile_y --size width_tiles,height_tiles
```

Example: `./wplace_archiver region 570,710 --size 50,50`

-   To save a region with upper left corner at `tile_x1` and `tile_y1` and lower right corner at `tile_x2` and `tile_y2`, run:

```bash
./wplace_archiver region tile_x1,tile_y1 --to tile_x2,tile_y2
```

Example: `./wplace_archiver region 570,710 --to 600,750`

-   To save a region centered at `tile_x1` and `tile_y1` with radius `radius_tiles`, run:

```bash
./wplace_archiver region tile_x,tile_y --radius radius_tiles
```

Example: `./wplace_archiver region 594,733 --radius 8`

#### Additional options

To make the initial position a center of a region instead of the upper left corner, pass `--center`.

```bash
./wplace_archiver region tile_x,tile_y --size width_tiles,height_tiles --center
```

Example: `./wplace_archiver region 594,733 --size 20,40 --center`

### Entire map (currently off)

### UPDATE: wplace introduced an RPS limit so archiving at the good speed is now impossible. At the moment of writing this, the limit is about 8-10 RPS, which equals to about 120 hours of archiving compared to previous 2 hours at 500 RPS. RIP.

Saves all map tiles to a folder in parallel. Saving is done continuously, so once one archival is complete next begins.

Empty tiles do not exists on the server, so they are not saved. The entire map is 2048 by 2048 tiles in total.

Any errors should get retried, so that no tiles are lost. A special archival errors folder is created if any errors are encountered, containing saved errors - one in each file corresponding to a specific tile.

## Developing

### Setup

Requires Node and Bun installed.

Install dependencies:

```bash
npm i
```

### Building

Bun is used as a "compiler" for CLI binaries.

Build for all configured platforms with:

```bash
npm run build
```

Build for current platform:

```bash
npm run build:current
```
