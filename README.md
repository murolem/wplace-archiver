# wplace-archiver

An CLI archiver utility for wplace.live. Preserve 🧡

Currently archived: see [wplace-archives](https://github.com/murolem/wplace-archives).

## Usage

This is Command Line Utility, meaning it will only run through console/terminal. Just running the EXE file **will not work**.

---

Grab a binary from [releases](https://github.com/murolem/wplace-archiver/releases/latest). Binaries are available for linux-x64 and windows-x64 (untested).

To run:

```bash
./wplace-archiver [args] <mode> [mode args]
```

where:

-   `[args]` are optional general arguments.
-   `<mode>` is a archival mode. Currently, only `region` mode is available.
-   `[mode args]` are mode-specific arguments. Some arguments could be required, some are optional.

See [Modes](#Modes) for the list of available modes.

The utility operates on **tiles**. A tile is a 1000x1000px image that holds pixels of a part of a map. Entire map is 2048x2048 tiles.

For help (to see available commands), run:

```bash
./wplace-archiver help
```

To see commands for a specific mode, run:

```bash
./wplace-archiver help [mode]
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

Example (regions, all time): `./wplace-archiver grabby --leaderboard --by-region --all-time`.

To get help on this mode (see available commands), run:

```bash
./wplace-archiver help grabby
```

### Grabby

Code: `grabby`

Grabs tiles around starting tile until there are no more tiles to grab within a radius. The grab radius is also configurable, as well as minimum amount of pixels in a tile. Best mode for archiving places, since it works on any configuration of tiles and doesn't get onto empty tiles much.

```bash
./wplace-archiver grabby position [--radius <value>] [--pixel-threshold <amount>] [--tile-tolerance <radius>]
```

For example, to archive the entirety of Moscow, run: `./wplace-archiver grabby "https://wplace.live/?lat=55.75110762714915&lng=37.61692349677732&zoom=11.591409617122986"`.

To get help on this mode (see available commands), run:

```bash
./wplace-archiver help grabby
```

**Note:** if you want to go paint while archival in progress, press Ctrl+C to pause the archival and free bandwidth to the server. This should help tiles load. Pressing Enter will resume the process. Currently works only for this mode, and not in between runs.

### Region

Code: `region`

Allows to save a rectangular region of the map.

-   To save a region with upper left corner at `position`, width `width_tiles` and height `height_tiles`, run:

```bash
./wplace-archiver region position --size width_tiles,height_tiles [--center]
```

Example: `./wplace-archiver region 570,710 --size 50,50`

-   To save a region with upper left corner at `position` and lower right corner at `tile_x2` and `tile_y2`, run:

```bash
./wplace-archiver region position --to tile_x2,tile_y2
```

Example: `./wplace-archiver region 570,710 --to 600,750`

-   To save a region centered at `position` with radius `radius_tiles`, run:

```bash
./wplace-archiver region position --radius radius_tiles
```

Example: `./wplace-archiver region 594,733 --radius 8`

To get help on this mode (see available commands), run:

```bash
./wplace-archiver help region
```

##### Additional options

To make the initial position a center of a region instead of the npm startupper left corner, pass `--center`.

```bash
./wplace-archiver region position --size width_tiles,height_tiles --center
```

Example: `./wplace-archiver region 594,733 --size 20,40 --center`

### World

The only realistic way to archive the entire world is to use [#Freebind](#freebind) - see the section for details.

## Continuous archival

Allows to run the archival continuously. Once once archival "cycle" is done, next starts, saving tiles to a new folder.

Can be enabled by passing `--loop`.

Example: `./wplace-archiver grabby 1792,708 --loop`.

## Rate limiting

Defaults should work as is, without getting rate limited. The server has pretty low limits on amount of requests per second, so for a better speed some tweaking might be required. Though it's easy to get rate limited with such a low limit - and at the moment of writing this, the delay requested by the server is **one minute**.

-   To change the requests per second limit, use `--rps` option.
-   To change the amount of simultaneous requests, use `--rc` option.

### Freebind

Currently, WPlace has **no rate limiting on ipv6 addresses within a subnet**. This could be used to archive the entire map in **hours or even minutes**, granted an ipv6 subnet is available for use and a random IP from that subnet is used for each request. [freebind.js](https://www.npmjs.com/package/freebind) is used for this purpose.

**Note: Due to limitations of Bun, it is not possible to use Freebind in built binary nor with Bun as a runtime. Meaning it is only possible to use it while in development and using Node.**

**Note 2: Freebind is only supported on Linux.**

To get a free ipv6 subnet, visit [Hurricane Electric](http://he.net). They give out free ipv6 /64 tunnels, along with setup instructions.

To setup with Node instead of Bun, delete `node_modules` (if installed) and run:

```
npm i
```

To use Node, run commands with `npm run start:freebind --` instead of `./wplace-archiver` or `npm start --`.

In order to make use of freebinding, you first need to configure the Linux AnyIP kernel feature in order to be able to bind a socket to an arbitrary IP address from this subnet as follows:

```
ip -6 route add local <subnet> dev lo
```

To enable Freebind, use: `--freebind <ipv6_subnet>`. This will pregenerate a bunch of agents using random IPs from the subnet and use them sequentually for all requests.
Since agents are reused, it is still possible to get rate limited on individual IPs.

To control RPS per individual IP, use `--server-rps-limit <rps>`.

Example command to archive the entire map (with error file output):

```bash
npm run start:freebind -- region 0,0 --size 2048,2048 --rps 1000 --rc 250 --no-error-out --freebind 2a00:1450:4001:81b::/64
```

## Archives uploaded to the archives repo

Currently, only the [#World](#world) archives are being uploaded to [wplace-archives](https://github.com/murolem/wplace-archives).

The archival and upload are running on my server via task `archive_map_and_upload`, which utilizes [#Freebind](#freebind). What it does:

1. launches the arhcival process.
2. waits for it to finish.
3. compresses archived results.
4. creates a github release in the archives repo.
5. uploads compressed archives.
6. purges archive dir and compressed archives.
7. repeats, if --loop is provided.

To run:

```bash
npm run archive-map-and-upload <args>
```

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

This is the equivalent to running `./wplace-archiver`.

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

### Creating a release

Releases are created via `build` task. To run:

```bash
bun run build
```

### Uploading a release

Uploads are done via `--upload` option in `build` task. To run:

```bash
bun run build --upload <version>
```
