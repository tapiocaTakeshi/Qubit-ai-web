// Server-only configuration: return public availability, never credential values.
export function getAgentAvailability(env: NodeJS.ProcessEnv = process.env) {
  if (env.QUBIT_AGENT_ENABLED !== "true") {
    return { enabled: false, message: "Agent modeは未有効化です。管理者がQubitの対応バックエンドをデプロイ後、QUBIT_AGENT_ENABLED=trueを設定してください。" };
  }
  if (!env.RUNPOD_API_KEY?.trim() || !env.RUNPOD_ENDPOINT_ID?.trim()) {
    return { enabled: false, message: "Agent modeの接続設定が不足しています。管理者がRunPodのAPIキーとエンドポイントを設定してください。" };
  }
  return { enabled: true, message: "" };
}
