const DEFAULT_SETTINGS = {
  enabled: false,
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
  pillOpacity: 0.35
};

const SWATCH_COLORS = [
  "#ffffff",
  "#ffd54a",
  "#80deea",
  "#a5d6a7",
  "#ffab91",
  "#ce93d8",
  "#f48fb1",
  "#000000"
];

const form = document.getElementById("settingsForm");
const statusText = document.getElementById("statusText");
const saveStatus = document.getElementById("saveStatus");
const copyCommandButton = document.getElementById("copyCommandButton");
const reconnectButton = document.getElementById("reconnectButton");
const previewButton = document.getElementById("previewButton");
const clearButton = document.getElementById("clearButton");
const previewText = document.getElementById("previewText");

let currentCommand = "";

function sendToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

function fillForm(settings) {
  const values = { ...DEFAULT_SETTINGS, ...settings };
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements.namedItem(key);
    if (!field) {
      continue;
    }

    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value;
    }
  }
  updatePreview();
}

function readForm() {
  return {
    enabled: form.enabled.checked,
    fontSize: Number(form.fontSize.value),
    durationSec: Number(form.durationSec.value),
    laneCount: Number(form.laneCount.value),
    opacity: Number(form.opacity.value),
    maxComments: Number(form.maxComments.value),
    useUserColors: form.useUserColors.checked,
    textColor: form.textColor.value,
    outlineColor: form.outlineColor.value,
    showPill: form.showPill.checked,
    pillColor: form.pillColor.value,
    pillOpacity: Number(form.pillOpacity.value)
  };
}

function showSaveStatus(text) {
  saveStatus.textContent = text;
  saveStatus.classList.toggle("error", text.includes("失敗"));
  saveStatus.classList.add("visible");
  window.clearTimeout(showSaveStatus.timer);
  showSaveStatus.timer = window.setTimeout(() => {
    saveStatus.classList.remove("visible");
    saveStatus.classList.remove("error");
  }, 1800);
}

function renderStatus(status) {
  currentCommand = status?.enabled && status?.code ? `/lt start ${status.code}` : "";
  updateControls(status);

  if (!status) {
    statusText.textContent = "状態を取得できません。拡張機能を再読み込みしてください。";
    return;
  }

  if (status.enabled === false) {
    statusText.textContent = `接続OFF / 表示ページ ${status.connectedPages || 0}`;
    return;
  }

  if (status.state === "WAITING") {
    statusText.textContent = status.code
      ? `待機中: ${status.code} / 表示ページ ${status.connectedPages}`
      : `待機中 / 表示ページ ${status.connectedPages}`;
    return;
  }

  if (status.state === "LIVE") {
    statusText.textContent = `配信中 / 表示ページ ${status.connectedPages}`;
    return;
  }

  statusText.textContent = status.message || "未接続";
}

function updatePreview() {
  const settings = readForm();
  previewText.style.color = settings.useUserColors ? "#ffd54a" : settings.textColor;
  previewText.style.fontSize = `${Math.max(16, Math.min(36, settings.fontSize * 0.62))}px`;
  previewText.style.opacity = String(settings.opacity);
  previewText.style.setProperty("--preview-outline-color", settings.outlineColor);
  previewText.classList.toggle("preview-pill", settings.showPill);
  previewText.style.backgroundColor = settings.showPill
    ? hexToRgba(settings.pillColor, settings.pillOpacity)
    : "transparent";
}

function updateControls(status) {
  const enabled = Boolean(status?.enabled ?? form.enabled?.checked);
  copyCommandButton.disabled = !currentCommand;
  previewButton.disabled = !enabled;
  clearButton.disabled = !enabled;
  reconnectButton.disabled = !enabled;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_error) {
      // Fall back to a temporary textarea below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function hexToRgba(color, alpha) {
  const hex = color.replace("#", "");
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgb(${red} ${green} ${blue} / ${alpha})`;
}

function setupSwatches() {
  for (const container of document.querySelectorAll(".swatches")) {
    const target = container.dataset.target;
    for (const color of SWATCH_COLORS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.style.backgroundColor = color;
      button.setAttribute("aria-label", color);
      button.addEventListener("click", () => {
        form.elements.namedItem(target).value = color;
        updatePreview();
      });
      container.appendChild(button);
    }
  }
}

async function refresh() {
  try {
    const [settings, status] = await Promise.all([
      sendToBackground({ type: "lt-overlay:getSettings" }),
      sendToBackground({ type: "lt-overlay:getStatus" })
    ]);
    fillForm(settings);
    renderStatus(status);
  } catch (_error) {
    fillForm(DEFAULT_SETTINGS);
    renderStatus(undefined);
  }
}

form.addEventListener("input", updatePreview);

copyCommandButton.addEventListener("click", async () => {
  if (!currentCommand) {
    return;
  }

  try {
    await copyText(currentCommand);
    showSaveStatus("コピー済み");
  } catch (_error) {
    showSaveStatus("コピー失敗");
  }
});

form.enabled.addEventListener("change", async () => {
  try {
    const status = await sendToBackground({
      type: "lt-overlay:updateSettings",
      settings: readForm()
    });
    renderStatus(status);
    showSaveStatus(form.enabled.checked ? "ON" : "OFF");
  } catch (_error) {
    renderStatus(undefined);
    showSaveStatus("保存失敗");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const status = await sendToBackground({
      type: "lt-overlay:updateSettings",
      settings: readForm()
    });
    renderStatus(status);
    showSaveStatus("保存しました");
  } catch (_error) {
    renderStatus(undefined);
    showSaveStatus("保存失敗");
  }
});

previewButton.addEventListener("click", async () => {
  try {
    await sendToBackground({
      type: "lt-overlay:updateSettings",
      settings: readForm()
    });
    renderStatus(await sendToBackground({ type: "lt-overlay:previewComment" }));
  } catch (_error) {
    renderStatus(undefined);
  }
});

clearButton.addEventListener("click", async () => {
  try {
    renderStatus(await sendToBackground({ type: "lt-overlay:clearLocal" }));
  } catch (_error) {
    renderStatus(undefined);
  }
});

reconnectButton.addEventListener("click", async () => {
  try {
    renderStatus(await sendToBackground({ type: "lt-overlay:reconnect" }));
  } catch (_error) {
    renderStatus(undefined);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "lt-overlay:status") {
    renderStatus(message.status);
  }
});

setupSwatches();
refresh();
