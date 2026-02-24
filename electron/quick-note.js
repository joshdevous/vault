const input = document.getElementById("quickInput");

let noteId = null;
let createInFlight = false;
let saveTimer = null;
let saveSeq = 0;

async function ensureNoteExists(text) {
  if (noteId || createInFlight || !text.trim()) {
    return;
  }

  createInFlight = true;

  try {
    const note = await window.electronAPI.quickNoteCreate(text);
    noteId = note.id;
  } catch (error) {
    console.error("[quick-note] create failed", error);
  } finally {
    createInFlight = false;
  }
}

async function flushSave() {
  const text = input.value;
  const mySeq = ++saveSeq;

  if (!text.trim()) {
    return;
  }

  await ensureNoteExists(text);
  if (!noteId) {
    return;
  }

  try {
    await window.electronAPI.quickNoteUpdate(noteId, text);
    void mySeq;
  } catch (error) {
    console.error("[quick-note] update failed", error);
  }
}

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    void flushSave();
  }, 350);
}

input.addEventListener("input", () => {
  scheduleSave();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    window.electronAPI.closeQuickNote();
  }
});

window.addEventListener("beforeunload", () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
});

input.focus();
