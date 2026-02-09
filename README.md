# ClawZenMux

**[English](README_EN.md)** | 中文

OpenClaw 智能 LLM 路由插件 —— 通过 [ZenMux](https://zenmux.ai) 统一网关调用 100+ 模型，自动选择最便宜的模型处理请求，最高节省 78-98% 的 token 费用。



## 工作原理

```
OpenClaw Agent
  │
  ▼  POST /v1/chat/completions  { model: "clawzenmux/auto", messages: [...] }
  │
  ▼  localhost:8513 (ClawZenMux 本地代理)
  │
  ├─ 1. 解析请求，提取用户 prompt
  ├─ 2. 规则引擎评分 (14 维加权，<1ms，零成本)
  ├─ 3. 根据复杂度选择最便宜的模型
  ├─ 4. 替换 model 字段，转发到 ZenMux API
  ├─ 5. 流式返回响应给 Agent
  └─ 6. 记录使用日志
```

**核心思路**：简单问题用便宜模型（DeepSeek $0.28/M），中等问题用均衡模型（Gemini 3 Flash），复杂问题用强力模型（Claude $3/M），推理问题用专业模型（DeepSeek Reasoner）。用户只需设置 `clawzenmux/auto`，路由器自动判断。

## 快速开始

### 1. 获取 ZenMux API Key

前往 [zenmux.ai](https://zenmux.ai/invite/U5LELA) 注册，创建密钥，建议订阅套餐使用，更节省费用。

### 2. 配置 API Key（三种方式，任选其一）

```bash
# 方式一：环境变量（推荐）
export ZENMUX_API_KEY=your-key-here

# 方式二：保存到文件
echo "your-key-here" > ~/.openclaw/zenmux/api.key

# 方式三：在 openclaw.json 中配置
# 见下方「配置」章节，如果使用方式三，需要在安装插件后配置
```

### 3. 安装插件

```bash
openclaw plugins install @wy51ai/clawzenmux
```

### 安装告警说明（OpenClaw 安全提示）

安装时 OpenClaw 可能提示：

`WARNING: Plugin "clawzenmux" contains dangerous code patterns: Environment variable access combined with network send — possible credential harvesting`

这是因为插件会读取 `ZENMUX_API_KEY`（环境变量）并发起网络请求，触发了通用安全规则。该行为在本插件中的用途仅为：

- 将 API Key 放入 `Authorization: Bearer ...` 请求头
- 请求 ZenMux 官方接口 `https://zenmux.ai/api`（如 `/v1/chat/completions`、`/v1/models`）

不会将你的 API Key 上传到任何第三方服务。若你不希望使用环境变量，也可以改用 `~/.openclaw/zenmux/api.key` 或 `openclaw.json` 配置方式（见下方）。


### 4. 使用智能路由

```bash
# 自动选择最优模型
openclaw models set clawzenmux/auto
```

### 5. 提示词强制路由（可选）

当你使用 `clawzenmux/auto` 时，可以在用户消息里加入控制指令强制层级：

```text
USE SIMPLE
USE MEDIUM
USE COMPLEX
USE REASONING
```

示例：

```text
USE COMPLEX 设计一个分布式消息队列的架构
```

说明：
- 该指令只在 `model=clawzenmux/auto`（或 `auto`）时生效
- 代理会在转发前移除 `USE ...` 指令文本，避免污染真正的提示词
- 若同一条消息没有指令，继续走默认规则引擎

## 智能路由详解

### 四层分级

| 层级 | 默认模型 | 价格参考 ($/M tokens) | 适用场景 |
|------|---------|-------------------|----------|
| **SIMPLE** | deepseek/deepseek-chat | $0.28 / $0.43 | 简单问答、翻译、定义 |
| **MEDIUM** | google/gemini-3-flash-preview | $0.5 / $3 | 一般编码、摘要、解释 |
| **COMPLEX** | anthropic/claude-sonnet-4.5 | $3.00 / $15.00 | 复杂代码、架构设计、多步分析 |
| **REASONING** | deepseek/deepseek-reasoner | $0.28 / $0.42 | 数学证明、逻辑推导、定理证明 |

### 规则引擎（<1ms，免费）

100% 本地规则评分，无外部 API 调用。对 prompt 进行 14 维加权评分，根据总分映射到层级。关键词覆盖英文、中文、日文、俄文：

| 维度 | 权重 | 检测内容 | 多语言关键词示例 |
|------|------|----------|-----------------|
| 推理标记 | 0.18 | 证明、推导类提示 | prove, theorem / 证明, 推导 / 証明, 定理 / доказать |
| 代码存在 | 0.15 | 代码相关内容 | function, class, \`\`\` / 函数, 类 / 関数 / функция |
| 简单指标 | 0.12 | 简单问题标记 | what is, hello / 什么是, 你好 / とは / что такое |
| 多步模式 | 0.12 | 多步骤任务 | first...then, step 1, 1. 2. 3. |
| 技术术语 | 0.10 | 专业技术词汇 | algorithm / 算法 / アルゴリズム / алгоритм |
| Token 数量 | 0.08 | 输入长度 | <50 tokens → 简单，>500 → 复杂 |
| 创意标记 | 0.05 | 创意写作 | story, poem / 故事, 诗 / 物語 / история |
| 问题复杂度 | 0.05 | 多个问号 | 超过 3 个 ? |
| 约束条件 | 0.04 | 限制条件 | at most / 不超过 / 以下 / не более |
| 命令动词 | 0.03 | 构建指令 | build, create / 构建, 创建 / 構築 / создать |
| 输出格式 | 0.03 | 结构化输出 | json, yaml / 表格 / テーブル / таблица |
| 引用复杂度 | 0.02 | 上下文引用 | above, the docs / 上面, 文档 / 上記 / выше |
| 领域特异性 | 0.02 | 专业领域 | quantum, fpga / 量子 / 量子 / квантовый |
| 否定复杂度 | 0.01 | 否定约束 | don't, avoid / 不要, 避免 / しないで / избегать |

**评分逻辑**：
```
加权总分 = Σ(维度得分 × 权重)

总分 < 0.0   → SIMPLE
0.0 ~ 0.15   → MEDIUM
0.15 ~ 0.25  → COMPLEX
≥ 0.25       → REASONING

特殊规则：2+ 个推理关键词命中 → 直接判定 REASONING
置信度 < 0.6 → 标记为「模糊」，回退到默认层级 (MEDIUM)
```

### 覆盖规则

- **大上下文** (>100k tokens) → 强制 COMPLEX
- **结构化输出** (system prompt 含 json/structured/schema) → 最低 MEDIUM
- **模糊判定** → 默认 MEDIUM

## 配置
如果需要自定义各个分级的模型，需要在 `~/.openclaw/openclaw.json` 中配置插件，注意，如果开启这个配置，apiKey必须要在这个配置中填写：

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

### 配置项说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | string | — | ZenMux API Key |
| `routing.tiers.{TIER}.primary` | string | 见上表 | 该层级的首选模型 |

## 动态模型同步

插件启动时会调用 ZenMux `GET /v1/models` API 获取最新的模型列表和定价信息：

- 30 分钟缓存，避免频繁请求


## 代理服务器特性

- **SSE 心跳**：流式请求立即返回 200 + 心跳包，防止 OpenClaw 10-15 秒超时
- **请求去重**：SHA-256 哈希请求体，30 秒 TTL 缓存，防止重试导致重复计费
- **重试机制**：429/502/503/504 自动指数退避重试，支持 Retry-After header
- **使用日志**：每次请求记录为 JSONL 行 (`~/.openclaw/zenmux/logs/usage-YYYY-MM-DD.jsonl`)


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
curl http://localhost:8513/health
# {"status":"ok","provider":"zenmux","models":94}
```
> **注意**：这是一个社区第三方插件，非官方出品。欢迎各位大佬提交PR改进。
>
> 本插件参考 [ClawRouter](https://github.com/BlockRunAI/ClawRouter) 架构开发，去掉了区块链/x402 支付部分，改用 ZenMux 统一网关 + API Key 认证。感谢 ClawRouter 作者的开源贡献！

## 安全提醒

- `8513` 是本地代理端口，仅用于 `localhost` 回环访问，请勿对外网开放。
- 不要把 `8513` 做端口转发/内网穿透（如路由器端口映射、云安全组放行、FRP、ngrok 等）。
- 该端口用于接收本地 OpenClaw 请求，若暴露到外部，可能被他人滥用你的配额或触发异常请求。
- 建议只监听 `127.0.0.1`，并确认防火墙未放行 `8513` 的公网入站流量。

## 作者

**WY** — [X / Twitter](https://x.com/akokoi1)

## 许可证

MIT
