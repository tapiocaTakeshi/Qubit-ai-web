import { NextResponse } from "next/server";
import { generate, type AgentProgress, type GenerateOptions } from "@/lib/runpod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PROMPT_LENGTH = 4000;

export async function POST(req: Request) {
  let prompt: unknown;
  let mode: unknown;
  let history: unknown;
  try {
    ({ prompt, mode = "chat", history = [] } = await req.json());
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です。" }, { status: 400 });
  }

  if (mode !== "chat" && mode !== "agent") {
    return NextResponse.json({ error: "mode が不正です。" }, { status: 400 });
  }
  if (mode === "agent" && process.env.QUBIT_AGENT_ENABLED !== "true") {
    return NextResponse.json({ error: "エージェントは未有効化です。対応するQubitをデプロイ後、QUBIT_AGENT_ENABLED=true を設定してください。" }, { status: 503 });
  }
  if (!Array.isArray(history) || history.length > 6 || history.some(m =>
    !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 2000
  )) {
    return NextResponse.json({ error: "会話履歴が不正です。" }, { status: 400 });
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "prompt を入力してください。" }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `prompt は ${MAX_PROMPT_LENGTH} 文字以内にしてください。` },
      { status: 400 },
    );
  }

  try {
    if (mode === "agent") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const send = (event: string, payload: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          };
          send("progress", { agent_event: { sequence: 0, type: "connected", label: "エージェントに接続しました" } });
          void generate(prompt.trim(), req.signal, {
            mode, history,
            onProgress: (progress: AgentProgress) => send("progress", progress),
          } as GenerateOptions)
            .then(result => { send("complete", result); controller.close(); })
            .catch(error => {
              send("error", { error: error instanceof Error ? error.message : "不明なエラーが発生しました。" });
              controller.close();
            });
        },
        cancel() { /* req.signal cancellation is handled by generate */ },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
    }
    const result = await generate(prompt.trim(), req.signal, { mode, history } as GenerateOptions);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
