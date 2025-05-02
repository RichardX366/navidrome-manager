const linkInput = document.querySelector('#yt-link');
const fetchButton = document.querySelector('#fetch');

fetchButton.onclick = async () => {
  const videoLink = linkInput.value;
  if (!videoLink) return;

  const response = await fetch('/info/' + encodeURIComponent(videoLink)).then(
    (res) => res.json(),
  );

  console.log(response);
};
