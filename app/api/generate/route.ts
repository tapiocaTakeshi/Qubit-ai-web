import { NextResponse } from "next/server";
import { generate, validateAgentOptions, type GenerateOptions } from "@/lib/runpod";
import { getAgentAvailability } from "@/lib/agent-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PROMPT_LENGTH = 4000;

export async function POST(req: Request) {
  let prompt: unknown;
  let mode: unknown;
  let history: unknown;
  let agentOptions: GenerateOptions;
  try {
    const body = await req.json();
    ({ prompt, mode = "chat", history = [] } = body);
    agentOptions = { toolChoice: body.toolChoice, maxSteps: body.maxSteps, documents: body.documents };
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です。" }, { status: 400 });
  }

  if (mode !== "chat" && mode !== "agent") {
    return NextResponse.json({ error: "mode が不正です。" }, { status: 400 });
  }
  const availability = getAgentAvailability();
  if (mode === "agent" && !availability.enabled) {
    return NextResponse.json({ error: availability.message }, { status: 503 });
  }
  if (mode === "agent") {
    try { validateAgentOptions(agentOptions); }
    catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 400 }); }
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
    const result = await generate(prompt.trim(), req.signal, { ...agentOptions, mode, history } as GenerateOptions);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
