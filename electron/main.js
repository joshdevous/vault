const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require("electron");
const path = require("path");
const { readFile, writeFile } = require("fs/promises");

// Set NODE_ENV early to prevent TypeScript installation attempts
const isDev = !app.isPackaged;
if (!isDev) {
  process.env.NODE_ENV = "production";
  process.env.MOTHERSHIP_DATA_DIR = path.join(app.getPath("appData"), "Mothership");
  // Prevent Next.js from trying to compile TypeScript config
  process.env.NEXT_PRIVATE_STANDALONE = "1";
  // Disable telemetry
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  // Skip type checking
  process.env.NEXT_DISABLE_SWC_WASM = "1";
}

// Hide console window on Windows in production
if (!isDev && process.platform === "win32") {
  // This prevents child processes from showing console windows
  require("child_process").spawn = ((originalSpawn) => {
    return function spawn(command, args, options) {
      options = options || {};
      options.windowsHide = true;
      return originalSpawn.call(this, command, args, options);
    };
  })(require("child_process").spawn);
}

let mainWindow;
let quickNoteWindow;
let server;
let quickNoteBoundsSaveTimeout;

const PORT = isDev ? 3000 : 51333;

function getQuickNoteBoundsFilePath() {
  return path.join(app.getPath("userData"), "quick-note-window.json");
}

async function loadQuickNoteBounds() {
  try {
    const raw = await readFile(getQuickNoteBoundsFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }

    return {
      width: Math.max(320, Math.round(parsed.width)),
      height: Math.max(260, Math.round(parsed.height)),
      ...(typeof parsed.x === "number" ? { x: Math.round(parsed.x) } : {}),
      ...(typeof parsed.y === "number" ? { y: Math.round(parsed.y) } : {}),
    };
  } catch {
    return null;
  }
}

async function saveQuickNoteBounds(bounds) {
  try {
    await writeFile(getQuickNoteBoundsFilePath(), JSON.stringify(bounds), "utf8");
  } catch (error) {
    console.error("Failed to save quick note bounds:", error);
  }
}

function scheduleSaveQuickNoteBounds() {
  if (!quickNoteWindow || quickNoteWindow.isDestroyed()) {
    return;
  }

  if (quickNoteBoundsSaveTimeout) {
    clearTimeout(quickNoteBoundsSaveTimeout);
  }

  quickNoteBoundsSaveTimeout = setTimeout(() => {
    if (!quickNoteWindow || quickNoteWindow.isDestroyed()) {
      return;
    }
    const bounds = quickNoteWindow.getBounds();
    void saveQuickNoteBounds(bounds);
  }, 200);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInlineMarkdown(value) {
  let result = escapeHtml(value);
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

function toNoteHtml(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const blocks = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      blocks.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      blocks.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) {
        blocks.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        blocks.push("<ul>");
        inUl = true;
      }
      blocks.push(`<li><p>${renderInlineMarkdown(ulMatch[1])}</p></li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) {
        blocks.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        blocks.push("<ol>");
        inOl = true;
      }
      blocks.push(`<li><p>${renderInlineMarkdown(olMatch[1])}</p></li>`);
      continue;
    }

    closeLists();
    blocks.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  closeLists();

  return blocks.join("") || "<p><br></p>";
}

function toNoteTitle(text) {
  const firstLine = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "";
  }

  const cleaned = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();

  return (cleaned || firstLine).slice(0, 120);
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(`http://localhost:${PORT}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${body || response.statusText}`);
  }

  return response.json();
}

async function createQuickNoteWindow() {
  if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
    if (quickNoteWindow.isMinimized()) {
      quickNoteWindow.restore();
    }
    quickNoteWindow.show();
    quickNoteWindow.focus();
    return;
  }

  const savedBounds = await loadQuickNoteBounds();

  quickNoteWindow = new BrowserWindow({
    width: savedBounds?.width ?? 380,
    height: savedBounds?.height ?? 420,
    ...(savedBounds?.x !== undefined ? { x: savedBounds.x } : {}),
    ...(savedBounds?.y !== undefined ? { y: savedBounds.y } : {}),
    minWidth: 320,
    minHeight: 260,
    backgroundColor: "#202020",
    title: "Mothership Quick Note",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  quickNoteWindow.loadFile(path.join(__dirname, "quick-note.html"));

  quickNoteWindow.on("move", scheduleSaveQuickNoteBounds);
  quickNoteWindow.on("resize", scheduleSaveQuickNoteBounds);

  quickNoteWindow.on("closed", () => {
    if (quickNoteBoundsSaveTimeout) {
      clearTimeout(quickNoteBoundsSaveTimeout);
      quickNoteBoundsSaveTimeout = null;
    }

    const lastBounds = quickNoteWindow?.getBounds();
    if (lastBounds) {
      void saveQuickNoteBounds(lastBounds);
    }

    quickNoteWindow = null;
  });
}

ipcMain.handle("quick-note-create", async (_event, payload) => {
  const text = typeof payload?.text === "string" ? payload.text : "";

  if (!text.trim()) {
    throw new Error("Cannot create empty quick note");
  }

  const created = await apiRequest("/api/notes", {
    method: "POST",
    body: JSON.stringify({ parentId: null }),
  });

  const noteId = created.id;
  const updated = await apiRequest(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: toNoteTitle(text),
      content: toNoteHtml(text),
    }),
  });

  return updated;
});

ipcMain.handle("quick-note-update", async (_event, payload) => {
  const noteId = typeof payload?.noteId === "string" ? payload.noteId : "";
  const text = typeof payload?.text === "string" ? payload.text : "";

  if (!noteId) {
    throw new Error("Missing note id");
  }

  return apiRequest(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: toNoteTitle(text),
      content: toNoteHtml(text),
    }),
  });
});

ipcMain.on("quick-note-close", () => {
  quickNoteWindow?.close();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#191919",
    titleBarStyle: "hiddenInset",
    frame: false,
    show: false, // Don't show until content is loaded
    icon: path.join(__dirname, "../public/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Show window when ready to avoid flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Handle window control IPC events
  ipcMain.on("window-minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    mainWindow?.close();
  });

  // Handle folder selection dialog
  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Folder to Clean",
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths[0];
  });

  // Load the app
  const url = `http://localhost:${PORT}`;
  
  // Wait for Next.js server to be ready
  const checkServer = () => {
    fetch(url)
      .then(() => {
        mainWindow.loadURL(url);
      })
      .catch(() => {
        setTimeout(checkServer, 500);
      });
  };

  checkServer();

  // Open external links in the default browser, not in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only open http/https URLs in external browser
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Also handle link clicks that try to navigate the window
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Allow navigation to our app's localhost URL
    if (url.startsWith(`http://localhost:${PORT}`)) {
      return;
    }
    // External URLs should open in browser
    if (url.startsWith("http://") || url.startsWith("https://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Only open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startNextServer() {
  if (isDev) {
    // In dev mode, assume Next.js dev server is already running externally
    console.log("Development mode - expecting external Next.js server");
    return;
  }

  // In production, start the embedded server
  console.log("Starting production Next.js server...");
  process.env.PORT = PORT.toString();
  
  const { startServer } = require("./server.js");
  server = await startServer();
}

app.whenReady().then(async () => {
  await startNextServer();
  createWindow();

  const registered = globalShortcut.register("CommandOrControl+Q", () => {
    void createQuickNoteWindow();
  });

  if (!registered) {
    console.error("Failed to register global shortcut: CommandOrControl+Q");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (server) {
    server.close();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (server) {
    server.close();
  }
});
