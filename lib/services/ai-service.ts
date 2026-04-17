import { z } from "zod";
import { together } from "ai";
import { createParser } from "ai";
import { type CoreMessage } from "ai";

// AI Model Configuration - Together.ai
// Cost-efficient model choices for different tasks
export const AI_MODELS = {
  summary: process.env.AI_MODEL_SUMMARY || "meta-llama/Meta-Llama-3-70B-Instruct-Turbo",
  analysis: process.env.AI_MODEL_ANALYSIS || "meta-llama/Meta-Llama-3-70B-Instruct-Turbo",
  strategy: process.env.AI_MODEL_STRATEGY || "meta-llama/Meta-Llama-3-70B-Instruct-Turbo",
};

// Cost estimates per 1M tokens (approximate)
export const AI_COSTS = {
  summary: { input: 0.9, output: 0.9 }, // Llama 3 70B
  analysis: { input: 0.9, output: 0.9 },
  strategy: { input: 0.9, output: 0.9 },
};

// AI Service class for Together.ai integration
export class AIService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TOGETHER_API_KEY || "";
    if (!this.apiKey) {
      console.warn("TOGETHER_API_KEY not set. AI functionality will be limited.");
    }
    
    this.model = AI_MODELS.analysis;
  }

  async generateResponse(
    messages: CoreMessage[],
    temperature: number = 0.7,
    maxTokens: number = 2000,
    model?: string
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    if (!this.apiKey) {
      throw new Error("AI API key not configured");
    }

    try {
      const provider = together(this.apiKey, { model: model || this.model });
      
      // Note: This uses the AI SDK's provider integration
      // In production, you'd use the actual Together API directly
      const response = await provider.chat(this.model, {
        messages,
        temperature,
        maxTokens,
        responseFormat: { type: "json_object" },
      });

      return {
        content: response.messages[0]?.content?.toString() || "",
        inputTokens: 0, // Would need to parse from actual API response
        outputTokens: 0,
      };
    } catch (error) {
      console.error("AI API error:", error);
      throw new Error(`AI generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Cost calculation helper
  calculateCost(model: keyof typeof AI_COSTS, inputTokens: number, outputTokens: number): number {
    const costs = AI_COSTS[model];
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