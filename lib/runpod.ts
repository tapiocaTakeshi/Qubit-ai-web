export type DebugToken = {
  step: number;
  generated_id: number;
  is_eof: boolean;
  is_eos: boolean;
  top5_ids: number[];
  top5_probs: number[];
};

export type RunPodDebug = {
  generated_token_count?: number;
  input_len?: number;
  vocab_size?: number;
  debug_tokens?: DebugToken[];
  [key: string]: unknown;
};

export type RunPodResponse = {
  id: string;
  status: string;
  delayTime?: number;
  executionTime?: number;
  workerId?: string;
  output?: {
    generated_text?: string;
    debug?: RunPodDebug;
    agent?: AgentResult;
    error?: string;
  };
  error?: string;
};

export type AgentResult = {
  version: 1;
  status: "completed" | "limited" | "fallback" | "failed";
  steps: { tool: string; input: string; status: string; output: string }[];
  warnings: string[];
  sources: { title: string; url: string; text: string }[];
  available_tools: string[];
};

export type GenerateOptions = {
  mode?: "chat" | "agent";
  history?: { role: "user" | "assistant"; content: string }[];
};

export type GenerateResult = {
  text: string;
  agent?: AgentResult;
  meta: {
    id: string;
    status: string;
    delayTime: number | null;
    executionTime: number | null;
    generatedTokens: number | null;
    inputTokens: number | null;
    workerId: string | null;
  };
  debugTokens: DebugToken[];
};

const RUNPOD_BASE = "https://api.runpod.ai/v2";

function getConfig() {
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  const endpointId = process.env.RUNPOD_ENDPOINT_ID?.trim();
  if (!apiKey) throw new Error("RUNPOD_API_KEY が設定されていません。");
  if (!endpointId) throw new Error("RUNPOD_ENDPOINT_ID が設定されていません。");
  return { apiKey, endpointId };
}

export async function generate(prompt: string, signal?: AbortSignal, options: GenerateOptions = {}): Promise<GenerateResult> {
  const { apiKey, endpointId } = getConfig();
  const agentMode = options.mode === "agent";
  const history = Array.isArray(options.history) ? options.history : [];
  // The current inference backend accepts a single prompt. Keep recent turns
  // in ordinary chat too, so follow-up messages are not treated as unrelated
  // one-shot questions.
  const effectivePrompt = agentMode ? prompt : formatConversationPrompt(prompt, history);
  const timeout = AbortSignal.timeout(240_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const base = `${RUNPOD_BASE}/${encodeURIComponent(endpointId)}`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  let jobId: string | undefined;
  let terminal = false;

  try {
    const res = await fetch(`${base}/${agentMode ? "run" : "runsync"}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: {
        action: agentMode ? "agent" : "inference", prompt: effectivePrompt,
        ...(agentMode ? { parameters: { max_steps: 3, history } } : {}),
      } }),
      signal: requestSignal,
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`RunPod API error ${res.status}`);
    }

    let data = (await res.json()) as RunPodResponse;
    jobId = data.id;
    while (data.status === "IN_QUEUE" || data.status === "IN_PROGRESS") {
      if (!jobId) throw new Error("RunPod job ID がありません。");
      await pause(1500, requestSignal);
      const status = await fetch(`${base}/status/${encodeURIComponent(jobId)}`, {
        headers, signal: requestSignal, cache: "no-store",
      });
      if (!status.ok) throw new Error(`RunPod status error ${status.status}`);
      data = (await status.json()) as RunPodResponse;
    }
    terminal = ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(data.status);

    if (data.status !== "COMPLETED") {
      throw new Error(`RunPod status: ${data.status}`);
    }
    if (data.output?.error) throw new Error("モデル処理に失敗しました。RunPodのログと入力の長さを確認してください。");
    if (agentMode && !isAgentResult(data.output?.agent)) {
      throw new Error("エージェント非対応の応答です。Qubit側の対応イメージを先にデプロイしてください。");
    }

    const debug = data.output?.debug ?? {};

    return {
      text: data.output?.generated_text ?? "",
      ...(agentMode ? { agent: data.output!.agent } : {}),
      meta: {
        id: data.id,
        status: data.status,
        delayTime: data.delayTime ?? null,
        executionTime: data.executionTime ?? null,
        generatedTokens: debug.generated_token_count ?? null,
        inputTokens: debug.input_len ?? null,
        workerId: data.workerId ?? null,
      },
      debugTokens: Array.isArray(debug.debug_tokens) ? debug.debug_tokens : [],
    };
  } finally {
    // Cancelling the browser request alone does not cancel paid RunPod work.
    if (jobId && !terminal) {
      try {
        const cancelled = await fetch(`${base}/cancel/${encodeURIComponent(jobId)}`, {
          method: "POST", headers, signal: AbortSignal.timeout(5000), cache: "no-store",
        });
        if (!cancelled.ok) console.warn("RunPod cancellation failed", jobId, cancelled.status);
      } catch {
        console.warn("RunPod cancellation could not be confirmed", jobId);
      }
    }
  }
}

function formatConversationPrompt(prompt: string, history: { role: "user" | "assistant"; content: string }[]): string {
  if (history.length === 0) return prompt;
  const turns = history.slice(-6).map(turn =>
    (turn.role === "user" ? "ユーザー" : "Qubit ai") + ": " + turn.content,
  ).join("\n");
  return "質問: これまでの会話を踏まえて、最後のユーザー発言に直接答えてください。\n" +
    "会話履歴:\n" + turns + "\nユーザー: " + prompt + "\n回答:";
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function isAgentResult(value: unknown): value is AgentResult {
  if (!value || typeof value !== "object") return false;
  const a = value as AgentResult;
  return a.version === 1 && ["completed", "limited", "fallback", "failed"].includes(a.status)
    && Array.isArray(a.steps) && a.steps.length <= 4 && a.steps.every(s => s &&
      typeof s.tool === "string" && typeof s.input === "string" &&
      typeof s.output === "string" && ["completed", "failed"].includes(s.status))
    && Array.isArray(a.warnings) && a.warnings.every(w => typeof w === "string")
    && Array.isArray(a.available_tools) && a.available_tools.every(t => typeof t === "string")
    && Array.isArray(a.sources) && a.sources.every(s => s && typeof s.title === "string" &&
      typeof s.url === "string" && typeof s.text === "string");
}
