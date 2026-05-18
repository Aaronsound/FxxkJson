export async function writeTextToClipboard(text: string) {
  if (window.electronAPI?.writeClipboardText) {
    await window.electronAPI.writeClipboardText(text);
    return;
  }

  await navigator.clipboard.writeText(text);
}
