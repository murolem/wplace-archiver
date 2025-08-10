# wplace-archiver

### UPDATE: wplace introduced an RPS limit so archiving at the good speed is now impossible. At the moment of writing this, the limit is about 8-10 RPS, which equals to about 120 hours of archiving compared to previous 2 hours at 500 RPS. RIP.

An archiver script for wplace.live. Preserve 🧡

Currently archived: see [wplace-archives](https://github.com/murolem/wplace-archives).

Saves all map tiles to a folder in parallel. Takes about 2 hours with 500 requests per second (default). Saving is done continuously, so once one archival is complete next begins.

Empty tiles do not exists on the server, so they are not saved. The entire map is 2048 by 2048 tiles in total.

Any errors should get retried, so that no tiles are lost. A special archival errors folder is created if any errors are encountered, containing saved errors - one in each file corresponding to a specific tile.

## Configuring

See `src/index.ts` for configuring. All the configurable variables are at the start.

## Running

To run continuously, creating archives:

Install dependencies:

```bash
npm i
```

Run with:

```bash
npm start
```
