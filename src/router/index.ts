/**
 * Smart Router Entry Point
 *
 * Classifies requests and routes to the cheapest capable model.
 * 100% local — rules-based scoring handles all requests in <1ms.
 * Ambiguous cases default to configurable tier (MEDIUM by default).
 */

import type { Tier, RoutingDecision, RoutingConfig } from "./types.js";
import { classifyByRules } from "./rules.js";
import { selectModel, type ModelPricing } from "./selector.js";

export type RouterOptions = {
  config: RoutingConfig;
  modelPricing: Map<string, ModelPricing>;
};

export type RouteContext = {
  /**
   * Estimated total input tokens for the full request payload.
   * Falls back to `systemPrompt + prompt` estimate when omitted.
   */
  estimatedInputTokens?: number;
  /**
   * Whether the request explicitly requires structured output (e.g. response_format).
   */
  structuredOutputRequired?: boolean;
};

/**
 * Route a request to the cheapest capable model.
 *
 * 1. Check overrides (large context, structured output)
 * 2. Run rule-based classifier (14 weighted dimensions, <1ms)
 * 3. If ambiguous, default to configurable tier (no external API calls)
 * 4. Select model for tier
 * 5. Return RoutingDecision with metadata
 */
export function route(
  prompt: string,
  systemPrompt: string | undefined,
  maxOutputTokens: number,
  options: RouterOptions,
  context?: RouteContext,
): RoutingDecision {
  const { config, modelPricing } = options;

  // Token estimates (~4 chars/token): scoring should use user prompt only,
  // while cost/override should use full request estimate.
  const userEstimatedTokens = Math.ceil(prompt.length / 4);
  const fallbackEstimatedTokens = Math.ceil(`${systemPrompt ?? ""} ${prompt}`.length / 4);
  const estimatedTokens = context?.estimatedInputTokens ?? fallbackEstimatedTokens;

  // --- Override: large context → force COMPLEX ---
  if (estimatedTokens > config.overrides.maxTokensForceComplex) {
    return selectModel(
      "COMPLEX",
      0.95,
      "rules",
      `Input exceeds ${config.overrides.maxTokensForceComplex} tokens`,
      config.tiers,
      modelPricing,
      estimatedTokens,
      maxOutputTokens,
    );
  }

  // Structured output detection:
  // prioritize explicit request signal (from proxy), then user prompt hints.
  const hasStructuredOutput =
    context?.structuredOutputRequired ?? /json|structured|schema|yaml|xml|csv|table/i.test(prompt);

  // --- Rule-based classification ---
  const ruleResult = classifyByRules(prompt, userEstimatedTokens, config.scoring);

  let tier: Tier;
  let confidence: number;
  const method: "rules" | "llm" = "rules";
  let reasoning = `score=${ruleResult.score} | ${ruleResult.signals.join(", ")}`;

  if (ruleResult.tier !== null) {
    tier = ruleResult.tier;
    confidence = ruleResult.confidence;
  } else {
    // Ambiguous — default to configurable tier (no external API call)
    tier = config.overrides.ambiguousDefaultTier;
    confidence = 0.5;
    reasoning += ` | ambiguous -> default: ${tier}`;
  }

  // Apply structured output minimum tier
  if (hasStructuredOutput) {
    const tierRank: Record<Tier, number> = { SIMPLE: 0, MEDIUM: 1, COMPLEX: 2, REASONING: 3 };
    const minTier = config.overrides.structuredOutputMinTier;
    if (tierRank[tier] < tierRank[minTier]) {
      reasoning += ` | upgraded to ${minTier} (structured output)`;
      tier = minTier;
    }
  }

  return selectModel(
    tier,
    confidence,
    method,
    reasoning,
    config.tiers,
    modelPricing,
    estimatedTokens,
    maxOutputTokens,
  );
}

export { getFallbackChain } from "./selector.js";
export { DEFAULT_ROUTING_CONFIG } from "./config.js";
export type { RoutingDecision, Tier, RoutingConfig } from "./types.js";
export type { ModelPricing } from "./selector.js";
