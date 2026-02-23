const input = document.getElementById("quickInput");
const statusEl = document.getElementById("status");
const closeButton = document.getElementById("closeButton");

let noteId = null;
let createInFlight = false;
let saveTimer = null;
let saveSeq = 0;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(
    date.getSeconds()
  ).padStart(2, "0")}`;
}

async function ensureNoteExists(text) {
  if (noteId || createInFlight || !text.trim()) {
    return;
  }

  createInFlight = true;
  setStatus("Creating note…");

  try {
    const note = await window.electronAPI.quickNoteCreate(text);
    noteId = note.id;
    setStatus(`Saved ${formatClock(new Date())}`);
  } catch (error) {
    setStatus("Failed to create note", true);
    console.error("[quick-note] create failed", error);
  } finally {
    createInFlight = false;
  }
}

async function flushSave() {
  const text = input.value;
  const mySeq = ++saveSeq;

  if (!text.trim()) {
    setStatus("Ready");
    return;
  }

  await ensureNoteExists(text);
  if (!noteId) {
    return;
  }

  setStatus("Saving…");

  try {
    await window.electronAPI.quickNoteUpdate(noteId, text);
    if (mySeq === saveSeq) {
      setStatus(`Saved ${formatClock(new Date())}`);
    }
  } catch (error) {
    setStatus("Save failed", true);
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

closeButton.addEventListener("click", () => {
  window.electronAPI.closeQuickNote();
});

window.addEventListener("beforeunload", () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
});

input.focus();
