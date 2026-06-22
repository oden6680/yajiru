(() => {
  const DEFAULT_SETTINGS = {
    enabled: false,
    wsUrl: "ws://localhost:8080/ws",
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

  const STATE = {
    DISCONNECTED: "DISCONNECTED",
    WAITING: "WAITING",
    LIVE: "LIVE"
  };

  let settings = { ...DEFAULT_SETTINGS };
  let state = STATE.DISCONNECTED;
  let currentCode = "";
  let active = true;
  let port = null;
  let portReconnectTimer = null;
  let animationFrame = 0;
  let lastFrameTime = 0;
  const queue = [];
  const activeComments = [];
  const seenCommentIds = new Set();

  document.getElementById("lt-comment-overlay-stage")?.remove();

  const stage = document.createElement("div");
  stage.id = "lt-comment-overlay-stage";
  Object.assign(stage.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    overflow: "hidden",
    pointerEvents: "none",
    background: "transparent"
  });
  stage.hidden = true;

  const badge = document.createElement("div");
  badge.className = "lt-comment-overlay-badge";
  badge.hidden = true;
  stage.appendChild(badge);
  attachStageToVisibleRoot();

  connectToBackground();

  chrome.runtime.onMessage.addListener((message) => {
    handleBackgroundMessage(message);
  });

  document.addEventListener("visibilitychange", () => {
    if (settings.enabled && active && document.visibilityState === "visible") {
      requestHydration();
    }
  });
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

  function connectToBackground() {
    if (!active) {
      return;
    }

    window.clearTimeout(portReconnectTimer);
    try {
      port = chrome.runtime.connect({ name: "overlay-page" });
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        deactivateStaleContext();
        return;
      }
      schedulePortReconnect();
      return;
    }

    port.onMessage.addListener(handleBackgroundMessage);
    port.onDisconnect.addListener(() => {
      if (!active) {
        return;
      }
      port = null;
      if (settings.enabled) {
        showBadge("接続中...");
      }
      schedulePortReconnect();
    });
  }

  function schedulePortReconnect() {
    window.clearTimeout(portReconnectTimer);
    portReconnectTimer = window.setTimeout(connectToBackground, 1000);
  }

  function handleBackgroundMessage(message) {
    try {
      if (!active) {
        return;
      }

      if (message?.type === "lt-overlay:settings") {
        settings = normalizeSettings({ ...settings, ...message.settings });
        applySettings();
        return;
      }

      if (message?.type === "lt-overlay:status") {
        applyStatus(message.status);
        return;
      }

      if (message?.type === "lt-overlay:comment") {
        if (!settings.enabled) {
          return;
        }
        if (message.comment?.text) {
          if (isDuplicateComment(message.comment)) {
            return;
          }
          enqueueComment(message.comment);
        }
        return;
      }

      if (message?.type === "lt-overlay:hydrate") {
        if (!settings.enabled) {
          clearComments();
          return;
        }
        hydrateComments(message.comments || []);
        return;
      }

      if (message?.type === "lt-overlay:clear") {
        clearComments();
      }
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        deactivateStaleContext();
      }
    }
  }

  function requestHydration() {
    if (!settings.enabled || !canUseRuntime()) {
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: "lt-overlay:getHydration" }, (response) => {
        try {
          if (!active) {
            return;
          }

          if (chrome.runtime.lastError || !response) {
            return;
          }

          settings = normalizeSettings({ ...settings, ...response.settings });
          applySettings();
          if (!settings.enabled) {
            return;
          }
          applyStatus(response.status);
          hydrateComments(response.comments || []);
        } catch (error) {
          if (isExtensionContextInvalidated(error)) {
            deactivateStaleContext();
          }
        }
      });
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        deactivateStaleContext();
      }
    }
  }

  function canUseRuntime() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        deactivateStaleContext();
      }
      return false;
    }
  }

  function normalizeSettings(input) {
    return {
      enabled: Boolean(input.enabled),
      wsUrl: String(input.wsUrl || DEFAULT_SETTINGS.wsUrl).trim() || DEFAULT_SETTINGS.wsUrl,
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
      pillOpacity: clampNumber(input.pillOpacity, 0.1, 0.8, DEFAULT_SETTINGS.pillOpacity)
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

  function applySettings() {
    attachStageToVisibleRoot();
    stage.hidden = !settings.enabled;
    if (!settings.enabled) {
      clearComments();
      hideBadge();
      return;
    }

    stage.style.setProperty("--lt-comment-font-size", `${settings.fontSize}px`);
    stage.style.setProperty("--lt-comment-opacity", String(settings.opacity));
    stage.style.setProperty("--lt-comment-outline-color", settings.outlineColor);
  }

  function applyStatus(status) {
    attachStageToVisibleRoot();
    if (!settings.enabled || status?.enabled === false) {
      clearComments();
      hideBadge();
      stage.hidden = true;
      return;
    }

    stage.hidden = false;
    state = status?.state || STATE.DISCONNECTED;
    currentCode = status?.code || "";

    if (state === STATE.WAITING) {
      showBadge(currentCode ? `待機中: ${currentCode}` : "待機中...");
      return;
    }

    if (state === STATE.LIVE) {
      hideBadge();
      return;
    }

    showBadge(status?.message || "接続中...");
  }

  function showBadge(text) {
    attachStageToVisibleRoot();
    badge.textContent = text;
    badge.hidden = false;
  }

  function hideBadge() {
    badge.hidden = true;
  }

  function enqueueComment(comment) {
    attachStageToVisibleRoot();
    if (activeComments.length >= settings.maxComments) {
      queue.push(comment);
      return;
    }

    spawnComment(comment);
    ensureAnimation();
  }

  function hydrateComments(comments) {
    clearComments();
    seenCommentIds.clear();
    for (const comment of comments) {
      if (!comment?.text || isExpiredComment(comment)) {
        continue;
      }
      if (!isDuplicateComment(comment)) {
        spawnComment(comment, { restorePosition: true });
      }
    }
    ensureAnimation();
  }

  function isExpiredComment(comment) {
    const startedAt = Number(comment.overlayStartedAt || comment.ts || Date.now());
    const durationSec = Number(comment.overlayDurationSec || settings.durationSec);
    return Date.now() - startedAt >= durationSec * 1000 + 1200;
  }

  function isDuplicateComment(comment) {
    const id = comment.id ? String(comment.id) : "";
    if (!id) {
      return false;
    }

    if (seenCommentIds.has(id)) {
      return true;
    }

    seenCommentIds.add(id);
    window.setTimeout(() => {
      seenCommentIds.delete(id);
    }, 30_000);
    return false;
  }

  function spawnComment(comment, { restorePosition = false } = {}) {
    attachStageToVisibleRoot();
    const stageRect = stage.getBoundingClientRect();
    const stageWidth = stageRect.width || window.innerWidth;
    const stageHeight = stageRect.height || window.innerHeight;
    if (!stageWidth || !stageHeight) {
      return;
    }

    const element = document.createElement("div");
    element.className = "lt-comment-overlay-comment";
    element.textContent = String(comment.text || "");
    Object.assign(element.style, {
      position: "absolute",
      left: "0",
      top: "0",
      display: "inline-block",
      whiteSpace: "nowrap",
      fontSize: `${settings.fontSize}px`,
      fontWeight: "800",
      lineHeight: "1.25",
      opacity: String(settings.opacity),
      willChange: "transform, opacity"
    });
    const commentColor = settings.useUserColors
      ? comment.color || settings.textColor
      : settings.textColor;
    element.style.color = commentColor;
    element.style.textShadow = [
      `2px 2px 0 ${settings.outlineColor}`,
      `-2px 2px 0 ${settings.outlineColor}`,
      `2px -2px 0 ${settings.outlineColor}`,
      `-2px -2px 0 ${settings.outlineColor}`,
      `0 2px 0 ${settings.outlineColor}`,
      `2px 0 0 ${settings.outlineColor}`,
      `0 -2px 0 ${settings.outlineColor}`,
      `-2px 0 0 ${settings.outlineColor}`,
      "0 3px 8px rgb(0 0 0 / 70%)"
    ].join(", ");
    element.style.setProperty("--lt-comment-color", commentColor);
    element.style.setProperty("--lt-comment-pill-color", hexToRgb(settings.pillColor));
    element.style.setProperty("--lt-comment-pill-opacity", String(settings.pillOpacity));
    if (settings.showPill) {
      element.classList.add("lt-comment-overlay-comment-pill");
      element.style.borderRadius = "8px";
      element.style.padding = "2px 10px 4px";
      element.style.background = `rgb(${hexToRgb(settings.pillColor)} / ${settings.pillOpacity})`;
    }
    stage.appendChild(element);

    const width = element.getBoundingClientRect().width;
    const lane = pickLane();
    const laneHeight = stageHeight / settings.laneCount;
    const top = lane * laneHeight + Math.max(0, (laneHeight - settings.fontSize * 1.25) / 2);
    const minStart = stageWidth;
    const rightEdge = laneRightEdge(lane);
    const durationSec = Number(comment.overlayDurationSec || settings.durationSec);
    const speed = (stageWidth + width) / durationSec;
    const elapsedSec = restorePosition
      ? Math.max(0, (Date.now() - Number(comment.overlayStartedAt || Date.now())) / 1000)
      : 0;
    const restoredX = minStart - speed * elapsedSec;
    const startX = restorePosition
      ? restoredX
      : Math.max(minStart, rightEdge + 48);

    if (startX + width < 0) {
      element.remove();
      return;
    }

    element.style.top = `${top}px`;
    element.style.transform = `translate3d(${startX}px, 0, 0)`;

    activeComments.push({
      element,
      lane,
      x: startX,
      width,
      speed
    });
  }

  function pickLane() {
    let selectedLane = 0;
    let smallestRightEdge = Infinity;

    for (let lane = 0; lane < settings.laneCount; lane += 1) {
      const rightEdge = laneRightEdge(lane);
      if (rightEdge < smallestRightEdge) {
        smallestRightEdge = rightEdge;
        selectedLane = lane;
      }
    }

    return selectedLane;
  }

  function laneRightEdge(lane) {
    let rightEdge = -Infinity;
    for (const comment of activeComments) {
      if (comment.lane === lane) {
        rightEdge = Math.max(rightEdge, comment.x + comment.width);
      }
    }
    return rightEdge;
  }

  function ensureAnimation() {
    if (!animationFrame) {
      lastFrameTime = performance.now();
      animationFrame = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    const deltaSec = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    for (let index = activeComments.length - 1; index >= 0; index -= 1) {
      const comment = activeComments[index];
      comment.x -= comment.speed * deltaSec;
      if (comment.x + comment.width < 0) {
        comment.element.remove();
        activeComments.splice(index, 1);
      } else {
        comment.element.style.transform = `translate3d(${comment.x}px, 0, 0)`;
      }
    }

    while (queue.length && activeComments.length < settings.maxComments) {
      spawnComment(queue.shift());
    }

    if (activeComments.length || queue.length) {
      animationFrame = requestAnimationFrame(tick);
    } else {
      animationFrame = 0;
    }
  }

  function clearComments() {
    queue.length = 0;
    seenCommentIds.clear();
    for (const comment of activeComments) {
      comment.element.remove();
    }
    activeComments.length = 0;
  }

  function hexToRgb(color) {
    const hex = normalizeColor(color, "#000000").slice(1);
    const value = Number.parseInt(hex, 16);
    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
  }

  function handleFullscreenChange() {
    attachStageToVisibleRoot();
    if (settings.enabled) {
      requestHydration();
    }
  }

  function attachStageToVisibleRoot() {
    const root = fullscreenElement() || document.documentElement;
    if (stage.parentElement !== root) {
      root.appendChild(stage);
    }
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function shutdown() {
    active = false;
    window.clearTimeout(portReconnectTimer);
    clearComments();
    stage.remove();
    port?.disconnect();
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
  }

  function deactivateStaleContext() {
    active = false;
    window.clearTimeout(portReconnectTimer);
    clearComments();
    stage.remove();
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    try {
      port?.disconnect();
    } catch (_error) {
      // The extension context is already gone.
    }
  }

  function isExtensionContextInvalidated(error) {
    return String(error?.message || error).includes("Extension context invalidated");
  }

  applySettings();
})();
