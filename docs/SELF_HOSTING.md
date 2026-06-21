# Self Hosting Guide

自分の Discord Bot と中継サーバーで Comment Overlay を運用する手順です。

## Requirements

- Node.js 20 以上
- HTTPS を終端できる公開サーバー
- Discord Developer Portal で作成した Application / Bot
- Chrome 拡張機能を読み込める環境

## Discord Bot

Discord Developer Portal で Application を作成し、Bot を追加します。

Bot の設定で必要なもの:

- Bot Token
- Application ID / Client ID
- Message Content Intent を有効化

招待 URL では、Scopes に以下を含めます。

- `bot`
- `applications.commands`

Bot Permissions は最低限、以下があれば動作します。

- View Channels
- Send Messages
- Read Message History

## Environment

```bash
cd server
npm install
cp .env.example .env
```

`.env` を編集します。

```dotenv
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=
ALLOWED_CHANNEL_IDS=
PORT=8080
CODE_LENGTH=4
```

設定の意味:

- `DISCORD_TOKEN`: Discord Bot Token
- `DISCORD_CLIENT_ID`: Discord Application ID
- `DISCORD_GUILD_ID`: 開発時だけ指定。空ならグローバルコマンド登録
- `ALLOWED_CHANNEL_IDS`: カンマ区切りの許可チャンネルID。空なら制限なし
- `PORT`: 中継サーバーの待ち受けポート
- `CODE_LENGTH`: ペアリング用合言葉の桁数

## Register Commands

```bash
npm run register
```

`DISCORD_GUILD_ID` が空の場合はグローバルコマンドとして登録されます。Discord 側に反映されるまで時間がかかることがあります。すぐ試したい場合は、一時的に対象サーバーの Guild ID を入れて登録してください。

## Run Server

```bash
npm start
```

常駐させる場合は pm2 などを使います。

```bash
npm install -g pm2
pm2 start server.js --name comment-overlay
pm2 save
```

## Reverse Proxy

Chrome 拡張機能から接続する場合、本番では `wss://` が必要です。Caddy などで HTTPS / WebSocket を中継してください。

Caddyfile の例:

```caddyfile
your-domain.example {
    reverse_proxy localhost:8080
}
```

確認:

```bash
curl -I https://your-domain.example/healthz
```

`HTTP/2 200` などが返れば中継サーバーまで届いています。

## Build Extension For Your Server

[extension/background.js](../extension/background.js) の `RELAY_WS_URL` を変更します。

```js
const RELAY_WS_URL = "wss://your-domain.example/ws";
```

その後、ZIP を作成します。

```bash
bash scripts/package-extension.sh
```

生成された `comment-overlay.zip` を配布します。

## Operational Notes

- `.env` は絶対に公開しないでください。
- Bot Token が漏れた可能性がある場合は、Discord Developer Portal で再生成してください。
- 発表中のコメントは中継サーバーを通過します。機密情報を投稿するチャンネルでは使わないでください。
- サーバー再起動時は既存の画面ペアリングが切れるため、再度 `/lt start <code>` を実行してください。
