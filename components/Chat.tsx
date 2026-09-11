"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerateResult, GenerateOptions } from "@/lib/runpod";

type Message =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      meta?: GenerateResult["meta"];
      debugTokens?: GenerateResult["debugTokens"];
      agent?: GenerateResult["agent"];
      error?: boolean;
    };

const SUGGESTIONS = [
  "ChatGPTについて教えて",
  "量子コンピュータとは何ですか？",
  "自己紹介をしてください",
  "日本の首都はどこ？",
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Chat({ agentEnabled, agentMessage }: { agentEnabled: boolean; agentMessage: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [toolChoice, setToolChoice] = useState<NonNullable<GenerateOptions["toolChoice"]>>("auto");
  const [maxSteps, setMaxSteps] = useState(3);
  const [documentText, setDocumentText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || loading || abortRef.current) return;
      const requestId = ++requestRef.current;

      setMessages((m) => [...m, { id: uid(), role: "user", content: prompt }]);
      setInput("");
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, mode: agentMode ? "agent" : "chat",
            ...(agentMode ? { toolChoice, maxSteps, documents: documentText.trim() ? [documentText] : [] } : {}),
            history: messages.filter(m => !(m.role === "assistant" && m.error))
              .slice(-6).map(m => ({ role: m.role, content: m.content.slice(-2000) })),
          }),
          signal: controller.signal,
        });
        const data = (await res.json()) as GenerateResult & { error?: string };
        if (requestId !== requestRef.current) return;
        if (!res.ok || data.error) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setMessages((m) => [
          ...m,
          {
            id: uid(),
            role: "assistant",
            content: data.text || "（空の応答）",
            meta: data.meta,
            debugTokens: data.debugTokens,
            agent: data.agent,
          },
        ]);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        if (controller.signal.aborted) {
          setMessages((m) => [
            ...m,
            { id: uid(), role: "assistant", content: "応答の受信を停止しました。サーバー側にも取消を要求しますが、確定状況はRunPodで確認してください。", error: true },
          ]);
        } else {
          const message = err instanceof Error ? err.message : "不明なエラー";
          setMessages((m) => [
            ...m,
            { id: uid(), role: "assistant", content: `エラー: ${message}`, error: true },
          ]);
        }
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          abortRef.current = null;
          textareaRef.current?.focus();
        }
      }
    },
    [loading, agentMode, messages, toolChoice, maxSteps, documentText],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  const stop = () => abortRef.current?.abort();
  const clear = () => {
    stop();
    ++requestRef.current;
    abortRef.current = null;
    setLoading(false);
    setMessages([]);
    setDocumentText("");
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur">
        <Image
          src="/logo.png"
          alt="Qubit ai"
          width={36}
          height={36}
          priority
          className="rounded-md dark:invert"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight">Qubit ai</span>
          <span className="text-xs text-muted">RunPod Serverless</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={agentMode} disabled={loading || !agentEnabled}
              aria-describedby="agent-mode-help"
              onChange={e => setAgentMode(e.target.checked)} className="accent-accent" />
            Agent mode
          </label>
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              className="accent-accent"
            />
            デバッグ
          </label>
          <button
            type="button"
            onClick={clear}
            disabled={messages.length === 0 && !loading}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40"
          >
            クリア
          </button>
        </div>
        <p id="agent-mode-help" role="status" className="w-full text-sm text-muted">
          {agentEnabled
            ? (agentMode ? "計算・検索の実行結果を使って回答します。処理履歴は完了後に表示されます。" : "Agent modeをONにすると、計算・検索を利用できます。")
            : agentMessage}
        </p>
        {agentMode && <details className="w-full text-sm">
          <summary className="cursor-pointer">使う処理・資料を指定</summary>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">使う処理
              <select value={toolChoice} disabled={loading} onChange={e => setToolChoice(e.target.value as typeof toolChoice)}
                className="rounded-md border border-border bg-panel px-2 py-2">
                <option value="auto">自動で判断</option><option value="none">ツールを使わず会話</option>
                <option value="required">いずれかのツールを必ず使う</option><option value="calculator">計算を必ず使う</option>
                <option value="web_search">Web検索を必ず使う</option><option value="document_search">文書検索を必ず使う</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">処理回数の上限
              <select value={maxSteps} disabled={loading} onChange={e => setMaxSteps(Number(e.target.value))}
                className="rounded-md border border-border bg-panel px-2 py-2">
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}回</option>)}
              </select>
            </label>
            <label className="flex w-full flex-col gap-1">検索する資料（任意・4000文字まで）
              <textarea value={documentText} maxLength={4000} rows={3} disabled={loading}
                onChange={e => setDocumentText(e.target.value)}
                className="w-full resize-y rounded-md border border-border bg-panel px-3 py-2"
                placeholder="参照させたい文章を貼り付け" />
            </label>
            <p className="text-muted">資料は依頼と一緒に送信します。Web検索にはサーバー側の検索設定が必要です。削除・投稿・任意コード実行はできません。</p>
          </div>
        </details>}
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-6 py-16 text-center">
              <Image
                src="/logo.png"
                alt=""
                width={96}
                height={96}
                priority
                className="opacity-90 dark:invert"
              />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Qubit ai</h1>
                <p className="mt-2 text-sm text-muted">
                  質問を入力すると Qubit ai が応答します。
                </p>
              </div>
              <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-xl border border-border bg-panel px-4 py-3 text-left text-sm transition hover:border-fg/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} showDebug={showDebug} />
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <Avatar />
              <div className="rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-3">
                <div role="status" className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-muted">{agentMode ? "エージェント実行中（待機を含む）" : "生成中"}</span>
                  <span className="qubit-dot inline-block h-2 w-2 rounded-full bg-fg" />
                  <span className="qubit-dot inline-block h-2 w-2 rounded-full bg-fg" />
                  <span className="qubit-dot inline-block h-2 w-2 rounded-full bg-fg" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-border bg-bg px-4 py-3">
        <form
          className="mx-auto flex w-full max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={agentMode ? "エージェントへの依頼" : "メッセージ"}
            placeholder={agentMode ? "実行したいことを入力… 例：125 × 8を計算して" : "メッセージを入力… (Enter で送信 / Shift+Enter で改行)"}
            rows={1}
            maxLength={4000}
            disabled={loading}
            className="max-h-[200px] min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-panel px-4 py-2.5 text-sm outline-none transition focus:border-fg/50 disabled:opacity-60"
          />
          {loading ? (
            <button
              type="button"
              onClick={stop}
              className="h-[44px] rounded-xl border border-border px-4 text-sm transition hover:bg-panel"
            >
              停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-[44px] rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              送信
            </button>
          )}
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted">
          Qubit ai は研究用モデルです。応答には誤りが含まれる場合があります。
        </p>
      </footer>
    </div>
  );
}

function AgentTrace({ agent }: { agent: NonNullable<GenerateResult["agent"]> }) {
  const labels = { completed: "回答生成完了", limited: "上限で終了", fallback: "通常回答に切替", failed: "回答生成失敗" };
  const tools: Record<string, string> = { calculator: "計算", web_search: "Web検索", document_search: "文書検索" };
  return (
    <div className="space-y-2 text-sm">
      <details className="rounded-md border border-border px-3 py-2" open>
        <summary className="cursor-pointer">エージェント · {agent.stop_reason === "clarification" ? "追加情報を確認" : labels[agent.status]} · {agent.steps.length}処理</summary>
        <ol className="mt-2 space-y-2">
          {agent.steps.map((step, i) => (
            <li key={i} className="min-w-0 break-words">
              <span>{i + 1}. {tools[step.tool] ?? step.tool} · {step.status === "completed" ? "実行済み" : "失敗"}</span>
              <p className="mt-1 text-muted">{step.input}</p>
              <details className="mt-1"><summary className="cursor-pointer text-muted">処理結果</summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all">{step.output}</pre>
              </details>
            </li>
          ))}
        </ol>
        {agent.steps.length === 0 && <p className="mt-2 text-muted">ツールの実行はありません。</p>}
      </details>
      {agent.warnings.map((warning, i) => <p key={i} role="status" className="break-words text-muted">{warning}</p>)}
      {agent.sources.length > 0 && <div className="space-y-1">
        <p className="text-muted">検索で取得した資料（回答の正しさを保証するものではありません）</p>
        {agent.sources.map((source, i) => {
          try {
            const url = new URL(source.url);
            if (url.protocol !== "https:" || url.username || url.password) return null;
            return <a key={i} href={url.href} target="_blank" rel="noopener noreferrer"
              className="block break-all underline">{source.title || url.hostname}</a>;
          } catch { return null; }
        })}
      </div>}
    </div>
  );
}

function Avatar() {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-panel">
      <Image src="/logo.png" alt="" width={20} height={20} className="dark:invert" />
    </div>
  );
}

function MessageBubble({ message, showDebug }: { message: Message; showDebug: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-user-bubble px-4 py-2.5 text-sm text-user-fg">
          {message.content}
        </div>
      </div>
    );
  }

  const { meta, debugTokens } = message;

  return (
    <div className="flex items-start gap-3">
      <Avatar />
      <div className="flex min-w-0 max-w-[85%] flex-col gap-2">
        {message.agent && <AgentTrace agent={message.agent} />}
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border px-4 py-2.5 text-sm ${
            message.error
              ? "border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400"
              : "border-border bg-panel"
          }`}
        >
          {message.content}
        </div>

        {meta && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
            {meta.executionTime != null && <span>実行 {meta.executionTime} ms</span>}
            {meta.delayTime != null && <span>待機 {meta.delayTime} ms</span>}
            {meta.inputTokens != null && <span>入力 {meta.inputTokens} tok</span>}
            {meta.generatedTokens != null && <span>生成 {meta.generatedTokens} tok</span>}
          </div>
        )}

        {showDebug && debugTokens && debugTokens.length > 0 && (
          <details className="rounded-xl border border-border bg-panel px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none text-muted">
              デバッグトークン（先頭 {debugTokens.length} ステップ）
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pr-3 pb-1 font-normal">step</th>
                    <th className="pr-3 pb-1 font-normal">gen id</th>
                    <th className="pr-3 pb-1 font-normal">top-5 id (prob)</th>
                  </tr>
                </thead>
                <tbody>
                  {debugTokens.map((t) => (
                    <tr key={t.step} className="border-t border-border">
                      <td className="pr-3 py-1">{t.step}</td>
                      <td className="pr-3 py-1">{t.generated_id}</td>
                      <td className="pr-3 py-1 whitespace-nowrap">
                        {t.top5_ids
                          .map((id, i) => `${id} (${t.top5_probs[i]?.toFixed(3) ?? "-"})`)
                          .join("  ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {meta?.id && <p className="mt-2 text-muted">job: {meta.id}</p>}
          </details>
        )}
      </div>
    </div>
  );
}
