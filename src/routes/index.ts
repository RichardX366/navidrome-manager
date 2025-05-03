import express, { Router } from 'express';
import { Promise as id3 } from 'node-id3';
import { readdir, access, unlink, rename } from 'fs/promises';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { exit } from 'process';

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

    const newFilename = `${cleanFilename(
      req.body.title || 'Unknown',
    )}-${cleanFilename(req.body.artist || 'Unknown')}.mp3`;

    await rename(`/music/${filename}`, '/music/' + newFilename);

    res.send(newFilename);
  },
);

baseRouter.post(
  '/upload',
  multer({
    storage: multer.diskStorage({}),
    async fileFilter(req, file, callback) {
      if (
        !file.originalname ||
        file.originalname.includes('/') ||
        file.originalname.includes('\\')
      ) {
        return callback(new Error('Bad filename'));
      }

      try {
        await access(`/music/${file.originalname}`);
      } catch (err) {
        if (file.mimetype === 'audio/mpeg') {
          return callback(null, true);
        } else {
          return callback(new Error('Invalid file type'));
        }
      }

      return callback(new Error('File already exists'));
    },
  }).single('song'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).send('File is required');
    }

    const details = await id3.read(req.file.path);
    const newFilename = `${cleanFilename(
      details.title || 'Unknown',
    )}-${cleanFilename(details.artist || 'Unknown')}.mp3`;

    await rename(req.file.path, '/music/' + newFilename);

    res.send(newFilename);
  },
);

export default baseRouter;
