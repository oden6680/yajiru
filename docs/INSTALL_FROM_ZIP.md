# ZIP からインストールする

Chrome Web Store ではなく ZIP で配布された Comment Overlay を使う手順です。

## インストール

1. 配布された `comment-overlay.zip` をダウンロードする。
2. ZIP を展開する。
3. Chrome で `chrome://extensions` を開く。
4. 右上の「デベロッパーモード」を有効にする。
5. 「パッケージ化されていない拡張機能を読み込む」を押す。
6. 展開したフォルダを選ぶ。

`manifest.json` が入っているフォルダを選んでください。フォルダのさらに上の階層を選ぶと読み込みに失敗します。

## 使い方

1. オーバーレイを表示したい Web ページを開く。
2. Chrome ツールバーの Comment Overlay アイコンを開く。
3. 必要なら文字サイズ、速度、色などを調整する。
4. `接続` を ON にする。
5. 「テスト」を押してコメントが流れるか確認する。
6. ページ右下、またはポップアップに表示される合言葉を確認する。
7. Discord の対象チャンネルで `/lt start <合言葉>` を実行する。

例:

```text
/lt start ABCD
```

コメント表示を止める場合:

```text
/lt stop
```

表示中のコメントを消す場合:

```text
/lt clear
```

## 更新

新しい ZIP を受け取ったら、古いフォルダを新しい内容で置き換えてから、`chrome://extensions` で Comment Overlay の「再読み込み」を押してください。

## 表示できないページ

Chrome の制限により、以下のようなページにはオーバーレイを表示できません。

- `chrome://` で始まるページ
- Chrome Web Store
- 拡張機能の管理画面
- ブラウザが content script の注入を禁止しているページ

通常の Web ページや Google Slides では利用できます。
