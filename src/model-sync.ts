/**
 * Dynamic Model Sync
 *
 * Fetches the latest model catalog and pricing from ZenMux's /v1/models API.
 * Caches results in memory with a configurable TTL to avoid excessive API calls.
 * Falls back to the built-in static catalog if the API is unreachable.
 */

import { ZENMUX_MODELS, type ZenMuxModel } from "./models.js";

const MODELS_ENDPOINT = "https://zenmux.ai/api/v1/models";
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

type PricingEntry = {
  value: number;
  unit: string;
  currency: string;
  conditions?: Record<string, unknown>;
};

type ApiModel = {
  id: string;
  display_name?: string;
  owned_by?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  capabilities?: { reasoning?: boolean };
  context_length?: number;
  pricings?: {
    prompt?: PricingEntry[];
    completion?: PricingEntry[];
  };
};

type ApiResponse = {
  data: ApiModel[];
  object: string;
};

type CacheEntry = {
  models: ZenMuxModel[];
  fetchedAt: number;
};

let cache: CacheEntry | null = null;

/**
 * Extract price per 1M tokens from pricing array.
 * Looks for "perMTokens" unit, falls back to 0.
 */
function extractPrice(entries?: PricingEntry[]): number {
  if (!entries || entries.length === 0) return 0;
  // Prefer perMTokens entry
  const perM = entries.find((e) => e.unit === "perMTokens");
  if (perM) return perM.value;
  // Fallback: first entry
  return entries[0].value;
}

/**
 * Convert API model to our internal format.
 */
function toZenMuxModel(api: ApiModel): ZenMuxModel {
  const hasVision =
    api.input_modalities?.includes("image") || api.input_modalities?.includes("video");

  return {
    id: api.id,
    name: api.display_name || api.id,
    inputPrice: extractPrice(api.pricings?.prompt),
    outputPrice: extractPrice(api.pricings?.completion),
    contextWindow: api.context_length || 128_000,
    maxOutput: 65_536, // API doesn't expose this; use sensible default
    reasoning: api.capabilities?.reasoning ?? false,
    vision: hasVision ?? false,
  };
}

/**
 * Fetch latest models from ZenMux API.
 *
 * @param apiKey - ZenMux API key for authentication
 * @param cacheTtlMs - Cache TTL in ms (default: 30 minutes)
 * @returns Array of ZenMuxModel with latest pricing
 */
export async function fetchModels(
  apiKey: string,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
): Promise<ZenMuxModel[]> {
  // Return cached if fresh
  if (cache && Date.now() - cache.fetchedAt < cacheTtlMs) {
    return cache.models;
  }

  try {
    const response = await fetch(MODELS_ENDPOINT, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        "user-agent": "clawzenmux/0.1.0",
      },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = (await response.json()) as ApiResponse;
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid API response format");
    }

    const models = data.data.map(toZenMuxModel);

    // Add the auto meta-model
    models.unshift({
      id: "clawzenmux/auto",
      name: "ZenMux Smart Router",
      inputPrice: 0,
      outputPrice: 0,
      contextWindow: 1_050_000,
      maxOutput: 128_000,
    });

    cache = { models, fetchedAt: Date.now() };
    return models;
  } catch {
    // Fallback to static catalog
    return ZENMUX_MODELS;
  }
}

/**
 * Invalidate the model cache (e.g., after config change).
 */
export function invalidateModelCache(): void {
  cache = null;
}
