/**
 * ZenMux Model Definitions for OpenClaw
 *
 * Maps ZenMux's 100+ AI models to OpenClaw's ModelDefinitionConfig format.
 * All models use the "openai-completions" API since ZenMux is OpenAI-compatible.
 *
 * Pricing is in USD per 1M tokens.
 */

import type { ModelDefinitionConfig, ModelProviderConfig } from "./types.js";

export type ZenMuxModel = {
  id: string;
  name: string;
  inputPrice: number;
  outputPrice: number;
  contextWindow: number;
  maxOutput: number;
  reasoning?: boolean;
  vision?: boolean;
};

export const ZENMUX_MODELS: ZenMuxModel[] = [
  // Smart routing meta-model — proxy replaces with actual model
  {
    id: "clawzenmux/auto",
    name: "ZenMux Smart Router",
    inputPrice: 0,
    outputPrice: 0,
    contextWindow: 1_050_000,
    maxOutput: 128_000,
  },

  // ─── OpenAI GPT-5 Family ───
  {
    id: "openai/gpt-5.2-pro",
    name: "GPT-5.2 Pro",
    inputPrice: 21.0,
    outputPrice: 168.0,
    contextWindow: 400_000,
    maxOutput: 128_000,
    reasoning: true,
  },
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    inputPrice: 1.75,
    outputPrice: 14.0,
    contextWindow: 400_000,
    maxOutput: 128_000,
    reasoning: true,
    vision: true,
  },
  {
    id: "openai/gpt-5.1",
    name: "GPT-5.1",
    inputPrice: 1.5,
    outputPrice: 12.0,
    contextWindow: 400_000,
    maxOutput: 128_000,
    reasoning: true,
    vision: true,
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    inputPrice: 1.0,
    outputPrice: 8.0,
    contextWindow: 400_000,
    maxOutput: 128_000,
    reasoning: true,
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    inputPrice: 0.25,
    outputPrice: 2.0,
    contextWindow: 200_000,
    maxOutput: 65_536,
  },
  {
    id: "openai/gpt-5-nano",
    name: "GPT-5 Nano",
    inputPrice: 0.05,
    outputPrice: 0.4,
    contextWindow: 128_000,
    maxOutput: 32_768,
  },

  // ─── OpenAI GPT-4 Family ───
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    inputPrice: 2.0,
    outputPrice: 8.0,
    contextWindow: 128_000,
    maxOutput: 16_384,
    vision: true,
  },
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    inputPrice: 0.4,
    outputPrice: 1.6,
    contextWindow: 128_000,
    maxOutput: 16_384,
  },
  {
    id: "openai/gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    inputPrice: 0.1,
    outputPrice: 0.4,
    contextWindow: 128_000,
    maxOutput: 16_384,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    inputPrice: 2.5,
    outputPrice: 10.0,
    contextWindow: 128_000,
    maxOutput: 16_384,
    vision: true,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    inputPrice: 0.15,
    outputPrice: 0.6,
    contextWindow: 128_000,
    maxOutput: 16_384,
  },

  // ─── OpenAI O-series (Reasoning) ───
  {
    id: "openai/o3",
    name: "o3",
    inputPrice: 2.0,
    outputPrice: 8.0,
    contextWindow: 200_000,
    maxOutput: 100_000,
    reasoning: true,
  },
  {
    id: "openai/o3-mini",
    name: "o3-mini",
    inputPrice: 1.1,
    outputPrice: 4.4,
    contextWindow: 128_000,
    maxOutput: 65_536,
    reasoning: true,
  },
  {
    id: "openai/o4-mini",
    name: "o4-mini",
    inputPrice: 1.1,
    outputPrice: 4.4,
    contextWindow: 128_000,
    maxOutput: 65_536,
    reasoning: true,
  },

  // ─── OpenAI Codex ───
  {
    id: "openai/codex-mini",
    name: "Codex Mini",
    inputPrice: 1.5,
    outputPrice: 6.0,
    contextWindow: 200_000,
    maxOutput: 100_000,
    reasoning: true,
  },

  // ─── Anthropic ───
  {
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    inputPrice: 5.0,
    outputPrice: 25.0,
    contextWindow: 1_000_000,
    maxOutput: 32_000,
    reasoning: true,
    vision: true,
  },
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    inputPrice: 5.0,
    outputPrice: 25.0,
    contextWindow: 200_000,
    maxOutput: 32_000,
    reasoning: true,
    vision: true,
  },
  {
    id: "anthropic/claude-opus-4",
    name: "Claude Opus 4",
    inputPrice: 15.0,
    outputPrice: 75.0,
    contextWindow: 200_000,
    maxOutput: 32_000,
    reasoning: true,
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    inputPrice: 3.0,
    outputPrice: 15.0,
    contextWindow: 200_000,
    maxOutput: 64_000,
    reasoning: true,
    vision: true,
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    inputPrice: 3.0,
    outputPrice: 15.0,
    contextWindow: 200_000,
    maxOutput: 64_000,
    reasoning: true,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    inputPrice: 1.0,
    outputPrice: 5.0,
    contextWindow: 200_000,
    maxOutput: 8_192,
  },

  // ─── Google Gemini ───
  {
    id: "google/gemini-3-pro-preview",
    name: "Gemini 3 Pro Preview",
    inputPrice: 2.0,
    outputPrice: 12.0,
    contextWindow: 1_050_000,
    maxOutput: 65_536,
    reasoning: true,
    vision: true,
  },
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    inputPrice: 0.5,
    outputPrice: 3.0,
    contextWindow: 1_050_000,
    maxOutput: 65_536,
    vision: true,
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    inputPrice: 1.25,
    outputPrice: 10.0,
    contextWindow: 1_050_000,
    maxOutput: 65_536,
    reasoning: true,
    vision: true,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    inputPrice: 0.15,
    outputPrice: 0.6,
    contextWindow: 1_000_000,
    maxOutput: 65_536,
  },
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    inputPrice: 0.1,
    outputPrice: 0.4,
    contextWindow: 1_050_000,
    maxOutput: 65_536,
    vision: true,
  },

  // ─── DeepSeek ───
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    inputPrice: 0.28,
    outputPrice: 0.43,
    contextWindow: 128_000,
    maxOutput: 8_192,
    reasoning: true,
  },
  {
    id: "deepseek/deepseek-reasoner",
    name: "DeepSeek Reasoner",
    inputPrice: 0.28,
    outputPrice: 0.42,
    contextWindow: 128_000,
    maxOutput: 8_192,
    reasoning: true,
  },

  // ─── xAI / Grok ───
  {
    id: "x-ai/grok-4.1-fast",
    name: "Grok 4.1 Fast",
    inputPrice: 0.2,
    outputPrice: 0.5,
    contextWindow: 2_000_000,
    maxOutput: 30_000,
    reasoning: true,
    vision: true,
  },
  {
    id: "x-ai/grok-4-fast",
    name: "Grok 4 Fast",
    inputPrice: 0.4,
    outputPrice: 1.0,
    contextWindow: 2_000_000,
    maxOutput: 30_000,
    reasoning: true,
    vision: true,
  },
  {
    id: "x-ai/grok-3",
    name: "Grok 3",
    inputPrice: 3.0,
    outputPrice: 15.0,
    contextWindow: 131_072,
    maxOutput: 16_384,
    reasoning: true,
  },
  {
    id: "x-ai/grok-3-mini",
    name: "Grok 3 Mini",
    inputPrice: 0.3,
    outputPrice: 0.5,
    contextWindow: 131_072,
    maxOutput: 16_384,
  },

  // ─── Alibaba / Qwen ───
  {
    id: "qwen/qwen3-max",
    name: "Qwen3-Max",
    inputPrice: 1.2,
    outputPrice: 6.0,
    contextWindow: 256_000,
    maxOutput: 32_000,
    reasoning: true,
  },
  {
    id: "qwen/qwen3-coder-plus",
    name: "Qwen3-Coder-Plus",
    inputPrice: 1.0,
    outputPrice: 5.0,
    contextWindow: 1_000_000,
    maxOutput: 65_536,
    reasoning: true,
  },
  {
    id: "qwen/qwen3-vl-plus",
    name: "Qwen3-VL-Plus",
    inputPrice: 0.8,
    outputPrice: 4.0,
    contextWindow: 128_000,
    maxOutput: 32_000,
    vision: true,
  },

  // ─── Z.AI / GLM ───
  {
    id: "z-ai/glm-4.7",
    name: "GLM 4.7",
    inputPrice: 0.28,
    outputPrice: 1.14,
    contextWindow: 200_000,
    maxOutput: 128_000,
    reasoning: true,
  },
  {
    id: "z-ai/glm-4.6",
    name: "GLM 4.6",
    inputPrice: 0.28,
    outputPrice: 1.14,
    contextWindow: 200_000,
    maxOutput: 128_000,
    reasoning: true,
  },
  {
    id: "z-ai/glm-4.6v-flash-free",
    name: "GLM 4.6V Flash (Free)",
    inputPrice: 0.0,
    outputPrice: 0.0,
    contextWindow: 200_000,
    maxOutput: 128_000,
    vision: true,
  },

  // ─── Moonshot / Kimi ───
  {
    id: "moonshotai/kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    inputPrice: 0.6,
    outputPrice: 2.5,
    contextWindow: 262_144,
    maxOutput: 262_144,
    reasoning: true,
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    inputPrice: 0.5,
    outputPrice: 2.4,
    contextWindow: 262_144,
    maxOutput: 8_192,
    reasoning: true,
    vision: true,
  },

  // ─── Mistral ───
  {
    id: "mistralai/mistral-large-2512",
    name: "Mistral Large 3",
    inputPrice: 0.5,
    outputPrice: 1.5,
    contextWindow: 256_000,
    maxOutput: 256_000,
    vision: true,
  },

  // ─── Baidu / ERNIE ───
  {
    id: "baidu/ernie-5.0-thinking-preview",
    name: "ERNIE-5.0 Thinking Preview",
    inputPrice: 0.84,
    outputPrice: 3.37,
    contextWindow: 128_000,
    maxOutput: 64_000,
    reasoning: true,
    vision: true,
  },

  // ─── Volcengine / Doubao ───
  {
    id: "volcengine/doubao-seed-code",
    name: "Doubao-Seed-Code",
    inputPrice: 0.17,
    outputPrice: 1.12,
    contextWindow: 256_000,
    maxOutput: 32_000,
  },

  // ─── inclusionAI ───
  {
    id: "inclusionai/ling-1t",
    name: "Ling-1T",
    inputPrice: 0.56,
    outputPrice: 2.24,
    contextWindow: 128_000,
    maxOutput: 32_000,
    reasoning: true,
  },

  // ─── Xiaomi ───
  {
    id: "xiaomi/mimo-v2-flash",
    name: "MiMo-V2-Flash",
    inputPrice: 0.0,
    outputPrice: 0.0,
    contextWindow: 262_144,
    maxOutput: 262_144,
    reasoning: true,
  },

  // ─── Kuaishou ───
  {
    id: "kuaishou/kat-coder-pro-v1",
    name: "KAT-Coder-Pro V1",
    inputPrice: 0.0,
    outputPrice: 0.0,
    contextWindow: 256_000,
    maxOutput: 32_000,
  },
];

/**
 * Convert ZenMux model definitions to OpenClaw ModelDefinitionConfig format.
 */
function toOpenClawModel(m: ZenMuxModel): ModelDefinitionConfig {
  return {
    id: m.id,
    name: m.name,
    api: "openai-completions",
    reasoning: m.reasoning ?? false,
    input: m.vision ? ["text", "image"] : ["text"],
    cost: {
      input: m.inputPrice,
      output: m.outputPrice,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: m.contextWindow,
    maxTokens: m.maxOutput,
  };
}

/**
 * All ZenMux models in OpenClaw format.
 */
export const OPENCLAW_MODELS: ModelDefinitionConfig[] = ZENMUX_MODELS.map(toOpenClawModel);

/**
 * Build a ModelProviderConfig for ZenMux.
 *
 * @param baseUrl - The proxy's local base URL (e.g., "http://127.0.0.1:8403")
 */
export function buildProviderModels(baseUrl: string): ModelProviderConfig {
  return {
    baseUrl: `${baseUrl}/v1`,
    api: "openai-completions",
    models: OPENCLAW_MODELS,
  };
}
