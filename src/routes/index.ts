import express, { Router } from 'express';
import { Promise as id3 } from 'node-id3';
import deepL from 'deepl';
import {
  createWriteStream,
  unlinkSync,
  mkdirSync,
  existsSync,
  renameSync,
} from 'fs';
import { config } from 'dotenv';
import axios from 'axios';
import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';

const baseRouter = Router();

baseRouter.use(express.static('public'));

const translate = async (text: string) => {
  const { data } = await deepL({
    free_api: true,
    text,
    target_lang: 'EN',
    auth_key: process.env.KEY as string,
  });
  return data.translations[0].text;
};

baseRouter.get('/info/:id', async (req, res) => {
  const { id } = req.params;
  if (!ytdl.validateURL(id || '')) return res.status(404);

  const song = await ytdl.getInfo(id);

  const [artist, title] = await Promise.all([
    translate(song.videoDetails.author.name),
    translate(song.videoDetails.title).then((title) =>
      title
        .split(' ')
        .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .replaceAll('/', '')
        .replaceAll('\\', ''),
    ),
  ]);

  let thumbnail = {
    url: '',
    width: 0,
    height: 0,
  };

  song.videoDetails.thumbnails.forEach((thumb) => {
    if (thumb.width > thumbnail.width && thumb.url.includes('.jpg')) {
      thumbnail = thumb;
    }
  });

  res.json({ artist, title, thumbnail: thumbnail.url.split('?')[0] });
});

const downloadImage = async (url: string, path: string) => {
  const { data: response } = (await axios({
    method: 'GET',
    url,
    responseType: 'stream',
  })) as { data: NodeJS.ReadableStream };

  const stream = createWriteStream(path);
  response.pipe(stream);

  return new Promise<void>((res) => stream.on('finish', res));
};

baseRouter.get('/download/:id', async (req, res) => {
  const { id } = req.params;
  if (!ytdl.validateURL(id || '')) return res.status(404);
});

export default baseRouter;
