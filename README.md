# ClawZenMux

OpenClaw 智能 LLM 路由插件 —— 通过 [ZenMux](https://zenmux.ai) 统一网关调用 90+ 模型，自动选择最便宜的模型处理请求，节省 78-96% 的 token 费用。

## 工作原理

```
OpenClaw Agent
  │
  ▼  POST /v1/chat/completions  { model: "zenmux/auto", messages: [...] }
  │
  ▼  localhost:8403 (ClawZenMux 本地代理)
  │
  ├─ 1. 解析请求，提取用户 prompt
  ├─ 2. 智能分类：规则引擎 (<1ms) + AI 分类器 (多语言)
  ├─ 3. 根据复杂度选择最便宜的模型
  ├─ 4. 替换 model 字段，转发到 ZenMux API
  ├─ 5. 流式返回响应给 Agent
  └─ 6. 记录使用日志
```

**核心思路**：简单问题用便宜模型（DeepSeek $0.28/M），复杂问题用强力模型（Claude $3/M），推理问题用专业模型（o3 $2/M）。用户只需设置 `zenmux/auto`，路由器自动判断。

## 快速开始

### 1. 获取 ZenMux API Key

前往 [zenmux.ai](https://zenmux.ai) 注册，在 Console > API Keys 页面创建密钥。

### 2. 安装插件

```bash
openclaw plugin install @wy51ai/clawzenmux
```

### 3. 配置 API Key（三种方式，任选其一）

```bash
# 方式一：环境变量（推荐）
export ZENMUX_API_KEY=your-key-here

# 方式二：保存到文件
echo "your-key-here" > ~/.openclaw/zenmux/api.key

# 方式三：在 openclaw.json 中配置
# 见下方「配置」章节
```

### 4. 使用智能路由

```bash
# 自动选择最优模型
openclaw models set zenmux/auto

# 或者指定特定模型
openclaw models set anthropic/claude-sonnet-4.5
```

## 智能路由详解

### 四层分级

| 层级 | 默认模型 | 价格 ($/M tokens) | 适用场景 |
|------|---------|-------------------|----------|
| **SIMPLE** | deepseek/deepseek-v3.2 | $0.28 / $0.43 | 简单问答、翻译、定义 |
| **MEDIUM** | deepseek/deepseek-v3.2 | $0.28 / $0.43 | 一般编码、摘要、解释 |
| **COMPLEX** | anthropic/claude-sonnet-4.5 | $3.00 / $15.00 | 复杂代码、架构设计、多步分析 |
| **REASONING** | openai/o3 | $2.00 / $8.00 | 数学证明、逻辑推导、定理证明 |

### 两阶段分类

#### 第一阶段：规则引擎（<1ms，免费，多语言）

对 prompt 进行 14 维加权评分，根据总分映射到层级。每个维度的关键词覆盖英文、中文、日文、韩文：

| 维度 | 权重 | 检测内容 | 多语言关键词示例 |
|------|------|----------|-----------------|
| 推理标记 | 0.18 | 证明、推导类提示 | prove, theorem / 证明, 推导 / 証明, 定理 / 증명 |
| 代码存在 | 0.15 | 代码相关内容 | function, class, \`\`\` / 代码, 函数, 编程 / コード / 코드 |
| 简单指标 | 0.12 | 简单问题标记 | what is, hello / 什么是, 你好 / とは / 무엇 |
| 多步模式 | 0.12 | 多步骤任务 | first...then / 首先…然后 / まず…次に / 먼저…그다음 |
| 技术术语 | 0.10 | 专业技术词汇 | algorithm / 算法, 分布式 / アルゴリズム / 알고리즘 |
| Token 数量 | 0.08 | 输入长度 | <50 tokens → 简单，>500 → 复杂 |
| 创意标记 | 0.05 | 创意写作 | story, poem / 故事, 小说 / 物語 / 이야기 |
| 问题复杂度 | 0.05 | 多个问号 | 超过 3 个 ? 或 ？ |
| 约束条件 | 0.04 | 限制条件 | at most / 不超过, 时间复杂度 / 以下 / 이하 |
| 命令动词 | 0.03 | 构建指令 | build, create / 构建, 帮我写 / 作成 / 구현 |
| 输出格式 | 0.03 | 结构化输出 | json, yaml / 格式, 表格 / フォーマット / 포맷 |
| 引用复杂度 | 0.02 | 上下文引用 | above, the docs / 上面, 文档 / 上記 / 위의 |
| 领域特异性 | 0.02 | 专业领域 | quantum / 量子 / 量子 / 양자 |
| 否定复杂度 | 0.01 | 否定约束 | don't, avoid / 不要, 避免 / しないで / 금지 |

**评分逻辑**：
```
加权总分 = Σ(维度得分 × 权重)

总分 < 0.0   → SIMPLE
0.0 ~ 0.15   → MEDIUM
0.15 ~ 0.25  → COMPLEX
≥ 0.25       → REASONING

特殊规则：2+ 个推理关键词命中 → 直接判定 REASONING
置信度 < 0.7 → 标记为「模糊」，交给 AI 分类器
```

#### 第二阶段：AI 分类器（多语言支持）

当规则引擎判断不确定时，用一个便宜的 LLM（默认 gemini-2.5-flash）来分类：

- 支持中文、日文、韩文、阿拉伯文等任何语言
- prompt 截断到 500 字符，max_tokens=10，几乎零成本
- 内置 LRU 缓存（500 条，1 小时 TTL），避免重复分类
- 5 秒超时，失败时回退到默认层级（MEDIUM）
- 可通过配置 `useAiClassifier: false` 关闭

### 覆盖规则

- **大上下文** (>100k tokens) → 强制 COMPLEX
- **结构化输出** (system prompt 含 json/schema) → 最低 MEDIUM
- **模糊判定** → AI 分类器（启用时）或默认 MEDIUM

## 配置

在 `~/.openclaw/openclaw.json` 中配置插件：

```json
{
  "plugins": {
    "entries": {
      "clawzenmux": {
        "config": {
          "apiKey": "your-zenmux-api-key",
          "useAiClassifier": true,
          "routing": {
            "tiers": {
              "SIMPLE": {
                "primary": "deepseek/deepseek-v3.2",
                "fallback": ["google/gemini-2.5-flash"]
              },
              "MEDIUM": {
                "primary": "deepseek/deepseek-v3.2",
                "fallback": ["google/gemini-2.5-flash"]
              },
              "COMPLEX": {
                "primary": "anthropic/claude-sonnet-4.5",
                "fallback": ["anthropic/claude-sonnet-4", "openai/gpt-4o"]
              },
              "REASONING": {
                "primary": "openai/o3",
                "fallback": ["google/gemini-2.5-pro"]
              }
            }
          }
        }
      }
    }
  }
}
```

### 配置项说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | string | — | ZenMux API Key，也可用环境变量 `ZENMUX_API_KEY` |
| `useAiClassifier` | boolean | `true` | 是否启用 AI 分类器（多语言支持） |
| `routing.tiers.{TIER}.primary` | string | 见上表 | 该层级的首选模型 |
| `routing.tiers.{TIER}.fallback` | string[] | 见上表 | 首选不可用时的备选模型 |

## 动态模型同步

插件启动时会调用 ZenMux `GET /v1/models` API 获取最新的模型列表和定价信息：

- 30 分钟缓存，避免频繁请求
- API 不可用时自动回退到内置静态模型目录
- 确保定价信息始终最新

## 支持的模型

通过 ZenMux 平台访问 90+ 模型，包括：

| 提供商 | 模型 |
|--------|------|
| **OpenAI** | GPT-5.2 Pro, GPT-5.2, GPT-5.1, GPT-5, GPT-5 Mini/Nano, GPT-4.1, o3, o4-mini, Codex |
| **Anthropic** | Claude Opus 4.6/4.5, Claude Sonnet 4.5/4, Claude Haiku 4.5 |
| **Google** | Gemini 3 Pro/Flash Preview, Gemini 2.5 Pro/Flash/Flash-Lite |
| **DeepSeek** | V3.2, V3.2 Thinking |
| **xAI** | Grok 4.1 Fast, Grok 4 Fast, Grok 3 |
| **阿里** | Qwen3-Max, Qwen3-Coder-Plus, Qwen3-VL-Plus |
| **智谱** | GLM 4.7, GLM 4.6 |
| **月之暗面** | Kimi K2 Thinking, Kimi K2.5 |
| **Mistral** | Mistral Large 3 |
| **百度** | ERNIE-5.0 Thinking Preview |
| **字节** | Doubao-Seed-Code |
| **小米** | MiMo-V2-Flash |

## 项目结构

```
src/
├── index.ts                 # 插件入口，注册 provider，启动代理
├── provider.ts              # OpenClaw provider 定义
├── proxy.ts                 # 本地 HTTP 代理服务器 (port 8403)
├── models.ts                # 内置模型目录（90+ 模型 + 定价）
├── model-sync.ts            # 动态模型同步（从 ZenMux API 拉取最新）
├── auth.ts                  # API Key 解析（config / 文件 / 环境变量 / 向导）
├── types.ts                 # OpenClaw 插件类型定义
├── dedup.ts                 # 请求去重（防止超时重试导致重复计费）
├── retry.ts                 # 指数退避重试（429/502/503/504）
├── logger.ts                # 使用日志（~/.openclaw/zenmux/logs/）
├── errors.ts                # 错误类型定义
└── router/
    ├── index.ts             # 路由入口（route 同步 + routeAsync 异步）
    ├── rules.ts             # 规则引擎（14 维加权评分）
    ├── ai-classifier.ts     # AI 分类器（多语言，LLM 调用）
    ├── selector.ts          # 层级 → 模型选择 + 费用估算
    ├── config.ts            # 默认路由配置
    └── types.ts             # 路由类型定义
```

## 代理服务器特性

- **SSE 心跳**：流式请求立即返回 200 + 心跳包，防止 OpenClaw 10-15 秒超时
- **请求去重**：SHA-256 哈希请求体，30 秒 TTL 缓存，防止重试导致重复计费
- **重试机制**：429/502/503/504 自动指数退避重试，支持 Retry-After header
- **使用日志**：每次请求记录为 JSONL 行 (`~/.openclaw/zenmux/logs/usage-YYYY-MM-DD.jsonl`)

## 费用节省示例

```
"什么是量子计算？"（简单问题）
  → 规则引擎: SIMPLE → deepseek/deepseek-v3.2
  → 费用: $0.0003 vs Opus 4.6 $0.025 = 节省 98.8%

"帮我写一个 React 组件"（一般编码）
  → 规则引擎: MEDIUM → deepseek/deepseek-v3.2
  → 费用: $0.0003 vs Opus 4.6 $0.025 = 节省 98.8%

"设计一个分布式消息队列的架构"（复杂任务）
  → 规则引擎: COMPLEX → anthropic/claude-sonnet-4.5
  → 费用: $0.045 vs Opus 4.6 $0.25 = 节省 82%

"证明 √2 是无理数"（推理）
  → 规则引擎: REASONING → openai/o3
  → 费用: $0.041 vs Opus 4.6 $0.25 = 节省 83.6%
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 类型检查
npm run typecheck

# 构建
npm run build

# 输出: dist/index.js (~50KB, 零运行时依赖)
```

## 健康检查

代理启动后可通过 HTTP 检查状态：

```bash
curl http://localhost:8403/health
# {"status":"ok","provider":"zenmux","models":94,"aiClassifier":true}
```

## 作者

**WY** — [X / Twitter](https://x.com/akokoi1)

## 许可证

MIT
