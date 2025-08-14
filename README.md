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

The script operates on **tiles**. A tile is a 1000x1000px image that holds pixels of a part of a map. Entire map is 2048x2048 tiles. To get your current tile position:

1. Open Developer tools.
2. Go to Network tab.
3. Press "All" or "XHR" tab.
4. Move around.
5. Click on any .png file that appears in the list.
6. Click on "Headers" tab for that request.
7. You will see a URL (or part of it) that looks something like `/files/s0/tiles/1792/708.png`. `1792/708` is a tile position of nearby tile; `1792` is X and `708` is Y.

For help (to see available commands), run:

```bash
./wplace_archiver help
```

To see commands for a specific mode, run:

```bash
./wplace_archiver help [mode]
```

## Modes

### Grabby

Code: `grabby`

Grabs tiles around starting tile until there are no more tiles to grab within a radius. The grab radius is also configurable, as well as minimum amount of pixels in a tile. Best mode for archiving places, since it works on any configuration of tiles and doesn't get onto empty tiles much.

```bash
./wplace_archiver grabby tile_x,tile_y [--radius <value>] [--pixel-threshold <amount>] [--tile-tolerance <radius>]
```

For example, to archive the entirety of Moscow, run: `npm start -- grabby 1238,639`.

**Note:** if you getting **Too Many Requests** error, it is expected. The script "bruteforces" through these errors and it works anyway (to a degree) due to poor rate limiting implementation on Wplace.

**Note2:** if you want to go paint while archival in progress, press Ctrl+C to pause the archival and free bandwidth to the server. This should help tiles load. Pressing Enter will resume the process. Currently works only for this mode, and not in between runs.

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

The server has pretty low limits on amount of requests per second, so some tweaking might be required. At the moment of writing this, the defaults are pretty good and fine-tuned for good RPS, even going past the limit and rate limit errors (to some degree).

-   To change the requests per second limit, use `--rps` option.
-   To change the amount of simultaneous requests, use `--rc` option.
-   To respect the delay that server requests on Too Many Requests error, set `--respect-429-delay` option.

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
