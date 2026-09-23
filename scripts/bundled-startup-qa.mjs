// Serialized into the isolated emulator WebView; never mutates application state.
export function bundledStartupQa() {
  if (document.querySelector('.app')?.dataset.panel !== 'tasks'
      || !document.querySelector('button[data-panel="tasks"]')?.classList.contains('active')
      || !document.querySelector('#today-panel')?.classList.contains('active')) {
    throw Error('Ordinary bundled launch must open Tasks');
  }
  if (document.querySelector('#task-modal')?.classList.contains('open')) {
    throw Error('Ordinary launch must not open the editor');
  }
  return { tasks: true, editorClosed: true };
}
