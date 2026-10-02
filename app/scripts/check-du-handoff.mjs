import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/pages/DuAdminPage.tsx', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

const failures = [];
const requireText = (source, text, label) => {
  if (!source.includes(text)) failures.push(`Missing ${label}`);
};
const forbidText = (source, text, label) => {
  if (source.includes(text)) failures.push(`Forbidden ${label}`);
};

forbidText(index, 'window.open = function', 'global window.open override');
forbidText(index, "const nativeChatGptUrl = 'chatgpt://'", 'global bare ChatGPT launcher shim');
forbidText(admin, "window.open('about:blank','du-chatgpt')", 'about:blank D&U ChatGPT proxy');
forbidText(admin, "chatWindow.location.href='https://chatgpt.com/'", 'async browser-window handoff');
requireText(admin, "START D&U STENCIL — ${handoff.job_number}", 'job-specific stencil instruction');
requireText(admin, "${handoff.handoff_url}", 'secure handoff URL');
requireText(admin, "window.location.href='chatgpt://'", 'explicit iOS native ChatGPT action');
requireText(admin, "Tap Open ChatGPT below, paste, and send.", 'deterministic manual fallback guidance');
requireText(serviceWorker, "notificationTarget(payload.url)", 'same-origin exact-job push target');
requireText(serviceWorker, "client.navigate(targetUrl)", 'notification deep-link navigation');

if (failures.length) {
  console.error('D&U handoff regression check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('D&U handoff regression check passed.');
