# Qubit ai Web

RunPod Serverless 上で動く Qubit ai モデルとチャットできる Web アプリです。
Next.js (App Router) + Tailwind CSS で構築しています。

## 構成

- `app/page.tsx` … チャット画面
- `components/Chat.tsx` … チャット UI（送信・停止・クリア・デバッグ表示）
- `app/api/generate/route.ts` … ブラウザからのリクエストを受け、サーバー側で RunPod を呼び出す API
- `lib/runpod.ts` … RunPod `runsync` クライアント

API キーはサーバー側の環境変数からのみ読み込み、ブラウザには一切送りません。

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local を編集して RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID を設定
npm run dev
```

http://localhost:3000 を開くとチャット画面が表示されます。

## 環境変数

| 変数名 | 説明 |
| --- | --- |
| `RUNPOD_API_KEY` | RunPod の API キー（`rpa_...`） |
| `RUNPOD_ENDPOINT_ID` | Serverless エンドポイント ID（例: `aic6yigpthbck5`） |

## デプロイ (Vercel)

1. このリポジトリを Vercel にインポート
2. Environment Variables に `RUNPOD_API_KEY` と `RUNPOD_ENDPOINT_ID` を設定
3. Deploy

## RunPod エンドポイント仕様

リクエスト:

```json
{ "input": { "prompt": "ChatGPTについて教えて" } }
```

レスポンス (`runsync`):

```json
{
  "status": "COMPLETED",
  "executionTime": 685,
  "output": {
    "generated_text": "...",
    "debug": { "generated_token_count": 77, "input_len": 16, "debug_tokens": [ ... ] }
  }
}
```
