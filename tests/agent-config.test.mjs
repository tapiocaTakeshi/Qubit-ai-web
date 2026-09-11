import { test } from "node:test";
import assert from "node:assert/strict";
import { getAgentAvailability } from "../lib/agent-config.ts";

test("agent stays opt-in until explicitly enabled", () => {
  for (const flag of [undefined, "false", "TRUE", "1"]) {
    assert.equal(getAgentAvailability({ QUBIT_AGENT_ENABLED: flag }).enabled, false);
  }
});
test("enabled agent needs both connection settings", () => {
  for (const settings of [{}, { RUNPOD_API_KEY: "secret" }, { RUNPOD_ENDPOINT_ID: "endpoint" },
    { RUNPOD_API_KEY: " ", RUNPOD_ENDPOINT_ID: "endpoint" }]) {
    assert.equal(getAgentAvailability({ QUBIT_AGENT_ENABLED: "true", ...settings }).enabled, false);
  }
});
test("public availability contains no credentials", () => {
  const result = getAgentAvailability({
    QUBIT_AGENT_ENABLED: "true", RUNPOD_API_KEY: "private-secret", RUNPOD_ENDPOINT_ID: "private-endpoint",
  });
  assert.equal(result.enabled, true);
  assert.equal(JSON.stringify(result).includes("private"), false);
});
