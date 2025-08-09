# wplace-archiver

An archiver script for wplace.live. Preserve 🧡

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
