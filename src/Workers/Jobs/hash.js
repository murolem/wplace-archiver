import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import fs from 'fs';
// import { Jimp } from 'jimp';
// import sharp from 'sharp';

parentPort.on('message', (filepaths) => {
    parentPort.postMessage(
        // hashes
        filepaths.map(p => createHash('sha1').update(fs.readFileSync(p)).digest('base64')),
    );
});