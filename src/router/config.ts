/**
 * Default Routing Config
 *
 * All routing parameters as a TypeScript constant.
 * Operators override via openclaw.yaml plugin config.
 *
 * Scoring uses 14 weighted dimensions with sigmoid confidence calibration.
 * Tier models updated for ZenMux's catalog.
 */

import type { RoutingConfig } from "./types.js";

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  version: "2.0",

  classifier: {
    llmModel: "google/gemini-2.5-flash",
    llmMaxTokens: 10,
    llmTemperature: 0,
    promptTruncationChars: 500,
    cacheTtlMs: 3_600_000, // 1 hour
  },

  scoring: {
    tokenCountThresholds: { simple: 50, complex: 500 },
    codeKeywords: [
      // universal (language-agnostic code tokens)
      "function", "class", "import", "def", "SELECT", "async", "await",
      "const", "let", "var", "return", "```", "=>", "interface", "struct",
      // zh
      "代码", "函数", "编程", "接口", "变量", "调试", "报错", "bug",
      "写一个", "写个", "实现一个", "代码实现",
      // ja
      "コード", "関数", "プログラム", "実装", "バグ",
      // ko
      "코드", "함수", "프로그래밍", "구현", "버그",
    ],
    reasoningKeywords: [
      // en
      "prove", "theorem", "derive", "step by step", "chain of thought",
      "formally", "mathematical", "proof", "logically", "induction",
      // zh
      "证明", "定理", "推导", "逐步", "一步一步", "形式化", "数学",
      "逻辑推理", "归纳法", "演绎",
      // ja
      "証明", "定理", "導出", "ステップバイステップ", "論理的",
      // ko
      "증명", "정리", "유도", "단계별", "논리적",
    ],
    simpleKeywords: [
      // en
      "what is", "define", "translate", "hello", "yes or no",
      "capital of", "how old", "who is", "when was", "thanks",
      // zh
      "什么是", "是什么", "定义", "翻译", "你好", "谢谢",
      "是不是", "多大", "谁是", "是谁", "你是谁", "什么时候", "帮我翻译",
      "解释一下", "简单介绍", "怎么说", "什么意思",
      // ja
      "とは", "意味", "翻訳", "こんにちは", "教えて",
      "いつ", "だれ", "簡単に",
      // ko
      "무엇", "뜻", "번역", "안녕", "설명해",
      "언제", "누구",
    ],
    technicalKeywords: [
      // en
      "algorithm", "optimize", "architecture", "distributed", "kubernetes",
      "microservice", "database", "infrastructure", "scalability", "latency",
      // zh
      "算法", "优化", "架构", "分布式", "微服务", "数据库",
      "基础设施", "性能", "并发", "负载均衡", "高可用",
      // ja
      "アルゴリズム", "最適化", "アーキテクチャ", "分散", "データベース",
      // ko
      "알고리즘", "최적화", "아키텍처", "분산", "데이터베이스",
    ],
    creativeKeywords: [
      // en
      "story", "poem", "compose", "brainstorm", "creative", "imagine", "write a",
      // zh
      "故事", "诗", "作文", "头脑风暴", "创意", "想象", "写一篇",
      "小说", "剧本", "文案",
      // ja
      "物語", "詩", "作文", "ブレスト", "創造", "想像",
      // ko
      "이야기", "시", "작문", "브레인스토밍", "창작", "상상",
    ],
    imperativeVerbs: [
      // en
      "build", "create", "implement", "design", "develop",
      "construct", "generate", "deploy", "configure", "set up",
      // zh
      "构建", "创建", "实现", "设计", "开发", "搭建",
      "生成", "部署", "配置", "编写", "帮我写",
      // ja
      "構築", "作成", "実装", "設計", "開発", "生成", "デプロイ",
      // ko
      "구축", "생성", "구현", "설계", "개발", "배포",
    ],
    constraintIndicators: [
      // en
      "under", "at most", "at least", "within", "no more than",
      "o(", "maximum", "minimum", "limit", "budget",
      // zh
      "不超过", "最多", "最少", "以内", "不得超过",
      "时间复杂度", "空间复杂度", "上限", "下限", "限制", "预算",
      // ja
      "以下", "以上", "最大", "最小", "制限", "予算",
      // ko
      "이하", "이상", "최대", "최소", "제한", "예산",
    ],
    outputFormatKeywords: [
      // universal
      "json", "yaml", "xml", "table", "csv", "markdown", "schema",
      // en
      "format as", "structured",
      // zh
      "格式", "表格", "结构化", "输出为", "格式化",
      // ja
      "フォーマット", "テーブル", "構造化",
      // ko
      "포맷", "테이블", "구조화",
    ],
    referenceKeywords: [
      // en
      "above", "below", "previous", "following", "the docs",
      "the api", "the code", "earlier", "attached",
      // zh
      "上面", "下面", "之前", "如下", "文档", "接口",
      "代码", "前面", "附件", "参考",
      // ja
      "上記", "下記", "前の", "ドキュメント", "添付",
      // ko
      "위의", "아래", "이전", "문서", "첨부",
    ],
    negationKeywords: [
      // en
      "don't", "do not", "avoid", "never", "without",
      "except", "exclude", "no longer",
      // zh
      "不要", "不能", "避免", "禁止", "除了",
      "排除", "不可以", "不得", "不许",
      // ja
      "しないで", "避ける", "禁止", "除外", "以外",
      // ko
      "하지마", "금지", "제외", "피하다",
    ],
    domainSpecificKeywords: [
      // universal (technical terms used across languages)
      "quantum", "fpga", "vlsi", "risc-v", "asic", "photonics",
      "genomics", "proteomics", "topological", "homomorphic",
      "zero-knowledge", "lattice-based",
      // zh
      "量子", "光子", "基因组", "蛋白质组", "拓扑",
      "同态加密", "零知识证明", "格密码",
      // ja
      "量子", "ゲノム", "準同型",
      // ko
      "양자", "유전체", "동형암호",
    ],

    // Dimension weights (sum to 1.0)
    dimensionWeights: {
      tokenCount: 0.08,
      codePresence: 0.15,
      reasoningMarkers: 0.18,
      technicalTerms: 0.1,
      creativeMarkers: 0.05,
      simpleIndicators: 0.12,
      multiStepPatterns: 0.12,
      questionComplexity: 0.05,
      imperativeVerbs: 0.03,
      constraintCount: 0.04,
      outputFormat: 0.03,
      referenceComplexity: 0.02,
      negationComplexity: 0.01,
      domainSpecificity: 0.02,
    },

    // Tier boundaries on weighted score axis
    tierBoundaries: {
      // Only prompts with explicit simple signals (keywords like 你好, 翻译, what is)
      // should be SIMPLE. Short prompts without clear signals → MEDIUM.
      simpleMedium: -0.12,
      mediumComplex: 0.15,
      complexReasoning: 0.25,
    },

    // Sigmoid steepness for confidence calibration
    confidenceSteepness: 12,
    // Below this confidence → ambiguous (null tier)
    // Lowered from 0.7 — short prompts (especially Chinese) have small score distances,
    // high threshold causes almost everything to fall through to AI/default MEDIUM.
    confidenceThreshold: 0.55,
  },

  tiers: {
    SIMPLE: {
      primary: "deepseek/deepseek-v3.2",
      fallback: ["google/gemini-2.5-flash"],
    },
    MEDIUM: {
      primary: "deepseek/deepseek-v3.2",
      fallback: ["google/gemini-2.5-flash"],
    },
    COMPLEX: {
      primary: "anthropic/claude-sonnet-4.5",
      fallback: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
    },
    REASONING: {
      primary: "openai/gpt-5.2",
      fallback: ["google/gemini-3-pro-preview"],
    },
  },

  overrides: {
    maxTokensForceComplex: 100_000,
    structuredOutputMinTier: "MEDIUM",
    ambiguousDefaultTier: "MEDIUM",
  },
};
