import App from './App.svelte';
import './styles/global.css';

// Svelte appends into `target` rather than replacing its contents, so the boot splash
// from index.html has to be cleared by hand — otherwise it would sit above the app.
const target = document.getElementById('app');
target.innerHTML = '';

const app = new App({ target });

// Reveals the site footer (hidden during boot so it isn't the only thing on an
// otherwise empty page while the bundle downloads).
document.body.classList.add('app-ready');

export default app;
