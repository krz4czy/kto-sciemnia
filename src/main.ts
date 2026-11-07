import '@fontsource/syne/latin-800.css';
import '@fontsource/syne/latin-700.css';
import '@fontsource/syne/latin-ext-800.css';
import '@fontsource/syne/latin-ext-700.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/outfit/latin-800.css';
import '@fontsource/outfit/latin-ext-400.css';
import '@fontsource/outfit/latin-ext-600.css';
import '@fontsource/outfit/latin-ext-800.css';
import './style.css';
import { mountHome } from './ui/home';
import { mountHost } from './ui/hostScreen';
import { mountPlayer } from './ui/playerScreen';

const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) throw new Error('Brak kontenera');

const screen = new URLSearchParams(location.search).get('screen');
let stop = () => {};
if (screen === 'host') {
  document.body.classList.add('mode-host');
  document.title = 'Kto ściemnia · ekran';
  stop = mountHost(root);
} else if (screen === 'join') {
  document.body.classList.add('mode-player');
  document.title = 'Kto ściemnia · telefon';
  stop = mountPlayer(root);
} else {
  document.body.classList.add('mode-home');
  document.title = 'Kto ściemnia';
  stop = mountHome(root);
}

window.addEventListener('pagehide', () => stop());
