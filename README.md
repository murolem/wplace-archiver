# wplace-archiver

An CLI archiver script for wplace.live. Preserve 🧡

Currently archived: see [wplace-archives](https://github.com/murolem/wplace-archives).

## Usage

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

For help, run:

```bash
./wplace_archiver help
```

## Modes

### Grabby

Code: `grabby`

Grabs tiles around specified tile until there are no more tiles to grab. Best mode for archiving places, since it works on any configuration of tiles and doesn't get onto empty tiles much (only within the set tolerance). Tiles are filtered by a pixel threshold and a grab radius (aka the tolerance).

```bash
./wplace_archiver grabby tile_x,tile_y [--threshold <value>] [--radius <value>]
```

For example, to archive the entirety of Moscow: `npm start -- region 1238,639`

### Region

Code: `region`

Allows to save a rectangular region of the map.

-   To save a region with upper left corner at `tile_x` and `tile_y` and width `width_tiles` and height `height_tiles`, run:

```bash
./wplace_archiver region tile_x,tile_y --size width_tiles,height_tiles [--center]
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

## Continuous archival

Allows to run the archival continuously. Once once archival "cycle" is done, next starts, saving tiles to a new folder.

Can be enabled by passing `--loop`.

Example: `npm start -- grabby 1792,708 --loop`.

## Rate limiting

The server often changes limits on amount of requests per second, so it could be taken advantage of by utilizing the requests per second option `--rps` and concurrent requests option `--rc`. See help for more details.

Example of 2 requests per second:

```bash
./wplace_archiver [mode] --rps 2
```

Or same, but in requests per minute:

```bash
./wplace_archiver [mode] --rpm 120
```

The defaults should work as-is, though to get archiving done faster you might wan't to fine tune these. If you go too high, you'll start to get a lot of errors. The faster the errors show up the more it needs to be tuned down.

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
