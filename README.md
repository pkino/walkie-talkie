# Walkie Talkie (WebRTC 音声通話サンプル)

Node.js + WebRTC で動作するシンプルな音声通話デモです。Express で静的ファイルを配信し、WebSocket でシグナリングを行います。クライアントは同じルーム名を入力するだけでピア同士が接続され、音声をやり取りできます。

## 前提条件
- Node.js 18 以上

## セットアップ
```
npm install
```

## 開発・起動
- ホットリロードしながら起動
  ```
  npm run dev
  ```
- 本番相当で起動
  ```
  npm start
  ```
- ポートは `PORT` 環境変数で変更できます（デフォルト: `3000`）。
- 待ち受けホストは `HOST` 環境変数で変更できます（デフォルト: `0.0.0.0`）。

起動後、ブラウザで `http://localhost:3000` にアクセスします。

## ブラウザでの使い方
1. マイク利用を許可します。
2. ルーム名を入力して「ルームに参加」をクリックします。
3. 別のブラウザ/タブ/端末でも同じルーム名で参加します（同一 LAN 上なら他端末からも可）。
4. 参加者同士で P2P 音声通話が開始され、受信中の音声が画面に表示されます。
5. 「切断」でルームを退出し、すべての接続とメディアを停止します。

## デプロイ/ホスティングのヒント
- サーバーは Node.js の単一プロセスで動作するため、任意のホスティング（VPS、Render、Railway、Fly.io など）で `npm start` を実行するだけで公開できます。
- `PORT` と `HOST`（必要なら `0.0.0.0` を指定）を環境に合わせて設定してください。
- HTTPS 環境ではシグナリング URL が自動的に `wss://` になります。リバースプロキシを使う場合は WebSocket のアップグレードが許可されていることを確認してください。

## Heroku へのデプロイ手順
Heroku の Node.js ビルドパックを利用する前提です。プロジェクトを Git で管理している状態から、以下のステップでデプロイできます。

1. Heroku CLI でログインします。
   ```bash
   heroku login
   ```
2. アプリを作成し、Node.js ビルドパックを設定します。
   ```bash
   heroku create <app-name>
   heroku buildpacks:set heroku/nodejs -a <app-name>
   ```
3. 環境変数を設定します（PORT は Heroku が自動設定するので不要。必要に応じて HOST を `0.0.0.0` に固定します）。
   ```bash
   heroku config:set HOST=0.0.0.0 -a <app-name>
   ```
4. 本番用に依存をインストールして起動するため、`Procfile` を用意する場合は次のようにします（既存の `npm start` を利用）。
   ```Procfile
   web: npm start
   ```
5. コードをプッシュしてデプロイします。
   ```bash
   git push heroku HEAD:main
   ```
6. デプロイ後、アプリの URL を確認してアクセスします。
   ```bash
   heroku open -a <app-name>
   ```

Heroku 上では HTTPS で公開され、シグナリングも `wss://` で自動的に動作します。WebSocket のアップグレードが有効になっていることを確認してください。
