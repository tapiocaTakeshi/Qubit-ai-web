# Qubit ai Web

RunPod Serverless 上で動く Qubit ai モデルとチャットできる Web アプリです。
Next.js (App Router) + Tailwind CSS で構築しています。

## 構成

- `app/page.tsx` … チャット画面
- `components/Chat.tsx` … チャット UI（送信・停止・クリア・デバッグ表示）
- `app/api/generate/route.ts` … ブラウザからのリクエストを受け、サーバー側で RunPod を呼び出す API
- `lib/runpod.ts` … RunPod `runsync` クライアント

## エージェントモード

Qubit側の `action: "agent"` 対応イメージを先にRunPodへデプロイし、Web側の
`QUBIT_AGENT_ENABLED=true` を設定してください。画面の「エージェント」をONにすると、
最大3回の処理選択・実行と最終回答生成を行います。直近6件の会話履歴も渡します。
通常チャットはこれまでどおり単発推論です。

計算と任意設定のWeb検索をモデルが選び、結果を見て次の処理を決めます。
文書検索はQubit APIの `parameters.documents` で利用できます（Webの添付UIは未実装）。
Web検索にはRunPod側の `BRAVE_SEARCH_API_KEY` が必要です。検索語はBraveに送信されます。
未設定の場合、Web検索は利用可能なツールに含まれません。

実行中は待機表示、完了後は実際の処理履歴・結果・取得資料・警告を表示します。
ステップごとのライブ配信ではありません。モデルのJSON選択に失敗した場合は
通常回答に切り替わり、その旨を表示します。回答の正しさを保証する機能ではありません。
旧バックエンドの応答は対応不足のエラーとして扱います。

エージェントはRunPod `/run` でジョブを作成し `/status` をポーリングします。
停止・タイムアウト・ポーリング失敗時は `/cancel` も要求します。取消通信に失敗した場合、
サーバーログのジョブIDを使ってRunPodで状態を確認してください。送信中の接続断でジョブIDを
取得できなかった場合は、自動取消できません。ホスティング側にも300秒の実行枠が必要です。
上限はリクエスト全体240秒、取消要求5秒です。公開運用時はホスト側の認証・レート制限も
設定してください。追加の推論と検索には利用料金が発生します。

検証: Node 22.18以降で `npm test` と `npm run typecheck`、`npm run build`。
テストはモックAPIを使用し、有料の推論を送信しません。

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

## Agent modeの公開前チェック

Agent modeの画面・API対応はこのブランチに含まれます。GitHubのデフォルトブランチと
VercelのProduction Branchは一致するとは限りません。公開対象のブランチにこの変更を
マージし、そのコミットでProductionのデプロイが成功したことを確認してください。
ブランチ設定を確認せずに変更しないでください。

1. RunPodにQubitの `action: agent` 対応バックエンドをデプロイする。
2. VercelのProduction環境に `RUNPOD_API_KEY`、`RUNPOD_ENDPOINT_ID`、
   `QUBIT_AGENT_ENABLED=true` を設定して再デプロイする。
3. 画面でAgent modeをONにし、「125 × 8を計算して」などで処理履歴・回答を確認する。

未設定の場合は切り替えを無効にして理由を表示します。設定済みの表示はバックエンドの
互換性や検索APIの動作を保証しません。旧バックエンドは推論時に互換性エラーになります。
Web検索は別途RunPod側の検索API設定が必要です。キーは画面へ渡しません。
