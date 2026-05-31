export async function writeTextToClipboard(text: string) {
  if (window.electronAPI?.writeClipboardText) {
    await window.electronAPI.writeClipboardText(text);
    return;
  }

  await navigator.clipboard.writeText(text);
}

export async function readTextFromClipboard() {
  if (window.electronAPI?.readClipboardText) {
    return window.electronAPI.readClipboardText();
  }

  return navigator.clipboard.readText();
}
