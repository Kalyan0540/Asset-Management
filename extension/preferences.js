import { applyTheme, preferences, send } from './settings.js';

const saved = await preferences();
const status = document.querySelector('#pair-status');
const key = document.querySelector('#key');
function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}
for (const field of ['theme', 'tags', 'drag', 'doubleClick']) {
  const input = document.getElementById(field);
  const property = input.type === 'checkbox' ? 'checked' : 'value';
  input[property] = saved[field];
  input.addEventListener('change', () => {
    void chrome.storage.local.set({ [field]: input[property] });
    if (field === 'theme') applyTheme(input.value);
  });
}
applyTheme(saved.theme);
if (saved.key)
  void send('status').then(
    ({ library }) => message(`Connected to ${library}`),
    (error) => message(error.message, true),
  );
else message('Ready to pair');

document.querySelector('#pair').addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = key.value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    message('Paste the full pairing key from Atlas.', true);
    return;
  }
  const controls = event.currentTarget.querySelectorAll('button');
  controls.forEach((button) => {
    button.disabled = true;
  });
  try {
    const { library } = await send('check-key', { key: value });
    await chrome.storage.local.set({ key: value });
    key.value = '';
    message(`Connected to ${library}`);
  } catch (error) {
    message(error.message, true);
  } finally {
    controls.forEach((button) => {
      button.disabled = false;
    });
  }
});
document.querySelector('#disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove('key');
  key.value = '';
  message('Disconnected');
});
