/**
 * Smart Router Entry Point
 *
 * Classifies requests and routes to the cheapest capable model.
 * Two-stage classification:
 *   1. Rules-based scoring (14 weighted dimensions, <1ms, free)
 *   2. AI classifier fallback (handles multi-language, ambiguous cases)
 *
 * When useAiClassifier is enabled (default: true), ambiguous cases are
 * classified by a cheap LLM call instead of defaulting to MEDIUM tier.
 */

import type { Tier, RoutingDecision, RoutingConfig } from "./types.js";
import { classifyByRules } from "./rules.js";
import { selectModel, type ModelPricing } from "./selector.js";
import { AiClassifier } from "./ai-classifier.js";

export type RouterOptions = {
  config: RoutingConfig;
  modelPricing: Map<string, ModelPricing>;
  /** AI classifier instance (created by proxy with API key). Null = disabled. */
  aiClassifier?: AiClassifier | null;
};

/**
 * Route a request to the cheapest capable model (sync path).
 * For ambiguous results when AI classifier is available, use routeAsync().
 */
export function route(
  prompt: string,
  systemPrompt: string | undefined,
  maxOutputTokens: number,
  options: RouterOptions,
): RoutingDecision {
  const { config, modelPricing } = options;

  const fullText = `${systemPrompt ?? ""} ${prompt}`;
  const estimatedTokens = Math.ceil(fullText.length / 4);

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

  const hasStructuredOutput = systemPrompt ? /json|structured|schema/i.test(systemPrompt) : false;

  // --- Rule-based classification ---
  const ruleResult = classifyByRules(prompt, systemPrompt, estimatedTokens, config.scoring);

  let tier: Tier;
  let confidence: number;
  let method: "rules" | "llm" = "rules";
  let reasoning = `score=${ruleResult.score} | ${ruleResult.signals.join(", ")}`;

  if (ruleResult.tier !== null) {
    tier = ruleResult.tier;
    confidence = ruleResult.confidence;
  } else {
    // Ambiguous — default to configurable tier
    tier = config.overrides.ambiguousDefaultTier;
    confidence = 0.5;
    method = "rules";
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

/**
 * Route a request with AI classifier fallback for ambiguous cases.
 * Falls back to sync route() if AI classifier fails or is not configured.
 */
export async function routeAsync(
  prompt: string,
  systemPrompt: string | undefined,
  maxOutputTokens: number,
  options: RouterOptions,
): Promise<RoutingDecision> {
  const { config, modelPricing, aiClassifier } = options;

  const fullText = `${systemPrompt ?? ""} ${prompt}`;
  const estimatedTokens = Math.ceil(fullText.length / 4);

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

  const hasStructuredOutput = systemPrompt ? /json|structured|schema/i.test(systemPrompt) : false;

  // --- Rule-based classification ---
  const ruleResult = classifyByRules(prompt, systemPrompt, estimatedTokens, config.scoring);

  let tier: Tier;
  let confidence: number;
  let method: "rules" | "llm" = "rules";
  let reasoning = `score=${ruleResult.score} | ${ruleResult.signals.join(", ")}`;

  if (ruleResult.tier !== null && ruleResult.confidence >= config.scoring.confidenceThreshold) {
    // Rules-based classification is confident enough
    tier = ruleResult.tier;
    confidence = ruleResult.confidence;
  } else if (aiClassifier) {
    // Ambiguous or low confidence — use AI classifier
    const aiResult = await aiClassifier.classify(prompt, systemPrompt);
    if (aiResult) {
      tier = aiResult.tier;
      confidence = aiResult.confidence;
      method = "llm";
      reasoning += ` | AI: ${tier} (${(confidence * 100).toFixed(0)}%)`;
    } else {
      // AI classifier failed — fall back to default
      tier = config.overrides.ambiguousDefaultTier;
      confidence = 0.5;
      reasoning += ` | AI failed -> default: ${tier}`;
    }
  } else {
    // No AI classifier — use default tier
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

export { AiClassifier } from "./ai-classifier.js";
export { getFallbackChain } from "./selector.js";
export { DEFAULT_ROUTING_CONFIG } from "./config.js";
export type { RoutingDecision, Tier, RoutingConfig } from "./types.js";
export type { ModelPricing } from "./selector.js";
