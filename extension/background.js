const RELAY_WS_URL = "wss://co-oden.servepics.com/ws";

const DEFAULT_SETTINGS = {
  wsUrl: RELAY_WS_URL,
  fontSize: 34,
  durationSec: 8,
  laneCount: 8,
  opacity: 0.95,
  maxComments: 40,
  useUserColors: true,
  textColor: "#ffffff",
  outlineColor: "#000000",
  showPill: false,
  pillColor: "#000000",
  pillOpacity: 0.35,
};

const STATE = {
  DISCONNECTED: "DISCONNECTED",
  WAITING: "WAITING",
  LIVE: "LIVE",
};

let settings = { ...DEFAULT_SETTINGS };
let state = STATE.DISCONNECTED;
let currentCode = "";
let ws = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let stableConnectionTimer = null;
let statusMessage = "接続中...";
const pagePorts = new Set();
let activeOverlayComments = [];

loadSettings().then(() => {
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  connect();
});

chrome.runtime.onInstalled.addListener(() => {
  connect();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "overlay-page") {
    return;
  }

  pagePorts.add(port);
  port.postMessage({ type: "lt-overlay:settings", settings });
  port.postMessage({ type: "lt-overlay:status", status: getStatus() });
  port.postMessage({
    type: "lt-overlay:hydrate",
    comments: getActiveOverlayComments(),
  });
  ensureConnected();

  port.onDisconnect.addListener(() => {
    pagePorts.delete(port);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "lt-overlay:getStatus") {
    ensureConnected();
    sendResponse(getStatus());
    return false;
  }

  if (message?.type === "lt-overlay:getSettings") {
    sendResponse(settings);
    return false;
  }

  if (message?.type === "lt-overlay:getHydration") {
    sendResponse({
      settings,
      status: getStatus(),
      comments: getActiveOverlayComments(),
    });
    return false;
  }

  if (message?.type === "lt-overlay:updateSettings") {
    settings = normalizeSettings({ ...settings, ...message.settings });
    chrome.storage.sync.set(settings, () => {
      broadcast({ type: "lt-overlay:settings", settings });
      sendResponse(getStatus());
    });
    return true;
  }

  if (message?.type === "lt-overlay:previewComment") {
    dispatchComment({
      id: `preview_${Date.now()}`,
      user: "preview",
      text: "コメントのプレビューです",
      color: settings.textColor,
      ts: Date.now(),
    });
    sendResponse(getStatus());
    return false;
  }

  if (message?.type === "lt-overlay:clearLocal") {
    activeOverlayComments = [];
    broadcast({ type: "lt-overlay:clear" });
    sendResponse(getStatus());
    return false;
  }

  if (message?.type === "lt-overlay:reconnect") {
    reconnectAttempt = 0;
    connect();
    sendResponse(getStatus());
    return false;
  }

  return false;
});

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      settings = normalizeSettings(stored);
      resolve();
    });
  });
}

function normalizeSettings(input) {
  return {
    wsUrl: RELAY_WS_URL,
    fontSize: clampNumber(input.fontSize, 16, 72, DEFAULT_SETTINGS.fontSize),
    durationSec: clampNumber(input.durationSec, 4, 20, DEFAULT_SETTINGS.durationSec),
    laneCount: Math.round(clampNumber(input.laneCount, 3, 16, DEFAULT_SETTINGS.laneCount)),
    opacity: clampNumber(input.opacity, 0.3, 1, DEFAULT_SETTINGS.opacity),
    maxComments: Math.round(clampNumber(input.maxComments, 10, 120, DEFAULT_SETTINGS.maxComments)),
    useUserColors: Boolean(input.useUserColors),
    textColor: normalizeColor(input.textColor, DEFAULT_SETTINGS.textColor),
    outlineColor: normalizeColor(input.outlineColor, DEFAULT_SETTINGS.outlineColor),
    showPill: Boolean(input.showPill),
    pillColor: normalizeColor(input.pillColor, DEFAULT_SETTINGS.pillColor),
    pillOpacity: clampNumber(input.pillOpacity, 0.1, 0.8, DEFAULT_SETTINGS.pillOpacity),
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function normalizeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function ensureConnected() {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    connect();
  }
}

function connect() {
  clearTimeout(reconnectTimer);
  closeSocket();
  setStatus(STATE.DISCONNECTED, "", "接続中...");

  let socket;
  try {
    socket = new WebSocket(settings.wsUrl);
    ws = socket;
  } catch (_error) {
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    if (ws !== socket) {
      return;
    }

    clearTimeout(stableConnectionTimer);
    stableConnectionTimer = setTimeout(() => {
      if (ws === socket && socket.readyState === WebSocket.OPEN) {
        reconnectAttempt = 0;
      }
    }, 5000);
    send({ type: "hello", client: "overlay", v: 1 });
  });

  socket.addEventListener("message", (event) => {
    if (ws !== socket) {
      return;
    }

    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_error) {
      return;
    }
    handleServerMessage(message);
  });

  socket.addEventListener("close", (event) => {
    clearTimeout(stableConnectionTimer);
    if (ws !== socket) {
      return;
    }

    ws = null;
    setStatus(STATE.DISCONNECTED, "", `切断中: 再接続... (${event.code || "no-code"})`);
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    if (ws !== socket) {
      return;
    }

    setStatus(STATE.DISCONNECTED, "", "接続エラー: 再接続...");
  });
}

function closeSocket() {
  clearTimeout(stableConnectionTimer);
  if (!ws) {
    return;
  }

  const socket = ws;
  ws = null;
  socket.close();
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  const delay = Math.min(10_000, 1000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(connect, delay);
}

function send(payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function handleServerMessage(message) {
  if (message.type === "code") {
    setStatus(STATE.WAITING, String(message.code || ""), "");
    return;
  }

  if (message.type === "paired") {
    setStatus(STATE.LIVE, currentCode, "");
    return;
  }

  if (message.type === "comment") {
    if (state === STATE.LIVE && message.text) {
      dispatchComment(message);
    }
    return;
  }

  if (message.type === "clear") {
    activeOverlayComments = [];
    broadcast({ type: "lt-overlay:clear" });
    return;
  }

  if (message.type === "stopped") {
    activeOverlayComments = [];
    broadcast({ type: "lt-overlay:clear" });
    setStatus(STATE.WAITING, "", "待機中...");
    return;
  }

  if (message.type === "ping") {
    send({ type: "pong" });
  }
}

function setStatus(nextState, code, message) {
  state = nextState;
  currentCode = code;
  statusMessage = message;
  broadcast({ type: "lt-overlay:status", status: getStatus() });
}

function getStatus() {
  return {
    state,
    code: currentCode,
    wsUrl: settings.wsUrl,
    message: statusMessage,
    connectedPages: pagePorts.size,
  };
}

function dispatchComment(comment) {
  const overlayComment = rememberOverlayComment(comment);
  broadcast({ type: "lt-overlay:comment", comment: overlayComment });
}

function rememberOverlayComment(comment) {
  const now = Date.now();
  const overlayComment = {
    ...comment,
    overlayStartedAt: now,
    overlayDurationSec: settings.durationSec,
  };

  pruneOverlayComments(now);
  activeOverlayComments.push(overlayComment);
  if (activeOverlayComments.length > settings.maxComments * 2) {
    activeOverlayComments = activeOverlayComments.slice(-settings.maxComments * 2);
  }
  return overlayComment;
}

function getActiveOverlayComments() {
  const now = Date.now();
  pruneOverlayComments(now);
  return activeOverlayComments.map((comment) => ({ ...comment }));
}

function pruneOverlayComments(now = Date.now()) {
  activeOverlayComments = activeOverlayComments.filter((comment) => {
    const startedAt = Number(comment.overlayStartedAt || comment.ts || now);
    const durationMs = Number(comment.overlayDurationSec || settings.durationSec) * 1000;
    return now - startedAt < durationMs + 2000;
  });
}

function broadcast(message) {
  for (const port of pagePorts) {
    try {
      port.postMessage(message);
    } catch (_error) {
      pagePorts.delete(port);
    }
  }

  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) {
        continue;
      }

      chrome.tabs.sendMessage(tab.id, message, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}
