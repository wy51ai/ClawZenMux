# ClawZenMux

English | **[中文](README.md)**

Smart LLM routing plugin for OpenClaw — access 100+ models through [ZenMux](https://zenmux.ai) unified gateway, automatically select the cheapest model for each request, saving 78-96% on token costs.

> **Note**: This is a community third-party plugin, not officially maintained by OpenClaw or ZenMux. PRs are welcome!
>
> This plugin is built upon the [ClawRouter](https://github.com/BlockRunAI/ClawRouter) architecture, removing blockchain/x402 payment in favor of ZenMux unified gateway + API Key auth for a lighter, simpler setup. Thanks to the ClawRouter author for open-sourcing the project!

## How It Works

```
OpenClaw Agent
  │
  ▼  POST /v1/chat/completions  { model: "clawzenmux/auto", messages: [...] }
  │
  ▼  localhost:8513 (ClawZenMux Local Proxy)
  │
  ├─ 1. Parse request, extract user prompt
  ├─ 2. Rule engine scoring (14-dim weighted, <1ms, zero cost)
  ├─ 3. Select cheapest model based on complexity
  ├─ 4. Replace model field, forward to ZenMux API
  ├─ 5. Stream response back to Agent
  └─ 6. Log usage
```

**Core idea**: Simple questions use cheap models (DeepSeek $0.28/M), medium questions use balanced models (Gemini 3 Flash), complex questions use powerful models (Claude $3/M), reasoning questions use specialized models (DeepSeek Reasoner). Just set `clawzenmux/auto` and the router decides automatically.

## Quick Start

### 1. Get a ZenMux API Key

Sign up at [zenmux.ai](https://zenmux.ai) and create a key under Console > API Keys.

### 2. Install the Plugin

```bash
openclaw plugins install @wy51ai/clawzenmux
```

### 3. Configure API Key (pick one)

```bash
# Option 1: Environment variable (recommended)
export ZENMUX_API_KEY=your-key-here

# Option 2: Save to file
echo "your-key-here" > ~/.openclaw/zenmux/api.key

# Option 3: In openclaw.json
# See "Configuration" section below
```

### 4. Use Smart Routing

```bash
# Auto-select the best model
openclaw models set clawzenmux/auto
```

### 5. Prompt-Based Tier Override (Optional)

When using `clawzenmux/auto`, you can add a directive in your message to force a tier:

```text
USE SIMPLE
USE MEDIUM
USE COMPLEX
USE REASONING
```

Example:

```text
USE COMPLEX Design a distributed message queue architecture
```

Notes:
- Only takes effect when `model=clawzenmux/auto` (or `auto`)
- The proxy strips the `USE ...` directive before forwarding, so it won't pollute the actual prompt
- If no directive is present, the default rule engine is used

## Smart Routing Details

### Four-Tier Classification

| Tier | Default Model | Price ($/M tokens) | Use Case |
|------|--------------|-------------------|----------|
| **SIMPLE** | deepseek/deepseek-chat | $0.28 / $0.43 | Simple Q&A, translation, definitions |
| **MEDIUM** | google/gemini-3-flash-preview | $0.5 / $3 | General coding, summaries, explanations |
| **COMPLEX** | anthropic/claude-sonnet-4.5 | $3.00 / $15.00 | Complex code, architecture design, multi-step analysis |
| **REASONING** | deepseek/deepseek-reasoner | $0.28 / $0.42 | Math proofs, logical deduction, theorem proving |

### Rule Engine (<1ms, Free)

100% local rule-based scoring, no external API calls. Scores prompts across 14 weighted dimensions and maps the total score to a tier. Keywords cover English, Chinese, Japanese, and Russian:

| Dimension | Weight | Detection | Multilingual Keywords |
|-----------|--------|-----------|----------------------|
| Reasoning markers | 0.18 | Proof/deduction prompts | prove, theorem / 证明, 推导 / 証明, 定理 / доказать |
| Code presence | 0.15 | Code-related content | function, class, \`\`\` / 函数, 类 / 関数 / функция |
| Simple indicators | 0.12 | Simple question markers | what is, hello / 什么是, 你好 / とは / что такое |
| Multi-step patterns | 0.12 | Multi-step tasks | first...then, step 1, 1. 2. 3. |
| Technical terms | 0.10 | Technical vocabulary | algorithm / 算法 / アルゴリズム / алгоритм |
| Token count | 0.08 | Input length | <50 tokens → simple, >500 → complex |
| Creative markers | 0.05 | Creative writing | story, poem / 故事, 诗 / 物語 / история |
| Question complexity | 0.05 | Multiple question marks | More than 3 ? |
| Constraints | 0.04 | Limiting conditions | at most / 不超过 / 以下 / не более |
| Command verbs | 0.03 | Build instructions | build, create / 构建, 创建 / 構築 / создать |
| Output format | 0.03 | Structured output | json, yaml / 表格 / テーブル / таблица |
| Reference complexity | 0.02 | Context references | above, the docs / 上面, 文档 / 上記 / выше |
| Domain specificity | 0.02 | Specialized domains | quantum, fpga / 量子 / 量子 / квантовый |
| Negation complexity | 0.01 | Negation constraints | don't, avoid / 不要, 避免 / しないで / избегать |

**Scoring logic**:
```
Weighted total = Σ(dimension score × weight)

Total < 0.0   → SIMPLE
0.0 ~ 0.15    → MEDIUM
0.15 ~ 0.25   → COMPLEX
≥ 0.25        → REASONING

Special rules: 2+ reasoning keywords hit → directly classified as REASONING
Architecture signals (architecture/架构 + distributed/message queue/sharding/failover/QPS/multi-tenant, etc.) → directly classified as COMPLEX
Confidence < 0.6 → marked as "ambiguous", falls back to default tier (MEDIUM)
```

### Override Rules

- **Large context** (>100k tokens) → forced COMPLEX
- **Structured output** (system prompt contains json/structured/schema) → minimum MEDIUM
- **Ambiguous classification** → default MEDIUM

## Configuration

Configure the plugin in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "clawzenmux": {
        "config": {
          "apiKey": "your-zenmux-api-key",
          "routing": {
            "tiers": {
              "SIMPLE": {
                "primary": "deepseek/deepseek-chat"
              },
              "MEDIUM": {
                "primary": "google/gemini-3-flash-preview"
              },
              "COMPLEX": {
                "primary": "anthropic/claude-sonnet-4.5"
              },
              "REASONING": {
                "primary": "deepseek/deepseek-reasoner"
              }
            }
          }
        }
      }
    }
  }
}
```

### Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `apiKey` | string | — | ZenMux API Key, or use env var `ZENMUX_API_KEY` |
| `routing.tiers.{TIER}.primary` | string | See table above | Primary model for the tier |

## Dynamic Model Sync

On startup, the plugin calls the ZenMux `GET /v1/models` API to fetch the latest model list and pricing:

- 30-minute cache to avoid excessive requests
- Automatic switch to built-in static model catalog when the API is unavailable
- Ensures pricing info is always up to date

## Supported Models

Access 100+ models through the ZenMux platform, including:

| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-5.2 Pro, GPT-5.2, GPT-5.1, GPT-5, GPT-5 Mini/Nano, GPT-4.1, o3, o4-mini, Codex |
| **Anthropic** | Claude Opus 4.6/4.5, Claude Sonnet 4.5/4, Claude Haiku 4.5 |
| **Google** | Gemini 3 Pro/Flash Preview, Gemini 2.5 Pro/Flash/Flash-Lite |
| **DeepSeek** | V3.2, Reasoner |
| **xAI** | Grok 4.1 Fast, Grok 4 Fast, Grok 3 |
| **Alibaba** | Qwen3-Max, Qwen3-Coder-Plus, Qwen3-VL-Plus |
| **Zhipu** | GLM 4.7, GLM 4.6 |
| **Moonshot** | Kimi K2 Thinking, Kimi K2.5 |
| **Mistral** | Mistral Large 3 |
| **Baidu** | ERNIE-5.0 Thinking Preview |
| **ByteDance** | Doubao-Seed-Code |
| **Xiaomi** | MiMo-V2-Flash |

## Project Structure

```
src/
├── index.ts                 # Plugin entry, register provider, start proxy
├── provider.ts              # OpenClaw provider definition
├── proxy.ts                 # Local HTTP proxy server (port 8513)
├── models.ts                # Built-in model catalog (100+ models + pricing)
├── model-sync.ts            # Dynamic model sync (fetch latest from ZenMux API)
├── auth.ts                  # API Key resolution (config / file / env var / wizard)
├── types.ts                 # OpenClaw plugin type definitions
├── dedup.ts                 # Request deduplication (prevent duplicate billing from retries)
├── retry.ts                 # Exponential backoff retry (429/502/503/504)
├── logger.ts                # Usage logging (~/.openclaw/zenmux/logs/)
├── errors.ts                # Error type definitions
└── router/
    ├── index.ts             # Router entry (pure rule scoring, sync)
    ├── rules.ts             # Rule engine (14-dim weighted scoring)
    ├── selector.ts          # Tier → model selection + cost estimation
    ├── config.ts            # Default routing config
    └── types.ts             # Router type definitions
```

## Proxy Server Features

- **SSE Heartbeat**: Streaming requests immediately return 200 + heartbeat packets to prevent OpenClaw 10-15s timeouts
- **Request Dedup**: SHA-256 request body hashing with 30s TTL cache to prevent duplicate billing from retries
- **Retry**: Auto exponential backoff retry on 429/502/503/504, supports Retry-After header
- **Usage Logging**: Each request logged as a JSONL line (`~/.openclaw/zenmux/logs/usage-YYYY-MM-DD.jsonl`)


## Development

```bash
# Install dependencies
npm install

# Dev mode (watch for file changes)
npm run dev

# Type check
npm run typecheck

# Build
npm run build

# Output: dist/index.js (~50KB, zero runtime dependencies)
```

## Health Check

After the proxy starts, check its status via HTTP:

```bash
curl http://localhost:8513/health
# {"status":"ok","provider":"zenmux","models":94}
```

## Author

**WY** — [X / Twitter](https://x.com/akokoi1)

## License

MIT
