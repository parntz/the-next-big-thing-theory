import { z } from "zod";

// AI Model Configuration - Together.ai
// Together.ai provides OpenAI-compatible API
// Using serverless models that work without dedicated endpoints
export const AI_MODELS = {
  summary: process.env.AI_MODEL_SUMMARY || "MiniMaxAI/MiniMax-M2.7",
  analysis: process.env.AI_MODEL_ANALYSIS || "MiniMaxAI/MiniMax-M2.7",
  strategy: process.env.AI_MODEL_STRATEGY || "MiniMaxAI/MiniMax-M2.7",
};

// Cost estimates per 1M tokens (approximate)
export const AI_COSTS = {
  summary: { input: 0.01, output: 0.01 }, // MiniMax M2.7
  analysis: { input: 0.01, output: 0.01 },
  strategy: { input: 0.01, output: 0.01 },
};

// AI Service class for Together.ai integration
export class AIService {
  private apiKey: string;
  private model: string;
  private apiUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TOGETHER_API_KEY || "";
    if (!this.apiKey) {
      console.warn("TOGETHER_API_KEY not set. AI functionality will be limited.");
    }
    
    this.model = AI_MODELS.analysis;
    this.apiUrl = "https://api.together.xyz/v1/chat/completions";
  }

  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    temperature: number = 0.7,
    maxTokens: number = 2000,
    model?: string
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    if (!this.apiKey) {
      throw new Error("AI API key not configured");
    }

    const attemptGenerate = async (attemptMaxTokens: number): Promise<{ content: string; inputTokens: number; outputTokens: number }> => {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || this.model,
          messages,
          temperature,
          max_tokens: attemptMaxTokens,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`AI API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      
      let content = data.choices[0]?.message?.content || "";
      
      // Try to fix common JSON issues
      content = this.fixJSON(content);
      
      // Validate it's valid JSON
      try {
        JSON.parse(content);
      } catch {
        // If still invalid, try to fix more issues
        content = this.fixJSON(content, true);
        JSON.parse(content); // Will throw if still invalid
      }
      
      return {
        content,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      };
    };

    try {
      // First attempt
      return await attemptGenerate(maxTokens);
    } catch (firstError) {
      // If JSON is invalid, retry with more tokens (in case response was truncated)
      if (firstError.message.includes("JSON")) {
        console.warn("Initial JSON parse failed, retrying with more tokens...");
        try {
          return await attemptGenerate(maxTokens * 2);
        } catch (secondError) {
          console.error("Retry also failed:", secondError);
          throw new Error(`AI generation failed after retry: ${secondError instanceof Error ? secondError.message : "Unknown error"}`);
        }
      }
      throw firstError;
    }
  }

  // Helper to fix common JSON issues
  fixJSON(str: string, aggressive: boolean = false): string {
    // Remove trailing commas before closing braces/brackets
    str = str.replace(/,(\s*[}\]])/g, '$1');
    
    if (aggressive) {
      // Try to find and fix unterminated strings
      // Look for patterns like "value that didn't close
      const unterminatedMatch = str.match(/"([^"\\]|\\.)*$/);
      if (unterminatedMatch) {
        // Find where the unterminated string starts and try to close it
        const beforeUnterminated = str.substring(0, unterminatedMatch.index);
        const unterminated = unterminatedMatch[0];
        // Try to find the proper end by looking for the next property or closing brace
        const fixed = beforeUnterminated + unterminated + '" }';
        try {
          JSON.parse(fixed);
          return fixed;
        } catch {
          // If still invalid, return original for error propagation
        }
      }
    }
    
    return str;
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