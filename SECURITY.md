# Security Notes

公開前、または配布前に以下を確認してください。

## Do Not Commit Secrets

コミットしてはいけないもの:

- `server/.env`
- Discord Bot Token
- Discord Client Secret
- SSH 秘密鍵
- Chrome Web Store 用の秘密鍵や `.pem`
- 個人情報が写ったスクリーンショット

`.gitignore` では `.env`、ZIP、CRX、PEM、`store-assets/` を除外しています。

## If A Token Leaks

Discord Bot Token が漏れた可能性がある場合は、Discord Developer Portal で Bot Token を再生成してください。その後、サーバー側の `.env` を更新し、プロセスを再起動します。

## Discord Permissions

Bot 招待時は、必要最小限の権限にしてください。

- View Channels
- Send Messages
- Read Message History

`applications.commands` スコープも必要です。

## Chrome Permissions

拡張機能は任意の Web ページにオーバーレイを表示するため、`http://*/*` と `https://*/*` の host permission を使います。

`tabs` 権限は、タブをまたいで表示状態を同期し、現在開いているページへテストコメントや消去メッセージを送るために使います。

`storage` 権限は、表示設定を保存するために使います。

## Reporting

脆弱性や漏えいの疑いがある場合は、公開 Issue に秘密情報を書かず、配布担当者へ直接連絡してください。
