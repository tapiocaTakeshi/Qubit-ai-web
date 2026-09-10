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
  };
  error?: string;
};

export type GenerateResult = {
  text: string;
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

export async function generate(prompt: string, signal?: AbortSignal): Promise<GenerateResult> {
  const { apiKey, endpointId } = getConfig();

  const res = await fetch(`${RUNPOD_BASE}/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: { prompt } }),
    signal,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RunPod API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as RunPodResponse;

  if (data.status !== "COMPLETED") {
    throw new Error(data.error ? `RunPod: ${data.error}` : `RunPod status: ${data.status}`);
  }

  const debug = data.output?.debug ?? {};

  return {
    text: data.output?.generated_text ?? "",
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
}
