import { applyTheme, preferences, send } from './settings.js';

const saved = await preferences();
const status = document.querySelector('#pair-status');
const key = document.querySelector('#key');
const connect = document.querySelector('#connect');
const disconnect = document.querySelector('#disconnect');
let statusRequest = 0;
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
document.querySelector('#pair').addEventListener('submit', async (event) => {
  event.preventDefault();
  statusRequest++;
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
disconnect.addEventListener('click', async () => {
  statusRequest++;
  await chrome.storage.local.remove('key');
  key.value = '';
  message('Disconnected');
});

if (saved.key) {
  const request = ++statusRequest;
  void send('status').then(
    ({ library }) => {
      if (request === statusRequest) message(`Connected to ${library}`);
    },
    (error) => {
      if (request === statusRequest) message(error.message, true);
    },
  );
} else message('Ready to pair');
connect.disabled = disconnect.disabled = false;
