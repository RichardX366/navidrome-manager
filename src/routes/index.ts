import express, { Router } from 'express';
import { Promise as id3 } from 'node-id3';
import deepL from 'deepl';
import { readdir, access, unlink, rename } from 'fs/promises';
import ytdl from '@nuclearplayer/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';

const baseRouter = Router();

baseRouter.use((req, res, next) => {
  if (
    req.path.startsWith('/auth') &&
    req.cookies['password'] === process.env.ADMIN_KEY
  ) {
    return res.redirect('/');
  }

  if (req.path.startsWith('/auth') || req.path === '/style.css') return next();

  if (req.cookies['password'] !== process.env.ADMIN_KEY) {
    return res.redirect('/auth');
  }

  next();
});

baseRouter.use(express.static('public'));

const translate = async (text: string) => {
  const { data } = await deepL({
    free_api: true,
    text,
    target_lang: 'EN',
    auth_key: process.env.DEEPL_KEY as string,
  });
  return data.translations[0].text;
};

baseRouter.get('/info/:id', async (req, res) => {
  const { id } = req.params;
  if (!id || (!ytdl.validateID(id) && !ytdl.validateURL(id))) {
    return res.status(404);
  }

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
    if (thumb.width > thumbnail.width) {
      thumbnail = thumb;
    }
  });

  res.json({
    artist,
    title,
    thumbnail: thumbnail.url.split('?')[0],
    loudness: song.player_response.playerConfig.audioConfig.loudnessDb,
  });
});

const cleanFilename = (filename: string) => {
  return filename
    .replaceAll('/', '')
    .replaceAll('\\', '')
    .replaceAll(':', '')
    .replaceAll('*', '')
    .replaceAll('?', '')
    .replaceAll('"', '')
    .replaceAll('<', '')
    .replaceAll('>', '')
    .replaceAll('(', '')
    .replaceAll(')', '')
    .replaceAll('|', '')
    .replaceAll('.', '_')
    .replaceAll(' ', '_')
    .replaceAll('-', '_');
};

baseRouter.post(
  '/download/:id',
  multer({
    storage: multer.diskStorage({}),
    fileFilter(req, file, callback) {
      const { id } = req.params;
      if (!id || (!ytdl.validateID(id) && !ytdl.validateURL(id))) {
        return callback(new Error('Invalid video ID'));
      }

      if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
        callback(null, true);
      } else {
        callback(new Error('Invalid file type'));
      }
    },
  }).single('thumbnail'),
  async (req, res) => {
    const { id } = req.params;
    if (!id || (!ytdl.validateID(id) && !ytdl.validateURL(id))) {
      return res.status(404);
    }

    if (!req.body.title) {
      return res.status(400).send('Title is required');
    }

    if (!req.body.loudness) {
      return res.status(400).send('Loudness is required');
    }

    if (!req.file) {
      return res.status(400).send('Thumbnail file is required');
    }

    const filename = `/music/${cleanFilename(req.body.title)}-${
      cleanFilename(req.body.artist) || 'Unknown'
    }.mp3`;

    const stream = ytdl(id, { quality: 'highestaudio', filter: 'audioonly' });

    await new Promise<void>((resolve, reject) =>
      ffmpeg(stream)
        .audioCodec('libmp3lame')
        .audioBitrate(192)
        .audioFilters([
          {
            filter: 'volume',
            options: 8 - req.body.loudness + 'dB',
          },
        ])
        .save(filename)
        .on('end', () => resolve())
        .on('error', (err) => reject(err)),
    );

    await id3.write(
      {
        title: req.body.title,
        artist: req.body.artist,
        album: req.body.album,
        image: req.file.path,
      },
      filename,
    );

    await unlink(req.file.path);

    res.send('success');
  },
);

baseRouter.get('/list', async (req, res) => {
  res.json(await readdir('/music'));
});

baseRouter.delete('/delete/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!filename) {
    return res.status(400).send('Filename is required');
  }
  if (filename.includes('/') || filename.includes('\\')) {
    return res.status(400).send('Invalid filename');
  }

  await unlink(`/music/${filename}`);

  res.send('success');
});

baseRouter.get('/details/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!filename) {
    return res.status(400).send('Filename is required');
  }
  if (filename.includes('/') || filename.includes('\\')) {
    return res.status(400).send('Invalid filename');
  }

  const file = await id3.read(`/music/${filename}`);
  const image = (file.image as any).imageBuffer;

  const thumbnailDataUrl = file.image
    ? `data:${(await fileTypeFromBuffer(image))?.mime};base64,${image.toString(
        'base64',
      )}`
    : null;

  res.json({
    title: file.title,
    artist: file.artist,
    album: file.album,
    thumbnail: thumbnailDataUrl,
  });
});

baseRouter.put(
  '/update/:filename',
  multer({
    storage: multer.diskStorage({}),
    async fileFilter(req, file, callback) {
      const { filename } = req.params;
      if (!filename || filename.includes('/') || filename.includes('\\')) {
        return callback(new Error('Bad filename'));
      }

      try {
        await access(`/music/${filename}`);
      } catch (err) {
        return callback(new Error('File not found'));
      }

      if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
        callback(null, true);
      } else {
        callback(new Error('Invalid file type'));
      }
    },
  }).single('thumbnail'),
  async (req, res) => {
    const { filename } = req.params;

    try {
      await access(`/music/${filename}`);
    } catch (err) {
      return res.status(404).send('File not found');
    }

    if (!req.file) {
      return res.status(400).send('Thumbnail file is required');
    }

    await id3.write(
      {
        title: req.body.title,
        artist: req.body.artist,
        album: req.body.album,
        image: req.file?.path,
      },
      `/music/${filename}`,
    );

    if (req.file) {
      await unlink(req.file.path);
    }

    const newFilename = `${cleanFilename(req.body.title)}-${
      cleanFilename(req.body.artist) || 'Unknown'
    }.mp3`;

    await rename(`/music/${filename}`, '/music/' + newFilename);

    res.send(newFilename);
  },
);

export default baseRouter;
