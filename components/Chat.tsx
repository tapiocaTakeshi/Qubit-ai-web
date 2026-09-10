"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerateResult } from "@/lib/runpod";

type Message =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      meta?: GenerateResult["meta"];
      debugTokens?: GenerateResult["debugTokens"];
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

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      if (!prompt || loading) return;

      setMessages((m) => [...m, { id: uid(), role: "user", content: prompt }]);
      setInput("");
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });
        const data = (await res.json()) as GenerateResult & { error?: string };
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
          },
        ]);
      } catch (err) {
        if (controller.signal.aborted) {
          setMessages((m) => [
            ...m,
            { id: uid(), role: "assistant", content: "生成を中断しました。", error: true },
          ]);
        } else {
          const message = err instanceof Error ? err.message : "不明なエラー";
          setMessages((m) => [
            ...m,
            { id: uid(), role: "assistant", content: `エラー: ${message}`, error: true },
          ]);
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
        textareaRef.current?.focus();
      }
    },
    [loading],
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
    setMessages([]);
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg/85 px-4 py-3 shadow-sm backdrop-blur">
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
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-6 py-16 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-accent/15 to-accent/5 ring-1 ring-accent/20">
                <Image
                  src="/logo.png"
                  alt=""
                  width={56}
                  height={56}
                  priority
                  className="opacity-90 dark:invert"
                />
              </div>
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
                    className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-panel px-4 py-3 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                  >
                    <span>{s}</span>
                    <span className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent">
                      →
                    </span>
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
              <div className="rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="qubit-dot inline-block h-2 w-2 rounded-full bg-accent" />
                  <span className="qubit-dot inline-block h-2 w-2 rounded-full bg-accent" />
                  <span className="qubit-dot inline-block h-2 w-2 rounded-full bg-accent" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer
        className="border-t border-border bg-bg px-4 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <form
          className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border bg-panel p-2 shadow-sm transition focus-within:border-accent/50 focus-within:shadow-md"
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
            placeholder="メッセージを入力… (Enter で送信 / Shift+Enter で改行)"
            rows={1}
            maxLength={4000}
            disabled={loading}
            className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-60"
          />
          {loading ? (
            <button
              type="button"
              onClick={stop}
              aria-label="停止"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition hover:bg-bg hover:text-fg"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="送信"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <SendIcon />
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

function Avatar() {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-accent/5 ring-1 ring-accent/20">
      <Image src="/logo.png" alt="" width={18} height={18} className="dark:invert" />
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="コピー"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable; no-op
        }
      }}
      className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-panel text-muted opacity-0 shadow-sm transition group-hover:flex group-hover:opacity-100 hover:text-fg"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function MessageBubble({ message, showDebug }: { message: Message; showDebug: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="group relative max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-user-bubble px-4 py-2.5 text-sm leading-relaxed text-user-fg shadow-sm">
          {message.content}
          <CopyButton text={message.content} />
        </div>
      </div>
    );
  }

  const { meta, debugTokens } = message;

  return (
    <div className="flex items-start gap-3">
      <Avatar />
      <div className="flex max-w-[85%] flex-col gap-2">
        <div
          className={`group relative whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
            message.error
              ? "border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400"
              : "border-border bg-panel"
          }`}
        >
          {message.content}
          {!message.error && <CopyButton text={message.content} />}
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
