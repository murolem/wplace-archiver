import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import fs from 'fs';
import { Jimp } from 'jimp';
import { diffImages } from '$lib/DiffFile/diffImages';
// import sharp from 'sharp';

parentPort.on('message', async (imgFilepath1, imgFilepath2) => {
    parentPort.postMessage(
        await diffImages(imgFilepath1, imgFilepath2)
    );
});