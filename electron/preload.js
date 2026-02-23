const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  
  // Platform info
  platform: process.platform,
  
  // File system dialogs
  selectFolder: () => ipcRenderer.invoke("select-folder"),

  // Global shortcuts
  onGlobalNewNote: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on("global-create-note", listener);

    return () => {
      ipcRenderer.removeListener("global-create-note", listener);
    };
  },

  // Quick note window
  quickNoteCreate: (text) => ipcRenderer.invoke("quick-note-create", { text }),
  quickNoteUpdate: (noteId, text) => ipcRenderer.invoke("quick-note-update", { noteId, text }),
  closeQuickNote: () => ipcRenderer.send("quick-note-close"),
  
  // Add more IPC methods here as needed
});
