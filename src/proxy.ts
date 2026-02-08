/**
 * Local Proxy Server for ZenMux
 *
 * Sits between OpenClaw's pi-ai (which makes standard OpenAI-format requests)
 * and ZenMux's API (which uses Bearer token auth).
 *
 * Flow:
 *   pi-ai → http://localhost:{port}/v1/chat/completions
 *        → proxy adds auth + smart routing
 *        → forwards to https://zenmux.ai/api/v1/chat/completions
 *        → streams response back to pi-ai
 *
 * Features:
 *   - Smart routing: "clawzenmux/auto" → rules-based scoring picks cheapest model
 *   - Dynamic models: fetches latest models/pricing from ZenMux API
 *   - SSE heartbeat: prevents OpenClaw's timeout for streaming requests
 *   - Response dedup: prevents double-charging on retries
 *   - Usage logging: JSON line logs to ~/.openclaw/zenmux/logs/
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  route,
  DEFAULT_ROUTING_CONFIG,
  type RouterOptions,
  type RoutingDecision,
  type RoutingConfig,
  type ModelPricing,
  type Tier,
} from "./router/index.js";
import { ZENMUX_MODELS } from "./models.js";
import type { ZenMuxModel } from "./models.js";
import { fetchModels } from "./model-sync.js";
import { logUsage, type UsageEntry } from "./logger.js";
import { RequestDeduplicator } from "./dedup.js";
import { fetchWithRetry } from "./retry.js";

const ZENMUX_API = "https://zenmux.ai/api";
const AUTO_MODEL = "clawzenmux/auto";
const AUTO_MODEL_SHORT = "auto";
const USER_AGENT = "clawzenmux/0.1.0";
const HEARTBEAT_INTERVAL_MS = 2_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000; // 3 minutes
const DEFAULT_PORT = 8403;
const TIER_OVERRIDE_REGEX = /\bUSE\s+(SIMPLE|MEDIUM|COMPLEX|REASONING)\b/i;
const TIER_OVERRIDE_REGEX_GLOBAL = /\bUSE\s+(SIMPLE|MEDIUM|COMPLEX|REASONING)\b/gi;

type ContentPart = { type: string; text?: string };
type ChatMessage = { role: string; content?: string | ContentPart[] };

function extractText(content: string | ContentPart[] | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("\n");
  }
  return "";
}

function parseForcedTier(text: string): Tier | undefined {
  const match = text.match(TIER_OVERRIDE_REGEX);
  if (!match) return undefined;
  return match[1].toUpperCase() as Tier;
}

function stripForcedTierDirective(text: string): string {
  return text.replace(TIER_OVERRIDE_REGEX_GLOBAL, "").replace(/[ \t]{2,}/g, " ").trim();
}

function extractAndStripForcedTier(message: ChatMessage | undefined): Tier | undefined {
  if (!message || message.content === undefined) return undefined;

  if (typeof message.content === "string") {
    const forcedTier = parseForcedTier(message.content);
    if (forcedTier) {
      message.content = stripForcedTierDirective(message.content);
    }
    return forcedTier;
  }

  if (Array.isArray(message.content)) {
    let forcedTier: Tier | undefined;
    message.content = message.content.map((part) => {
      if (part.type !== "text" || typeof part.text !== "string") return part;

      const partForcedTier = parseForcedTier(part.text);
      if (!forcedTier && partForcedTier) {
        forcedTier = partForcedTier;
      }
      if (!partForcedTier) return part;

      return {
        ...part,
        text: stripForcedTierDirective(part.text),
      };
    });
    return forcedTier;
  }

  return undefined;
}

export type ProxyOptions = {
  apiKey: string;
  apiBase?: string;
  /** Port to listen on (default: 8403) */
  port?: number;
  routingConfig?: Partial<RoutingConfig>;
  /** Request timeout in ms (default: 180000 = 3 minutes). */
  requestTimeoutMs?: number;
  onReady?: (port: number) => void;
  onError?: (error: Error) => void;
  onRouted?: (decision: RoutingDecision) => void;
  onModelsSynced?: (count: number) => void;
};

export type ProxyHandle = {
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
};

/**
 * Build model pricing map from a models array.
 */
function buildModelPricing(models: ZenMuxModel[]): Map<string, ModelPricing> {
  const map = new Map<string, ModelPricing>();
  for (const m of models) {
    if (m.id === AUTO_MODEL) continue;
    map.set(m.id, { inputPrice: m.inputPrice, outputPrice: m.outputPrice });
  }
  return map;
}

/**
 * Merge partial routing config overrides with defaults.
 */
function mergeRoutingConfig(overrides?: Partial<RoutingConfig>): RoutingConfig {
  if (!overrides) return DEFAULT_ROUTING_CONFIG;
  return {
    ...DEFAULT_ROUTING_CONFIG,
    ...overrides,
    classifier: { ...DEFAULT_ROUTING_CONFIG.classifier, ...overrides.classifier },
    scoring: { ...DEFAULT_ROUTING_CONFIG.scoring, ...overrides.scoring },
    tiers: { ...DEFAULT_ROUTING_CONFIG.tiers, ...overrides.tiers },
    overrides: { ...DEFAULT_ROUTING_CONFIG.overrides, ...overrides.overrides },
  };
}

/**
 * Start the local proxy server.
 *
 * Returns a handle with the assigned port, base URL, and a close function.
 */
export async function startProxy(options: ProxyOptions): Promise<ProxyHandle> {
  const apiBase = options.apiBase ?? ZENMUX_API;
  const apiKey = options.apiKey;

  // Build router options
  const routingConfig = mergeRoutingConfig(options.routingConfig);

  // Try to fetch dynamic models, fall back to static catalog
  let models: ZenMuxModel[];
  try {
    models = await fetchModels(apiKey);
    options.onModelsSynced?.(models.length);
  } catch {
    models = ZENMUX_MODELS;
  }

  const modelPricing = buildModelPricing(models);

  const routerOpts: RouterOptions = {
    config: routingConfig,
    modelPricing,
  };

  // Request deduplicator (shared across all requests)
  const deduplicator = new RequestDeduplicator();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.url === "/health" || req.url?.startsWith("/health?")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          provider: "zenmux",
          models: models.length,
        }),
      );
      return;
    }

    // Only proxy paths starting with /v1
    if (!req.url?.startsWith("/v1")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    try {
      await proxyRequest(req, res, apiBase, apiKey, options, routerOpts, deduplicator);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);

      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: `Proxy error: ${error.message}`, type: "proxy_error" },
          }),
        );
      } else if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ error: { message: error.message, type: "proxy_error" } })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  });

  // Listen on requested port (default: 8403)
  const listenPort = options.port ?? DEFAULT_PORT;

  return new Promise<ProxyHandle>((resolve, reject) => {
    server.on("error", reject);

    server.listen(listenPort, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port;
      const baseUrl = `http://127.0.0.1:${port}`;

      options.onReady?.(port);

      resolve({
        port,
        baseUrl,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

/**
 * Proxy a single request to ZenMux API with smart routing and dedup.
 */
async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  apiBase: string,
  apiKey: string,
  options: ProxyOptions,
  routerOpts: RouterOptions,
  deduplicator: RequestDeduplicator,
): Promise<void> {
  const startTime = Date.now();

  // Build upstream URL
  const upstreamUrl = `${apiBase}${req.url}`;

  // Collect request body
  const bodyChunks: Buffer[] = [];
  for await (const chunk of req) {
    bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  let body = Buffer.concat(bodyChunks);

  // --- Smart routing ---
  let routingDecision: RoutingDecision | undefined;
  let isStreaming = false;
  let modelId = "";
  const isChatCompletion = req.url?.includes("/chat/completions");

  if (isChatCompletion && body.length > 0) {
    try {
      const parsed = JSON.parse(body.toString()) as Record<string, unknown>;
      isStreaming = parsed.stream === true;
      modelId = (parsed.model as string) || "";
      const maxTokens =
        typeof parsed.max_completion_tokens === "number"
          ? parsed.max_completion_tokens
          : typeof parsed.max_tokens === "number"
            ? parsed.max_tokens
            : 4096;

      if (parsed.model === AUTO_MODEL || parsed.model === AUTO_MODEL_SHORT) {
        // Extract prompt from messages
        const messages = Array.isArray(parsed.messages)
          ? (parsed.messages as ChatMessage[])
          : undefined;

        let lastUserMsg: ChatMessage | undefined;
        if (messages) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
              lastUserMsg = messages[i];
              break;
            }
          }
        }
        const systemMsg = messages?.find((m: ChatMessage) => m.role === "system");
        const forcedTier = extractAndStripForcedTier(lastUserMsg);
        const prompt = extractText(lastUserMsg?.content);
        const systemPrompt = extractText(systemMsg?.content) || undefined;
        const allMessageText =
          messages
            ?.map((m) => extractText(m.content))
            .filter((s) => s.length > 0)
            .join("\n") ?? "";
        const estimatedInputTokens =
          allMessageText.length > 0 ? Math.ceil(allMessageText.length / 4) : undefined;
        const structuredOutputRequired =
          typeof parsed.response_format === "object" && parsed.response_format !== null;

        routingDecision = route(prompt, systemPrompt, maxTokens, routerOpts, {
          estimatedInputTokens,
          forcedTier,
          structuredOutputRequired,
        });

        // Replace model in body
        parsed.model = routingDecision.model;
        modelId = routingDecision.model;
        body = Buffer.from(JSON.stringify(parsed));

        options.onRouted?.(routingDecision);
      }
    } catch {
      // JSON parse error — forward body as-is
    }
  }

  // --- Dedup check ---
  const dedupKey = RequestDeduplicator.hash(body);

  const cached = deduplicator.getCached(dedupKey);
  if (cached) {
    res.writeHead(cached.status, cached.headers);
    res.end(cached.body);
    return;
  }

  const inflight = deduplicator.getInflight(dedupKey);
  if (inflight) {
    const result = await inflight;
    res.writeHead(result.status, result.headers);
    res.end(result.body);
    return;
  }

  deduplicator.markInflight(dedupKey);

  // --- Streaming: early header flush + heartbeat ---
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
  let headersSentEarly = false;

  if (isStreaming) {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    headersSentEarly = true;

    res.write(": heartbeat\n\n");

    heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": heartbeat\n\n");
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  // Forward headers, stripping host, connection, and content-length
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      key === "host" ||
      key === "connection" ||
      key === "transfer-encoding" ||
      key === "content-length"
    )
      continue;
    if (typeof value === "string") {
      headers[key] = value;
    }
  }
  if (!headers["content-type"]) {
    headers["content-type"] = "application/json";
  }
  headers["user-agent"] = USER_AGENT;
  headers["authorization"] = `Bearer ${apiKey}`;

  // --- Client disconnect cleanup ---
  let completed = false;
  res.on("close", () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = undefined;
    }
    if (!completed) {
      deduplicator.removeInflight(dedupKey);
    }
  });

  // --- Request timeout ---
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetchWithRetry(
      (url, init) => fetch(url, init),
      upstreamUrl,
      {
        method: req.method ?? "POST",
        headers,
        body: body.length > 0 ? body : undefined,
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = undefined;
    }

    // --- Stream response and collect for dedup cache ---
    const responseChunks: Buffer[] = [];

    if (headersSentEarly) {
      // Streaming: headers already sent. Check for upstream errors.
      if (upstream.status !== 200) {
        const errBody = await upstream.text();
        const errEvent = `data: ${JSON.stringify({ error: { message: errBody, type: "upstream_error", status: upstream.status } })}\n\n`;
        res.write(errEvent);
        res.write("data: [DONE]\n\n");
        res.end();

        deduplicator.complete(dedupKey, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: Buffer.from(errEvent + "data: [DONE]\n\n"),
          completedAt: Date.now(),
        });
        return;
      }

      // Pipe upstream SSE data to client
      if (upstream.body) {
        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
            responseChunks.push(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
      }

      res.end();

      deduplicator.complete(dedupKey, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: Buffer.concat(responseChunks),
        completedAt: Date.now(),
      });
    } else {
      // Non-streaming: forward status and headers from upstream
      const responseHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, key) => {
        if (key === "transfer-encoding" || key === "connection") return;
        responseHeaders[key] = value;
      });

      res.writeHead(upstream.status, responseHeaders);

      if (upstream.body) {
        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
            responseChunks.push(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
      }

      res.end();

      deduplicator.complete(dedupKey, {
        status: upstream.status,
        headers: responseHeaders,
        body: Buffer.concat(responseChunks),
        completedAt: Date.now(),
      });
    }

    completed = true;
  } catch (err) {
    clearTimeout(timeoutId);

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = undefined;
    }

    deduplicator.removeInflight(dedupKey);

    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }

    throw err;
  }

  // --- Usage logging (fire-and-forget) ---
  if (routingDecision) {
    const entry: UsageEntry = {
      timestamp: new Date().toISOString(),
      model: routingDecision.model,
      cost: routingDecision.costEstimate,
      latencyMs: Date.now() - startTime,
    };
    logUsage(entry).catch(() => {});
  }
}
