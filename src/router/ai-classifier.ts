/**
 * AI-Based Classifier for Multi-Language Support
 *
 * Uses a cheap, fast LLM (via ZenMux API) to classify prompt complexity.
 * This handles non-English prompts that keyword-based rules would miss.
 *
 * The classifier is invoked as a fallback when rules-based scoring is ambiguous,
 * or can be set as the primary classifier via config.
 *
 * Uses an LRU cache to avoid re-classifying identical/similar prompts.
 */

import type { Tier, ClassifierConfig } from "./types.js";

const SYSTEM_PROMPT = `You are a prompt complexity classifier. Classify the user's prompt into exactly one tier.

Tiers:
- SIMPLE: Trivial questions, greetings, definitions, translations, yes/no questions, factual lookups
- MEDIUM: General tasks, summaries, explanations, moderate coding, creative writing
- COMPLEX: Advanced code generation, architecture design, multi-step analysis, debugging complex systems
- REASONING: Mathematical proofs, formal logic, theorem proving, chain-of-thought reasoning, algorithm derivation

Respond with ONLY the tier name (SIMPLE, MEDIUM, COMPLEX, or REASONING). Nothing else.`;

export type AiClassifierResult = {
  tier: Tier;
  confidence: number;
};

type CacheEntry = {
  result: AiClassifierResult;
  timestamp: number;
};

/**
 * AI-based prompt classifier that works with any language.
 */
export class AiClassifier {
  private apiBase: string;
  private apiKey: string;
  private config: ClassifierConfig;
  private cache = new Map<string, CacheEntry>();

  constructor(apiBase: string, apiKey: string, config: ClassifierConfig) {
    this.apiBase = apiBase;
    this.apiKey = apiKey;
    this.config = config;
  }

  /**
   * Classify a prompt using an LLM call.
   * Returns null if the classification fails (network error, etc).
   */
  async classify(prompt: string, systemPrompt?: string): Promise<AiClassifierResult | null> {
    // Truncate prompt to save tokens on the classifier call
    const truncated = prompt.slice(0, this.config.promptTruncationChars);

    // Check cache
    const cacheKey = this.hashPrompt(truncated);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
      return cached.result;
    }

    try {
      const classifierPrompt = systemPrompt
        ? `[System context: ${systemPrompt.slice(0, 200)}]\n\nUser prompt: ${truncated}`
        : truncated;

      const response = await fetch(`${this.apiBase}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "user-agent": "clawzenmux/0.1.0",
        },
        body: JSON.stringify({
          model: this.config.llmModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: classifierPrompt },
          ],
          max_tokens: this.config.llmMaxTokens,
          temperature: this.config.llmTemperature,
        }),
        signal: AbortSignal.timeout(5_000), // 5s hard timeout
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content?.trim().toUpperCase();
      if (!content) return null;

      // Parse tier from response
      const tier = parseTier(content);
      if (!tier) return null;

      const result: AiClassifierResult = { tier, confidence: 0.85 };

      // Cache result
      this.cache.set(cacheKey, { result, timestamp: Date.now() });
      this.pruneCache();

      return result;
    } catch {
      return null; // Never block the request on classifier failure
    }
  }

  private hashPrompt(prompt: string): string {
    // Simple hash for cache key — doesn't need to be cryptographic
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash.toString(36);
  }

  private pruneCache(): void {
    if (this.cache.size <= 500) return;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.config.cacheTtlMs) {
        this.cache.delete(key);
      }
    }
    // If still too large, remove oldest half
    if (this.cache.size > 500) {
      const entries = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < entries.length / 2; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }
}

/**
 * Parse a tier string from LLM output.
 * Handles common variations like "SIMPLE", "simple", "Simple", etc.
 */
function parseTier(raw: string): Tier | null {
  const cleaned = raw.replace(/[^A-Z]/g, "");
  switch (cleaned) {
    case "SIMPLE":
      return "SIMPLE";
    case "MEDIUM":
      return "MEDIUM";
    case "COMPLEX":
      return "COMPLEX";
    case "REASONING":
      return "REASONING";
    default:
      return null;
  }
}
