/**
 * @wy51ai/clawzenmux
 *
 * Smart LLM router for OpenClaw via ZenMux — 90+ models, AI-powered routing,
 * multi-language support, token cost savings.
 *
 * Usage:
 *   # Install the plugin
 *   openclaw plugin install @wy51ai/clawzenmux
 *
 *   # Set your ZenMux API key
 *   export ZENMUX_API_KEY=your-key-here
 *
 *   # Use smart routing (auto-picks cheapest model)
 *   openclaw models set clawzenmux/auto
 *
 *   # Or use any specific ZenMux model
 *   openclaw models set openai/gpt-5.2
 */

import type { OpenClawPluginDefinition, OpenClawPluginApi } from "./types.js";
import { zenmuxProvider, setActiveProxy } from "./provider.js";
import { startProxy } from "./proxy.js";
import { resolveApiKey } from "./auth.js";
import type { RoutingConfig } from "./router/index.js";
import { OPENCLAW_MODELS } from "./models.js";
import { AuthenticationError } from "./errors.js";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Inject ZenMux models config into OpenClaw config file.
 */
function injectModelsConfig(logger: { info: (msg: string) => void }, apiKey?: string): void {
  const configPath = join(homedir(), ".openclaw", "openclaw.json");
  if (!existsSync(configPath)) {
    logger.info("OpenClaw config not found, skipping models injection");
    return;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));

    // Clean up old "zenmux" key if present
    if (config.models?.providers?.zenmux) {
      delete config.models.providers.zenmux;
    }

    if (config.models?.providers?.clawzenmux) {
      return; // Already configured
    }

    if (!config.models) config.models = {};
    if (!config.models.providers) config.models.providers = {};

    config.models.providers.clawzenmux = {
      baseUrl: "http://127.0.0.1:8403/v1",
      api: "openai-completions",
      ...(apiKey ? { apiKey } : {}),
      models: OPENCLAW_MODELS,
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.info("Injected ClawZenMux models into OpenClaw config");
  } catch {
    // Silently fail — config injection is best-effort
  }
}

/**
 * Inject auth profile for ZenMux into agent auth stores.
 */
function injectAuthProfile(
  logger: { info: (msg: string) => void },
  apiKey: string,
): void {
  const agentsDir = join(homedir(), ".openclaw", "agents");
  if (!existsSync(agentsDir)) {
    return;
  }

  try {
    const agents = readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const agentId of agents) {
      const authDir = join(agentsDir, agentId, "agent");
      const authPath = join(authDir, "auth-profiles.json");

      if (!existsSync(authDir)) {
        mkdirSync(authDir, { recursive: true });
      }

      let authProfiles: Record<string, unknown> = {};
      if (existsSync(authPath)) {
        try {
          authProfiles = JSON.parse(readFileSync(authPath, "utf-8"));
        } catch {
          authProfiles = {};
        }
      }

      if (authProfiles.clawzenmux) {
        continue;
      }

      authProfiles.clawzenmux = {
        profileId: "default",
        credential: {
          apiKey: apiKey,
        },
      };

      writeFileSync(authPath, JSON.stringify(authProfiles, null, 2));
      logger.info(`Injected ZenMux auth profile for agent: ${agentId}`);
    }
  } catch {
    // Silently fail — auth injection is best-effort
  }
}

/**
 * Start the proxy in the background.
 */
async function startProxyInBackground(api: OpenClawPluginApi): Promise<void> {
  // Resolve API key
  const keyResult = resolveApiKey(api.pluginConfig);

  if (!keyResult) {
    throw new AuthenticationError();
  }

  const { key: apiKey, source } = keyResult;

  if (source === "config") {
    api.logger.info("Using API key from plugin config");
  } else if (source === "saved") {
    api.logger.info("Using saved API key from ~/.openclaw/zenmux/api.key");
  } else {
    api.logger.info("Using API key from ZENMUX_API_KEY env var");
  }

  // Inject auth profiles with the resolved key
  injectAuthProfile(api.logger, apiKey);

  // Resolve config overrides from plugin config
  const routingConfig = api.pluginConfig?.routing as Partial<RoutingConfig> | undefined;

  const proxy = await startProxy({
    apiKey,
    routingConfig,
    onReady: (port) => {
      api.logger.info(`ZenMux proxy listening on port ${port}`);
    },
    onError: (error) => {
      api.logger.error(`ZenMux proxy error: ${error.message}`);
    },
    onRouted: (decision) => {
      const cost = decision.costEstimate.toFixed(4);
      const saved = (decision.savings * 100).toFixed(0);
      api.logger.info(`${decision.tier} → ${decision.model} $${cost} (saved ${saved}%) | ${decision.reasoning}`);
    },
    onModelsSynced: (count) => {
      api.logger.info(`Synced ${count} models from ZenMux API`);
    },
  });

  setActiveProxy(proxy);

  api.logger.info(
    `ZenMux provider active — ${proxy.baseUrl}/v1 (routing: rules only)`,
  );
}

const plugin: OpenClawPluginDefinition = {
  id: "clawzenmux",
  name: "ClawZenMux",
  description:
    "Smart LLM router via ZenMux — 90+ models, rules-based routing, token cost savings",
  version: "0.1.0",

  register(api: OpenClawPluginApi) {
    // Register ZenMux as a provider (sync — available immediately)
    api.registerProvider(zenmuxProvider);

    // Resolve API key early so we can inject it into configs
    const keyResult = resolveApiKey(api.pluginConfig);
    const apiKey = keyResult?.key;

    // Inject models config into OpenClaw config file
    injectModelsConfig(api.logger, apiKey);

    // Set runtime config for immediate availability
    if (!api.config.models) {
      api.config.models = { providers: {} };
    }
    if (!api.config.models.providers) {
      api.config.models.providers = {};
    }
    api.config.models.providers.clawzenmux = {
      baseUrl: "http://127.0.0.1:8403/v1",
      api: "openai-completions",
      ...(apiKey ? { apiKey } : {}),
      models: OPENCLAW_MODELS,
    };

    api.logger.info(`ClawZenMux provider registered (${OPENCLAW_MODELS.length} models)`);
    api.logger.info(`Registered model IDs: ${OPENCLAW_MODELS.slice(0, 5).map(m => m.id).join(", ")}...`);

    // Start proxy in background (fire-and-forget)
    startProxyInBackground(api).catch((err) => {
      api.logger.error(
        `Failed to start ZenMux proxy: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  },
};

export default plugin;

// Re-export for programmatic use
export { startProxy } from "./proxy.js";
export type { ProxyOptions, ProxyHandle } from "./proxy.js";
export { zenmuxProvider } from "./provider.js";
export { OPENCLAW_MODELS, ZENMUX_MODELS, buildProviderModels } from "./models.js";
export type { ZenMuxModel } from "./models.js";
export { route, DEFAULT_ROUTING_CONFIG } from "./router/index.js";
export type { RoutingDecision, RoutingConfig, Tier } from "./router/index.js";
export { fetchModels, invalidateModelCache } from "./model-sync.js";
export { logUsage } from "./logger.js";
export type { UsageEntry } from "./logger.js";
export { RequestDeduplicator } from "./dedup.js";
export type { CachedResponse } from "./dedup.js";
export { resolveApiKey, saveApiKey, zenmuxApiKeyAuth } from "./auth.js";
export { fetchWithRetry, isRetryable, DEFAULT_RETRY_CONFIG } from "./retry.js";
export type { RetryConfig } from "./retry.js";
export {
  AuthenticationError,
  InvalidApiKeyError,
  isAuthenticationError,
  isInvalidApiKeyError,
} from "./errors.js";
