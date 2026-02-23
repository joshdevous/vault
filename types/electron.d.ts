export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  platform: string;
  selectFolder: () => Promise<string | null>;
  onGlobalNewNote: (callback: () => void) => () => void;
  quickNoteCreate: (text: string) => Promise<{ id: string }>;
  quickNoteUpdate: (noteId: string, text: string) => Promise<unknown>;
  closeQuickNote: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
