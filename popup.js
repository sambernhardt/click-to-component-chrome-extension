const select = document.getElementById('editor');
const rootInput = document.getElementById('projectRoot');
const savedMsg = document.getElementById('savedMsg');

chrome.storage.sync.get(['editor', 'projectRoot'], (result) => {
  if (result.editor) select.value = result.editor;
  if (result.projectRoot) rootInput.value = result.projectRoot;
});

select.addEventListener('change', () => {
  chrome.storage.sync.set({ editor: select.value });
});

let saveTimer;
rootInput.addEventListener('input', () => {
  savedMsg.textContent = '';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const val = rootInput.value.trim().replace(/\/$/, '');
    chrome.storage.sync.set({ projectRoot: val }, () => {
      savedMsg.textContent = 'Saved';
      setTimeout(() => { savedMsg.textContent = ''; }, 1500);
    });
  }, 600);
});
