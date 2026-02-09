# ClawZenMux

English | **[中文](README.md)**

OpenClaw smart LLM routing plugin — use the [ZenMux](https://zenmux.ai) unified gateway to access 100+ models, automatically choose the cheapest model for each request, and save up to 78-98% on token costs.

## How It Works

```
OpenClaw Agent
  │
  ▼  POST /v1/chat/completions  { model: "clawzenmux/auto", messages: [...] }
  │
  ▼  localhost:8513 (ClawZenMux local proxy)
  │
  ├─ 1. Parse request and extract user prompt
  ├─ 2. Rule engine scoring (14-dimension weighted, <1ms, zero cost)
  ├─ 3. Select the cheapest model based on complexity
  ├─ 4. Replace the `model` field and forward to ZenMux API
  ├─ 5. Stream response back to Agent
  └─ 6. Record usage logs
```

**Core idea**: Simple questions use cheap models (DeepSeek $0.28/M), medium questions use balanced models (Gemini 3 Flash), complex questions use stronger models (Claude $3/M), and reasoning questions use specialized models (DeepSeek Reasoner). You only need to set `clawzenmux/auto`, and the router decides automatically.

## Quick Start

### 1. Get a ZenMux API Key

Go to [zenmux.ai](https://zenmux.ai/invite/U5LELA), sign up, and create an API key. A paid plan is recommended for better savings.

### 2. Configure API Key (choose one of three methods)

```bash
# Option 1: Environment variable (recommended)
export ZENMUX_API_KEY=your-key-here

# Option 2: Save to file
echo "your-key-here" > ~/.openclaw/zenmux/api.key

# Option 3: Configure in openclaw.json
# See the "Configuration" section below.
# If you use Option 3, configure it after plugin installation.
```

### 3. Install the Plugin

```bash
openclaw plugins install @wy51ai/clawzenmux
```

### Installation Warning (OpenClaw security prompt)

During installation, OpenClaw may show:

`WARNING: Plugin "clawzenmux" contains dangerous code patterns: Environment variable access combined with network send — possible credential harvesting`

This appears because the plugin reads `ZENMUX_API_KEY` (environment variable) and sends network requests, which triggers a generic security rule. In this plugin, this behavior is only used to:

- Put the API key in the `Authorization: Bearer ...` request header
- Call the official ZenMux endpoint `https://zenmux.ai/api` (for example, `/v1/chat/completions` and `/v1/models`)

The plugin does not upload your API key to any third-party service. If you do not want to use environment variables, you can use `~/.openclaw/zenmux/api.key` or `openclaw.json` instead (see below).

### 4. Use Smart Routing

```bash
# Automatically select the optimal model
openclaw models set clawzenmux/auto
```

### 5. Prompt-Based Forced Routing (Optional)

When using `clawzenmux/auto`, you can add a control directive in the user message to force a tier:

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
- This directive only takes effect when `model=clawzenmux/auto` (or `auto`)
- The proxy removes the `USE ...` directive text before forwarding, so it does not pollute the actual prompt
- If no directive is present, it continues to use the default rule engine

## Smart Routing Details

### Four-Tier Classification

| Tier | Default Model | Price reference ($/M tokens) | Use case |
|------|--------------|------------------------------|----------|
| **SIMPLE** | deepseek/deepseek-chat | $0.28 / $0.43 | Simple Q&A, translation, definitions |
| **MEDIUM** | google/gemini-3-flash-preview | $0.5 / $3 | General coding, summaries, explanations |
| **COMPLEX** | anthropic/claude-sonnet-4.5 | $3.00 / $15.00 | Complex code, architecture design, multi-step analysis |
| **REASONING** | deepseek/deepseek-reasoner | $0.28 / $0.42 | Math proofs, logical deduction, theorem proving |

### Rule Engine (<1ms, Free)

100% local rule-based scoring with no external API calls. It scores prompts on 14 weighted dimensions and maps the total score to a tier. Keywords cover English, Chinese, Japanese, and Russian:

| Dimension | Weight | Detection target | Multilingual keyword examples |
|------|------|------|------|
| Reasoning markers | 0.18 | Proof/deduction prompts | prove, theorem / 证明, 推导 / 証明, 定理 / доказать |
| Code presence | 0.15 | Code-related content | function, class, \`\`\` / 函数, 类 / 関数 / функция |
| Simple indicators | 0.12 | Simple-question markers | what is, hello / 什么是, 你好 / とは / что такое |
| Multi-step patterns | 0.12 | Multi-step tasks | first...then, step 1, 1. 2. 3. |
| Technical terms | 0.10 | Technical vocabulary | algorithm / 算法 / アルゴリズム / алгоритм |
| Token count | 0.08 | Input length | <50 tokens → simple, >500 → complex |
| Creative markers | 0.05 | Creative writing | story, poem / 故事, 诗 / 物語 / история |
| Question complexity | 0.05 | Multiple question marks | More than 3 `?` |
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

Special rule: 2+ reasoning keyword hits → directly classified as REASONING
Confidence < 0.6 → marked as "ambiguous", falls back to default tier (MEDIUM)
```

### Override Rules

- **Large context** (>100k tokens) → force COMPLEX
- **Structured output** (system prompt includes json/structured/schema) → minimum MEDIUM
- **Ambiguous classification** → default MEDIUM

## Configuration

If you need custom models for each tier, configure the plugin in `~/.openclaw/openclaw.json`. Note: if this configuration is enabled, `apiKey` must be provided in this config:

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
|------|------|------|------|
| `apiKey` | string | — | ZenMux API Key |
| `routing.tiers.{TIER}.primary` | string | See table above | Primary model for that tier |

## Dynamic Model Sync

At startup, the plugin calls ZenMux `GET /v1/models` API to fetch the latest model list and pricing:

- 30-minute cache to avoid frequent requests

## Proxy Server Features

- **SSE heartbeat**: Streaming requests immediately return 200 + heartbeat packets to prevent OpenClaw 10-15 second timeouts
- **Request deduplication**: SHA-256 hash of request body with 30-second TTL cache to prevent duplicate billing from retries
- **Retry mechanism**: Automatic exponential backoff retry on 429/502/503/504, with `Retry-After` header support
- **Usage logs**: Each request is recorded as one JSONL line (`~/.openclaw/zenmux/logs/usage-YYYY-MM-DD.jsonl`)

## Development

```bash
# Install dependencies
npm install

# Dev mode (watch file changes)
npm run dev

# Type check
npm run typecheck

# Build
npm run build

# Output: dist/index.js (~50KB, zero runtime dependencies)
```

## Health Check

After the proxy starts, you can check status via HTTP:

```bash
curl http://localhost:8513/health
# {"status":"ok","provider":"zenmux","models":94}
```

> **Note**: This is a community third-party plugin, not an official product. PRs are welcome.
>
> This plugin is developed with reference to [ClawRouter](https://github.com/BlockRunAI/ClawRouter), removing blockchain/x402 payment components and switching to ZenMux unified gateway + API key authentication. Thanks to the ClawRouter author for open-source contributions.

## Security Reminder

- `8513` is a local proxy port for `localhost` loopback access only. Do not expose it to the public internet.
- Do not forward or tunnel port `8513` (for example, router port mapping, cloud security group allow rules, FRP, ngrok, etc.).
- This port receives local OpenClaw requests. If exposed externally, others may abuse your quota or trigger unexpected requests.
- It is recommended to bind only to `127.0.0.1` and ensure firewall rules do not allow public inbound traffic to `8513`.

## Author

**WY** — [X / Twitter](https://x.com/akokoi1)

## License

MIT
