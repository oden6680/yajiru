require("dotenv").config();

const http = require("http");
const {
  Client,
  GatewayIntentBits,
  Events
} = require("discord.js");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const CODE_LENGTH = Number.parseInt(process.env.CODE_LENGTH || "4", 10);
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_COMMENT_LENGTH = 60;
const PING_INTERVAL_MS = 30_000;
const PALETTE = [
  "#FFFFFF",
  "#FFD54A",
  "#80DEEA",
  "#A5D6A7",
  "#FFAB91",
  "#CE93D8",
  "#F48FB1",
  "#B0BEC5"
];

const pendingCodes = new Map();
const bindings = new Map();
const socketMeta = new Map();
const allowedChannelIds = new Set(
  (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function generateCode() {
  const activeCodes = new Set(
    Array.from(socketMeta.values(), (meta) => meta.code).filter(Boolean)
  );
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    let code = "";
    for (let index = 0; index < CODE_LENGTH; index += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!activeCodes.has(code)) {
      return code;
    }
  }
  throw new Error("Could not generate a unique pairing code");
}

function issuePendingCode(ws) {
  const meta = socketMeta.get(ws);
  if (!meta || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  if (meta.code) {
    pendingCodes.delete(meta.code);
  }

  const code = generateCode();
  meta.code = code;
  meta.channelId = undefined;
  meta.isAlive = true;
  pendingCodes.set(code, ws);
  sendJson(ws, { type: "code", code });
}

function cleanupSocket(ws) {
  const meta = socketMeta.get(ws);
  if (!meta) {
    return;
  }

  pendingCodes.delete(meta.code);
  if (meta.channelId && bindings.get(meta.channelId) === ws) {
    bindings.delete(meta.channelId);
  }

  for (const [channelId, boundSocket] of bindings.entries()) {
    if (boundSocket === ws) {
      bindings.delete(channelId);
    }
  }

  socketMeta.delete(ws);
}

function stopSocket(ws, { reissueCode = true } = {}) {
  const meta = socketMeta.get(ws);
  if (!meta) {
    return false;
  }

  if (meta.channelId && bindings.get(meta.channelId) === ws) {
    bindings.delete(meta.channelId);
  }

  pendingCodes.delete(meta.code);
  meta.channelId = undefined;
  sendJson(ws, { type: "stopped" });

  if (reissueCode) {
    issuePendingCode(ws);
  }

  return true;
}

function isChannelAllowed(channelId) {
  return allowedChannelIds.size === 0 || allowedChannelIds.has(channelId);
}

function findSocketByCode(code) {
  for (const [ws, meta] of socketMeta.entries()) {
    if (meta.code === code) {
      return ws;
    }
  }
  return undefined;
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function truncateText(text) {
  if (text.length <= MAX_COMMENT_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_COMMENT_LENGTH - 1)}…`;
}

function cleanMessageContent(message) {
  const raw = message.cleanContent || message.content || "";
  return truncateText(
    raw
      .replace(/\r?\n/g, " ")
      .replace(/https?:\/\/\S+/gi, "[リンク]")
      .replace(/<@!?\d+>/g, "")
      .replace(/<@&\d+>/g, "")
      .replace(/<#\d+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function buildCommentPayload(message, text) {
  const displayName =
    message.member?.displayName ||
    message.author.globalName ||
    message.author.username;
  const color = PALETTE[hashString(message.author.id) % PALETTE.length];

  return {
    type: "comment",
    id: message.id,
    user: displayName,
    text,
    color,
    ts: Date.now()
  };
}

async function replyEphemeral(interaction, content) {
  const payload = { content, ephemeral: true };
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

async function handleStart(interaction) {
  const channelId = interaction.channelId;
  if (!isChannelAllowed(channelId)) {
    await replyEphemeral(interaction, "このチャンネルでは LT コメントオーバーレイを開始できません。");
    return;
  }

  const code = normalizeCode(interaction.options.getString("code", true));
  const ws = pendingCodes.get(code);
  const knownSocket = findSocketByCode(code);
  const knownMeta = knownSocket ? socketMeta.get(knownSocket) : undefined;

  if (!ws) {
    if (knownMeta?.channelId) {
      await replyEphemeral(interaction, "その合言葉の画面はすでに別のチャンネルと結びついています。");
      return;
    }
    await replyEphemeral(interaction, "その合言葉の画面が見つかりません。画面に表示されているコードを確認してください。");
    return;
  }

  const oldSocket = bindings.get(channelId);
  if (oldSocket && oldSocket !== ws) {
    stopSocket(oldSocket);
  }

  pendingCodes.delete(code);
  const meta = socketMeta.get(ws);
  meta.channelId = channelId;
  bindings.set(channelId, ws);
  sendJson(ws, { type: "paired", channelId });

  await replyEphemeral(interaction, `このチャンネルと画面 ${code} を結びつけました。`);
}

async function handleStop(interaction) {
  const ws = bindings.get(interaction.channelId);
  if (!ws) {
    await replyEphemeral(interaction, "このチャンネルには結びついた画面がありません。");
    return;
  }

  stopSocket(ws);
  await replyEphemeral(interaction, "LT コメントオーバーレイを停止しました。");
}

async function handleClear(interaction) {
  const ws = bindings.get(interaction.channelId);
  if (!ws) {
    await replyEphemeral(interaction, "このチャンネルには結びついた画面がありません。");
    return;
  }

  sendJson(ws, { type: "clear" });
  await replyEphemeral(interaction, "表示中のコメントを消去しました。");
}

async function handleStatus(interaction) {
  const ws = bindings.get(interaction.channelId);
  if (!ws) {
    await replyEphemeral(interaction, "状態: 未接続");
    return;
  }

  const meta = socketMeta.get(ws);
  await replyEphemeral(interaction, `状態: 接続中 / 画面コード ${meta?.code || "不明"}`);
}

function startHttpAndWebSocketServer() {
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("ok\n");
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found\n");
  });

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    socketMeta.set(ws, { code: undefined, channelId: undefined, isAlive: true });
    issuePendingCode(ws);

    ws.on("pong", () => {
      const meta = socketMeta.get(ws);
      if (meta) {
        meta.isAlive = true;
      }
    });

    ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (_error) {
        return;
      }

      if (message.type === "pong" || message.type === "hello") {
        const meta = socketMeta.get(ws);
        if (meta) {
          meta.isAlive = true;
        }
      }
    });

    ws.on("close", () => cleanupSocket(ws));
    ws.on("error", () => cleanupSocket(ws));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const meta = socketMeta.get(ws);
      if (!meta) {
        continue;
      }

      if (!meta.isAlive) {
        cleanupSocket(ws);
        ws.terminate();
        continue;
      }

      meta.isAlive = false;
      sendJson(ws, { type: "ping" });
      ws.ping();
    }
  }, PING_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  server.listen(PORT, () => {
    console.log(`WebSocket relay listening on ws://localhost:${PORT}/ws`);
  });
}

function startDiscordBot() {
  requireEnv("DISCORD_TOKEN");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord Bot logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "lt") {
      return;
    }

    try {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "start") {
        await handleStart(interaction);
      } else if (subcommand === "stop") {
        await handleStop(interaction);
      } else if (subcommand === "clear") {
        await handleClear(interaction);
      } else if (subcommand === "status") {
        await handleStatus(interaction);
      }
    } catch (error) {
      console.error("Failed to handle interaction", error);
      await replyEphemeral(interaction, "コマンド処理中にエラーが発生しました。");
    }
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || !message.channelId) {
      return;
    }

    if (message.content.trim().startsWith("/")) {
      return;
    }

    const ws = bindings.get(message.channelId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const text = cleanMessageContent(message);
    if (!text) {
      return;
    }

    sendJson(ws, buildCommentPayload(message, text));
  });

  client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error("Failed to login to Discord", error);
    process.exit(1);
  });
}

try {
  startHttpAndWebSocketServer();
  startDiscordBot();
} catch (error) {
  console.error(error);
  process.exit(1);
}
