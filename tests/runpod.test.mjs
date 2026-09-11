import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../lib/runpod.ts";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnv }; });

const agent = { version: 1, status: "completed", steps: [], warnings: [], sources: [], available_tools: ["calculator"] };
const completed = (extra = {}) => ({ id: "test-job", status: "COMPLETED", output: { generated_text: "answer", ...extra } });
function setup(responses) {
  process.env.RUNPOD_API_KEY = "test-secret";
  process.env.RUNPOD_ENDPOINT_ID = "test-endpoint";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.ok(response, "unexpected fetch");
    return Response.json(response);
  };
  return calls;
}

test("chat uses explicit inference action and retains old result shape", async () => {
  const calls = setup([completed()]);
  const result = await generate("hello");
  assert.equal(result.text, "answer");
  assert.equal(result.agent, undefined);
  assert.equal(JSON.parse(calls[0].options.body).input.action, "inference");
  assert.ok(calls[0].url.endsWith("/runsync"));
  assert.ok(!JSON.stringify(result).includes("test-secret"));
});

test("chat includes recent turns so follow-up questions have context", async () => {
  const calls = setup([completed()]);
  await generate("え？無視？", undefined, {
    mode: "chat",
    history: [
      { role: "user", content: "君ユーモアのセンスあるね" },
      { role: "assistant", content: "ありがとう" },
    ],
  });
  const input = JSON.parse(calls[0].options.body).input;
  assert.match(input.prompt, /君ユーモアのセンスあるね/);
  assert.match(input.prompt, /え？無視？/);
  assert.match(input.prompt, /最後のユーザー発言に直接答えて/);
});

test("agent submits bounded action, polls queued job and preserves history", async () => {
  const calls = setup([{ id: "test-job", status: "IN_QUEUE" }, completed({ agent })]);
  const history = [{ role: "user", content: "earlier" }];
  const result = await generate("task", undefined, { mode: "agent", history });
  assert.deepEqual(result.agent, agent);
  const input = JSON.parse(calls[0].options.body).input;
  assert.equal(input.action, "agent");
  assert.equal(input.parameters.max_steps, 3);
  assert.deepEqual(input.parameters.history, history);
  assert.ok(calls[0].url.endsWith("/run"));
  assert.ok(calls[1].url.endsWith("/status/test-job"));
});

test("old backend cannot silently masquerade as agent", async () => {
  const calls = setup([completed()]);
  await assert.rejects(generate("task", undefined, { mode: "agent" }), /非対応/);
  assert.equal(calls.length, 1);
});

test("malformed trace is rejected", async () => {
  setup([completed({ agent: { ...agent, steps: [null] } })]);
  await assert.rejects(generate("task", undefined, { mode: "agent" }), /非対応/);
});

test("model errors are not returned as empty successes or leaked", async () => {
  setup([completed({ error: "private backend path" })]);
  await assert.rejects(generate("task"), err => /モデル処理/.test(err.message) && !err.message.includes("private"));
});

test("abort cancels paid queued work with an independent signal", async () => {
  const calls = setup([{ id: "test-job", status: "IN_PROGRESS" }, { status: "CANCELLED" }]);
  const controller = new AbortController();
  const promise = generate("task", controller.signal, { mode: "agent" });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(promise);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith("/cancel/test-job"));
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.signal.aborted, false);
});

test("poll errors attempt cancellation instead of losing the job", async () => {
  const calls = setup([{ id: "test-job", status: "IN_QUEUE" }, new Error("network"), { status: "CANCELLED" }]);
  await assert.rejects(generate("task", undefined, { mode: "agent" }), /network/);
  assert.ok(calls[2].url.endsWith("/cancel/test-job"));
});

test("failed job is terminal and does not leak provider details", async () => {
  const calls = setup([{ id: "test-job", status: "FAILED", error: "test-secret" }]);
  await assert.rejects(generate("task"), { message: "RunPod status: FAILED" });
  assert.equal(calls.length, 1);
});
