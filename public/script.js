const linkInput = document.querySelector('#yt-link');
const fetchButton = document.querySelector('#fetch');
const table = document.querySelector('table');
const thumbnailImage = document.querySelector('img');
thumbnailImage.crossOrigin = 'anonymous';
const thumbnailInput = document.querySelector('#thumbnail');
const titleInput = document.querySelector('#title');
const artistInput = document.querySelector('#artist');
const albumInput = document.querySelector('#album');
const downloadButton = document.querySelector('table button');
let loudness = 0;

fetchButton.onclick = async () => {
  const videoLink = linkInput.value;
  if (!videoLink) return;

  const response = await fetch('/info/' + encodeURIComponent(videoLink)).then(
    (res) => res.json(),
  );

  thumbnailImage.src = response.thumbnail;
  titleInput.value = response.title;
  artistInput.value = response.artist;
  albumInput.value = '';
  loudness = response.loudness;

  table.style.display = 'table';
};

downloadButton.onclick = async () => {
  if (confirm('Are you sure you want to download this song?')) {
    const canvas = new OffscreenCanvas(300, 300);
    const ctx = canvas.getContext('2d');
    const cropSize = Math.min(
      thumbnailImage.naturalWidth,
      thumbnailImage.naturalHeight,
    );
    const sx = (thumbnailImage.naturalWidth - cropSize) / 2;
    const sy = (thumbnailImage.naturalHeight - cropSize) / 2;

    ctx.drawImage(
      thumbnailImage,
      sx,
      sy,
      cropSize,
      cropSize,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const blob = await new Promise((resolve) => {
      canvas.convertToBlob({ type: 'image/jpeg' }).then((blob) => {
        resolve(blob);
      });
    });

    const formData = new FormData();
    formData.append('thumbnail', blob, 'thumbnail.jpg');
    formData.append('title', titleInput.value);
    formData.append('artist', artistInput.value);
    formData.append('album', albumInput.value);
    formData.append('loudness', loudness);

    const response = await fetch(
      '/download/' + encodeURIComponent(linkInput.value),
      {
        method: 'POST',
        body: formData,
      },
    );

    if (response.status === 200) {
      table.style.display = 'none';
      alert('Download successful!');
    }
  }
};
