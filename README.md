# Comment Overlay

Discord のコメントを Web ページ上に横スクロール表示する Chrome 拡張機能と、Discord Bot / WebSocket 中継サーバーです。

LT、勉強会、発表会などで、参加者が Discord チャンネルに投稿したコメントを発表者のブラウザ画面に重ねて表示できます。Chrome拡張機能が制限されていないいサイトであれば、通常の `http/https` ページで動作します。

## Features

- Discord の任意サーバー、任意チャンネルと画面を合言葉でペアリング
- Chrome 拡張機能で Web ページ上にコメントをオーバーレイ表示
- 文字サイズ、速度、レーン数、色、縁取り、背景、不透明度を調整
- タブをまたいだ表示状態の引き継ぎ
- Discord なしで確認できるテストコメント表示
- セルフホスト可能な Node.js 中継サーバー

## Repository

```text
extension/   Chrome Extension Manifest V3
server/      Discord Bot and WebSocket relay
docs/        Installation and operation guides
```

## For User

Chrome Web Store で拡張機能が公開されるまでは、ZIP ファイルを受け取り、開発者モードで拡張機能を読み込んで使います。

詳しい手順は [docs/INSTALL_FROM_ZIP.md](./docs/INSTALL_FROM_ZIP.md) を見てください。

基本的な使い方:

1. Chrome でオーバーレイを出したい Web ページを開く。
2. Comment Overlay のポップアップを開く。
3. 画面右下、またはポップアップに表示される合言葉を確認する。
4. Discord の対象チャンネルで `/lt start <合言葉>` を実行する。
5. 以後、そのチャンネルへの投稿が画面上に流れる。

停止するときは Discord で `/lt stop`、画面上のコメントだけ消すときは `/lt clear` を使います。

## Extension Development

```bash
cd extension
```

Chrome で `chrome://extensions` を開き、デベロッパーモードを有効にして、`extension/` を「パッケージ化されていない拡張機能」として読み込んでください。

このリポジトリ版の接続先は [extension/background.js](./extension/background.js) の `RELAY_WS_URL` で固定されています。自分の中継サーバーを使う場合は、この値を `wss://your-domain.example/ws` に変更してから読み込むか、ZIP を作成してください。

ZIP を作る場合:

```bash
bash scripts/package-extension.sh
```

生成される `comment-overlay.zip` は GitHub Releases などに添付して配布します。リポジトリにはコミットしません。

## Server Development

```bash
cd server
npm install
cp .env.example .env
```

`.env` に Discord Bot の情報を設定します。

```dotenv
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
ALLOWED_CHANNEL_IDS=
PORT=8080
CODE_LENGTH=4
```

任意サーバーで使う場合、`DISCORD_GUILD_ID` は空のままにします。開発中に特定サーバーだけへ即時登録したい場合のみ設定してください。

スラッシュコマンドを登録します。

```bash
npm run register
```

サーバーを起動します。

```bash
npm start
```

ローカル確認時の WebSocket URL は `ws://localhost:8080/ws` です。

本番公開や Bot 招待の詳しい手順は [docs/SELF_HOSTING.md](./docs/SELF_HOSTING.md) を見てください。

## Discord Commands

Bot が招待され、`applications.commands` スコープが有効な Discord サーバーで使えます。

- `/lt start code`: 現在のチャンネルと画面を結びつける
- `/lt stop`: 結びつけを解除する
- `/lt clear`: 表示中コメントを消す
- `/lt status`: 現在の結びつけ状態を見る

`ALLOWED_CHANNEL_IDS` を設定した場合だけ、利用可能チャンネルが制限されます。空の場合は Bot が参加している任意チャンネルで利用できます。

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

個人利用、学習目的、非営利目的での利用・複製・改変・共有が可能です。商用利用には別途許可が必要です。

## Privacy And Security

- 実トークンや `.env` はコミットしないでください。
- Chrome Web Store 用のスクリーンショットなど、個人情報が写りやすい提出用素材は `store-assets/` に置き、コミット対象から外しています。
- このアプリのデータの扱いは [PRIVACY.md](./PRIVACY.md) を確認してください。
- 公開前の確認観点は [SECURITY.md](./SECURITY.md) を確認してください。

## Checks

```bash
cd server
npm run check
```

Chrome 拡張機能は、`chrome://extensions` の「エラー」画面と、任意ページでの「テスト」ボタン表示で確認してください。
