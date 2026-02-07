/**
 * ZenMux API Key Resolution
 *
 * Resolves the ZenMux API key from multiple sources:
 *   1. Plugin config (explicit apiKey field)
 *   2. Saved file (~/.openclaw/zenmux/api.key)
 *   3. Environment variable (ZENMUX_API_KEY)
 *
 * Also provides a ProviderAuthMethod for the interactive wizard.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ProviderAuthMethod, ProviderAuthContext } from "./types.js";

const ZENMUX_DIR = join(homedir(), ".openclaw", "zenmux");
const KEY_PATH = join(ZENMUX_DIR, "api.key");

export type ApiKeyResult = {
  key: string;
  source: "config" | "saved" | "env";
};

/**
 * Resolve API key from available sources.
 * Returns null if no key is found (user needs to configure one).
 */
export function resolveApiKey(pluginConfig?: Record<string, unknown>): ApiKeyResult | null {
  // 1. Plugin config
  if (pluginConfig?.apiKey && typeof pluginConfig.apiKey === "string") {
    return { key: pluginConfig.apiKey, source: "config" };
  }

  // 2. Saved file
  if (existsSync(KEY_PATH)) {
    try {
      const key = readFileSync(KEY_PATH, "utf-8").trim();
      if (key) {
        return { key, source: "saved" };
      }
    } catch {
      // Fall through
    }
  }

  // 3. Environment variable
  const envKey = process.env.ZENMUX_API_KEY;
  if (envKey) {
    return { key: envKey, source: "env" };
  }

  return null;
}

/**
 * Save API key to persistent storage.
 */
export function saveApiKey(key: string): void {
  if (!existsSync(ZENMUX_DIR)) {
    mkdirSync(ZENMUX_DIR, { recursive: true });
  }
  writeFileSync(KEY_PATH, key, { mode: 0o600 });
}

/**
 * Interactive auth method — prompts user to enter their ZenMux API key.
 */
export const zenmuxApiKeyAuth: ProviderAuthMethod = {
  id: "api_key",
  label: "ZenMux API Key",
  hint: "Get your API key from https://zenmux.ai/console/api-keys",
  kind: "api_key",

  async run(ctx: ProviderAuthContext) {
    ctx.prompter.note(
      "Sign in at https://zenmux.ai and create an API key from Console > API Keys.",
    );

    const key = await ctx.prompter.text({
      message: "Enter your ZenMux API key:",
      validate: (value: string) => {
        if (!value.trim()) return "API key is required";
        return undefined;
      },
    });

    if (typeof key === "symbol") {
      return { profiles: [] }; // Cancelled
    }

    // Save the key for future use
    saveApiKey(key.trim());

    return {
      profiles: [
        {
          profileId: "default",
          credential: { apiKey: key.trim() },
        },
      ],
      notes: ["API key saved to ~/.openclaw/zenmux/api.key"],
    };
  },
};
