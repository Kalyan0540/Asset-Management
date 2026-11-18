import { applyTheme, preferences, send } from './settings.js';

const feedback = document.querySelector('#feedback');
const connection = document.querySelector('#connection');
function inform(text, error = false) {
  feedback.hidden = false;
  feedback.dataset.error = String(error);
  feedback.textContent = text;
}
const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
applyTheme((await preferences()).theme);
const notice = (await chrome.storage.session.get(`notice:${tab?.id}`))[`notice:${tab?.id}`];
if (notice && Date.now() - notice.time < 180_000) inform(notice.message, !notice.ok);
void send('status').then(
  ({ library }) => {
    connection.textContent = library;
    connection.title = library;
  },
  () => {
    connection.textContent = 'Pair in Preferences';
  },
);
document
  .querySelector('#preferences')
  .addEventListener('click', () => void chrome.runtime.openOptionsPage());

const actions = Array.from(document.querySelectorAll('[data-action]'));
for (const button of actions)
  button.addEventListener('click', async () => {
    const { action } = button.dataset;
    for (const control of actions) control.disabled = true;
    try {
      const result = send(action, { tabId: tab?.id });
      if (action === 'area') {
        void result.catch(() => {});
        window.close();
        return;
      }
      inform('Working…');
      await result;
      if (action === 'review') {
        window.close();
        return;
      }
      inform(action === 'enable-drag' ? 'Page tools are active on this tab.' : 'Saved to Atlas.');
    } catch (error) {
      inform(error.message, true);
    } finally {
      for (const control of actions) control.disabled = false;
    }
  });
