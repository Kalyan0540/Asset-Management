import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('atlasDesktop', {
  appearance: () => ipcRenderer.invoke('atlas:appearance'),
  readDrafts: () => ipcRenderer.invoke('atlas:read-drafts'),
  writeDrafts: (drafts: unknown) => ipcRenderer.invoke('atlas:write-drafts', drafts),
  setAppearance: (value: string) => ipcRenderer.invoke('atlas:set-appearance', value),
  libraries: () => ipcRenderer.invoke('atlas:libraries'),
  libraryAction: (action: string, path?: string) =>
    ipcRenderer.invoke('atlas:library-action', action, path),
  itemAction: (id: string, action: string) => ipcRenderer.invoke('atlas:item-action', id, action),
  exportOriginals: (ids: string[]) => ipcRenderer.invoke('atlas:export-originals', ids),
  imageSearch: (id: string, provider: string, png?: Uint8Array) =>
    ipcRenderer.invoke('atlas:image-search', id, provider, png),
});
