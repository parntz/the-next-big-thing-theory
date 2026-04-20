import { z } from "zod";

// ============================================================================
// DYNAMIC MODEL DISCOVERY SYSTEM
// ============================================================================
// Together.ai model tiers - each tier ordered by performance/reliability
// System tries models in order, cascading through fallbacks on failure

// Strategy tasks need highest quality reasoning
const STRATEGY_TIER = [
  "deepseek-ai/DeepSeek-V3.1",
  "Qwen/Qwen3-Coder-Next-FP8",
  "MiniMaxAI/MiniMax-M2.7",
  "google/gemini-1.5-pro",
  "moonshotai/Kimi-K2.5",
  "anthropic/claude-3.5-sonnet",
];

// Analysis tasks need balanced reasoning
const ANALYSIS_TIER = [
  "Qwen/Qwen3-Coder-Next-FP8",
  "MiniMaxAI/MiniMax-M2.7",
  "deepseek-ai/DeepSeek-V3.1",
  "google/gemini-1.5-flash",
  "moonshotai/Kimi-K2.5",
  "anthropic/claude-3.5-haiku",
];

// Summary tasks need fast, concise responses
const SUMMARY_TIER = [
  "Qwen/Qwen3-Coder-Next-FP8",
  "google/gemini-1.5-flash",
  "MiniMaxAI/MiniMax-M2.7",
  "moonshotai/Kimi-K2.5",
  "anthropic/claude-3.5-haiku",
  "meta-llama/Llama-3.3-70B-Instruct",
];

export type ModelType = "summary" | "analysis" | "strategy";

// Get ordered model tier for a task type
function getModelTier(taskType: ModelType): string[] {
  switch (taskType) {
    case "strategy": return [...STRATEGY_TIER];
    case "analysis": return [...ANALYSIS_TIER];
    case "summary": return [...SUMMARY_TIER];
  }
}

// Cost estimates per 1M tokens (approximate)
export const AI_COSTS: Record<ModelType, { input: number; output: number }> = {
  summary: { input: 0.008, output: 0.008 },
  analysis: { input: 0.01, output: 0.01 },
  strategy: { input: 0.02, output: 0.02 },
};

// ============================================================================
// AI SERVICE - DYNAMIC MODEL FALLBACK SYSTEM
// ============================================================================
export class AIService {
  private apiKey: string;
  private apiUrl: string;
  public requestTimeoutMs: number;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TOGETHER_API_KEY || "";
    if (!this.apiKey) {
      console.warn("TOGETHER_API_KEY not set. AI functionality will be limited.");
    }
    this.apiUrl = "https://api.together.xyz/v1/chat/completions";
    this.requestTimeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "10000"); // 10s default
  }

  // Generate response with dynamic model fallback cascading through 6 models
  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    temperature: number = 0.7,
    maxTokens: number = 2000,
    modelType: ModelType = "analysis"
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; modelUsed: string }> {
    if (!this.apiKey) {
      throw new Error("AI API key not configured");
    }

    const modelTier = getModelTier(modelType);
    let lastError: Error | null = null;

    // Try each model in the tier in order
    for (let i = 0; i < modelTier.length; i++) {
      const model = modelTier[i];
      console.log(`[AI] Trying ${modelType} model ${i + 1}/${modelTier.length}: ${model}`);

      try {
        const result = await this.callModel(model, messages, temperature, maxTokens);
        console.log(`[AI] Success with ${model}`);
        return { ...result, modelUsed: model };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message.substring(0, 100);
        console.warn(`[AI] ${model} failed: ${errorMsg}`);
        // Continue to next model in tier
      }
    }

    // All models failed
    console.error(`[AI] All ${modelTier.length} ${modelType} models failed`);
    throw lastError || new Error(`All ${modelType} models failed`);
  }

  // Call a single model with timeout handling
  private async callModel(
    model: string,
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 429) {
          throw new Error(`Rate limited`);
        } else if (response.status >= 500) {
          throw new Error(`Server error ${response.status}`);
        } else {
          throw new Error(`API error ${response.status}: ${errorBody.substring(0, 100)}`);
        }
      }

      const data = await response.json();
      let content = data.choices[0]?.message?.content || "";

      // Fix common JSON issues
      content = this.fixJSON(content);

      // Validate JSON
      try {
        JSON.parse(content);
      } catch {
        // Try aggressive fix
        content = this.fixJSON(content, true);
        JSON.parse(content); // Will throw if still invalid
      }

      return {
        content,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof TypeError && error.message.includes('fetch')) {
        const fetchError = new Error(`Network error: ${error.message}`);
        fetchError.name = 'FetchError';
        throw fetchError;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(`Timeout after ${this.requestTimeoutMs}ms`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }

      throw error;
    }
  }

  // Fix common JSON issues
  fixJSON(str: string, aggressive: boolean = false): string {
    str = str.replace(/,(\s*[}\]])/g, '$1');

    if (aggressive) {
      const unterminatedMatch = str.match(/"([^"\\]|\\.)*$/);
      if (unterminatedMatch && unterminatedMatch.index !== undefined) {
        const beforeUnterminated = str.substring(0, unterminatedMatch.index);
        const unterminated = unterminatedMatch[0];
        const fixed = beforeUnterminated + unterminated + '" }';
        try {
          JSON.parse(fixed);
          return fixed;
        } catch {
          // Return original if fix fails
        }
      }
    }

    return str;
  }

  // Cost calculation helper
  calculateCost(modelType: ModelType, inputTokens: number, outputTokens: number): number {
    const costs = AI_COSTS[modelType];
    return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
  }
}

// AI Service instances for different tasks
export const summaryService = new AIService();
export const analysisService = new AIService();
export const strategyService = new AIService();

// Zod Schemas for structured AI outputs
export const BusinessResearchSchema = z.object({
  summary: z.string().describe("Brief summary of the business"),
  keyStrengths: z.array(z.string()).describe("Key business strengths"),
  keyWeaknesses: z.array(z.string()).describe("Key business weaknesses"),
  marketPosition: z.string().describe("Current market position"),
  uniqueValueProposition: z.string().describe("Unique value proposition"),
  revenueModel: z.string().describe("Revenue model overview"),
  targetMarket: z.string().describe("Target market description"),
});

export type BusinessResearchResult = z.infer<typeof BusinessResearchSchema>;

export const CompetitorDiscoverySchema = z.object({
  competitors: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      websiteUrl: z.string().optional(),
      revenueEstimate: z.string().optional(),
      marketShare: z.string().optional(),
    })
  ),
  marketSize: z.string().optional(),
  growthRate: z.string().optional(),
  marketTrends: z.array(z.string()).optional(),
});

export type CompetitorDiscoveryResult = z.infer<typeof CompetitorDiscoverySchema>;

export const NormalizedCompetitorSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  description: z.string(),
  websiteUrl: z.string().optional(),
  revenueEstimate: z.string().optional(),
  marketShare: z.string().optional(),
  isMain: z.boolean(),
});

export type NormalizedCompetitor = z.infer<typeof NormalizedCompetitorSchema>;

export const AnalysisFactorSchema = z.object({
  name: z.string().describe("Factor name (e.g., 'Price', 'Quality', 'Convenience')"),
  description: z.string().describe("Description of what this factor means"),
  isEliminated: z.boolean().describe("Should this factor be eliminated?"),
  isReduced: z.boolean().describe("Should this factor be reduced?"),
  isRaised: z.boolean().describe("Should this factor be raised?"),
  isNewCreation: z.boolean().describe("Is this a new factor that should be created?"),
});

export type AnalysisFactor = z.infer<typeof AnalysisFactorSchema>;

export const FactorScoreSchema = z.object({
  score: z.number().min(0).max(10).describe("Score from 0-10"),
  confidence: z.number().min(0).max(1).describe("Confidence score from 0-1"),
  explanation: z.string().describe("Explanation for the score"),
  evidence: z.array(
    z.object({
      sourceUrl: z.string(),
      snippet: z.string(),
      relevanceScore: z.number().min(0).max(1),
    })
  ).describe("Supporting evidence with sources"),
});

export type FactorScore = z.infer<typeof FactorScoreSchema>;

export const CompanyScoreResultSchema = z.object({
  companyId: z.number(),
  companyName: z.string(),
  scores: z.record(z.string(), FactorScoreSchema).describe("Scores for each factor"),
});

export type CompanyScoreResult = z.infer<typeof CompanyScoreResultSchema>;

export const StrategyCanvasSchema = z.object({
  factors: z.array(AnalysisFactorSchema),
  scores: z.array(CompanyScoreResultSchema),
});

export type StrategyCanvasResult = z.infer<typeof StrategyCanvasSchema>;

export const NextBigThingStrategySchema = z.object({
  title: z.string().describe("Catchy title for the strategy"),
  summary: z.string().describe("One-sentence summary"),
  eliminate: z.string().describe("What to eliminate from the industry's traditional formula"),
  reduce: z.string().describe("What to reduce below industry's standard"),
  raise: z.string().describe("What to raise above industry's standard"),
  create: z.string().describe("What to create that the industry has never offered"),
  valueCurve: z.array(
    z.object({
      factor: z.string(),
      currentScore: z.number(),
      proposedScore: z.number(),
    })
  ).describe("Value curve showing changes"),
  targetCustomer: z.string().describe("Target customer segment"),
  positioningStatement: z.string().describe("Positioning statement"),
  risks: z.array(z.string()).describe("Potential risks"),
  difficulty: z.number().min(1).max(10).describe("Implementation difficulty (1-10)"),
  operationalImplications: z.string().describe("Operational implications"),
  revenuePotential: z.string().optional(),
});

export type NextBigThingStrategy = z.infer<typeof NextBigThingStrategySchema>;

export const NextBigThingResultSchema = z.object({
  strategies: z.array(NextBigThingStrategySchema),
  summary: z.string().describe("Summary of the strategy options"),
});

export type NextBigThingResult = z.infer<typeof NextBigThingResultSchema>;

export const ReportSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  currentPositioning: z.object({
    mainCompany: z.object({
      name: z.string(),
      description: z.string().optional(),
      websiteUrl: z.string().optional(),
    }),
    competitors: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
      })
    ),
    keyFindings: z.array(z.string()),
  }),
  competitorAnalysis: z.object({
    marketPosition: z.string(),
    competitiveAdvantages: z.array(z.string()),
    weaknesses: z.array(z.string()),
  }),
  nextBigThingOptions: z.array(NextBigThingStrategySchema),
  recommendedStrategy: NextBigThingStrategySchema.optional(),
  confidenceScore: z.number().min(0).max(1),
});

export type StrategyReport = z.infer<typeof ReportSchema>;