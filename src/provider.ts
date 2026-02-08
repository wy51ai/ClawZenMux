/**
 * ZenMux ProviderPlugin for OpenClaw
 *
 * Registers ZenMux as an LLM provider in OpenClaw.
 * Uses a local proxy to add smart routing and deduplication —
 * pi-ai sees a standard OpenAI-compatible API at localhost.
 */

import type { ProviderPlugin } from "./types.js";
import { buildProviderModels } from "./models.js";
import { zenmuxApiKeyAuth } from "./auth.js";
import type { ProxyHandle } from "./proxy.js";

/**
 * State for the running proxy (set when the plugin activates).
 */
let activeProxy: ProxyHandle | null = null;

/**
 * Update the proxy handle (called from index.ts when the proxy starts).
 */
export function setActiveProxy(proxy: ProxyHandle): void {
  activeProxy = proxy;
}

export function getActiveProxy(): ProxyHandle | null {
  return activeProxy;
}

/**
 * ZenMux provider plugin definition.
 */
export const zenmuxProvider: ProviderPlugin = {
  id: "clawzenmux",
  label: "ClawZenMux",
  docsPath: "https://docs.zenmux.ai",
  aliases: ["czm", "zenmux"],
  envVars: ["ZENMUX_API_KEY"],

  // Model definitions — dynamically set to proxy URL
  get models() {
    if (!activeProxy) {
      // Fallback: point to ZenMux API directly
      return buildProviderModels("https://zenmux.ai/api");
    }
    return buildProviderModels(activeProxy.baseUrl);
  },

  // Auth via API key (interactive wizard)
  auth: [zenmuxApiKeyAuth],

  // Extract API key from stored credential for Authorization header
  formatApiKey(cred) {
    return cred.apiKey as string;
  },
};
