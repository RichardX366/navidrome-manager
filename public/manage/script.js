const table = document.querySelector('table');
const modifyDialog = document.querySelector('#modify');
const thumbnailImage = document.querySelector('img');
thumbnailImage.crossOrigin = 'anonymous';
const thumbnailInput = document.querySelector('#thumbnail');
const titleInput = document.querySelector('#title');
const artistInput = document.querySelector('#artist');
const albumInput = document.querySelector('#album');
const confirmModifyButton = document.querySelector('#confirm-modify');

let currentSong = '';
let originalThumbnail = '';

fetch('/list')
  .then((res) => res.json())
  .then((data) => {
    data.forEach((song) => {
      const row = document.createElement('tr');
      row.setAttribute('data-song', song);
      const titleCell = document.createElement('td');
      const artistCell = document.createElement('td');
      const deleteCell = document.createElement('td');
      const modifyCell = document.createElement('td');

      titleCell.textContent = song.split('-')[0].replaceAll('_', ' ');

      artistCell.textContent = song
        .split('-')[1]
        .replaceAll('_', ' ')
        .split('.')[0];

      const deleteButton = document.createElement('button');
      deleteButton.textContent = 'Delete';
      deleteButton.className = 'red';
      deleteButton.onclick = async () => {
        if (confirm('Are you sure you want to delete this song?')) {
          await fetch('/delete/' + encodeURIComponent(song), {
            method: 'DELETE',
          });
          row.remove();
        }
      };
      deleteCell.appendChild(deleteButton);

      const modifyButton = document.createElement('button');
      modifyButton.textContent = 'Modify';
      modifyButton.className = 'modify';
      modifyButton.onclick = async () => {
        const details = await fetch(
          '/details/' + encodeURIComponent(song),
        ).then((res) => res.json());

        thumbnailImage.src = details.thumbnail;
        originalThumbnail = details.thumbnail;
        titleInput.value = details.title;
        artistInput.value = details.artist;
        albumInput.value = details.album;
        currentSong = song;

        modifyDialog.showModal();
      };
      modifyCell.appendChild(modifyButton);

      row.appendChild(titleCell);
      row.appendChild(artistCell);
      row.appendChild(deleteCell);
      row.appendChild(modifyCell);

      table.appendChild(row);
    });
  });

thumbnailInput.onchange = () => {
  const file = thumbnailInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      thumbnailImage.src = reader.result;
    };
    reader.readAsDataURL(file);
  } else {
    thumbnailImage.src = originalThumbnail;
  }
};

confirmModifyButton.onclick = async () => {
  if (!confirm('Are you sure you want to modify this song?')) return;

  confirmModifyButton.disabled = true;

  const formData = new FormData();
  if (thumbnailInput.files.length) {
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

    formData.append('thumbnail', blob);
  } else {
    const blob = await fetch(originalThumbnail).then((res) => res.blob());
    formData.append('thumbnail', blob, 'thumbnail.jpg');
  }
  formData.append('title', titleInput.value);
  formData.append('artist', artistInput.value);
  formData.append('album', albumInput.value);

  const newSongName = await fetch(
    '/update/' + encodeURIComponent(currentSong),
    {
      method: 'PUT',
      body: formData,
    },
  ).then((res) => res.text());

  const row = document.querySelector(`tr[data-song="${currentSong}"]`);
  row.setAttribute('data-song', newSongName);
  row.querySelector('td').textContent = titleInput.value;
  row.querySelector('td:nth-child(2)').textContent = artistInput.value;
  row.querySelector('button').onclick = async () => {
    if (confirm('Are you sure you want to delete this song?')) {
      await fetch('/delete/' + encodeURIComponent(newSongName), {
        method: 'DELETE',
      });
      row.remove();
    }
  };
  row.querySelector('button.modify').onclick = async () => {
    const details = await fetch(
      '/details/' + encodeURIComponent(newSongName),
    ).then((res) => res.json());

    thumbnailImage.src = details.thumbnail;
    originalThumbnail = details.thumbnail;
    titleInput.value = details.title;
    artistInput.value = details.artist;
    albumInput.value = details.album;
    currentSong = newSongName;

    modifyDialog.showModal();
  };

  modifyDialog.close();

  confirmModifyButton.disabled = false;
};
