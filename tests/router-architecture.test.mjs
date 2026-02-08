import test from "node:test";
import assert from "node:assert/strict";
import { route, DEFAULT_ROUTING_CONFIG, ZENMUX_MODELS } from "../dist/index.js";

const modelPricing = new Map(
  ZENMUX_MODELS.filter((m) => m.id !== "clawzenmux/auto").map((m) => [
    m.id,
    { inputPrice: m.inputPrice, outputPrice: m.outputPrice },
  ]),
);

function classify(prompt) {
  return route(prompt, undefined, 2048, {
    config: DEFAULT_ROUTING_CONFIG,
    modelPricing,
  });
}

test("routes advanced architecture prompts to COMPLEX", () => {
  const prompts = [
    "给我一个高并发订单系统的系统架构方案，考虑分片和多活容灾",
    "Propose a multi-tenant event-driven platform topology for 100k QPS with sharding and failover",
  ];

  for (const prompt of prompts) {
    const decision = classify(prompt);
    assert.equal(
      decision.tier,
      "COMPLEX",
      `Expected COMPLEX for: ${prompt}\nGot: ${decision.tier}\nReason: ${decision.reasoning}`,
    );
  }
});

test("keeps lightweight greeting in SIMPLE", () => {
  const decision = classify("你好");
  assert.equal(decision.tier, "SIMPLE", `Expected SIMPLE, got ${decision.tier}: ${decision.reasoning}`);
});
