import { z } from "zod";

// AI Model Configuration - Together.ai
// Together.ai provides OpenAI-compatible API
// Using serverless models that work without dedicated endpoints
export const AI_MODELS = {
  summary: process.env.AI_MODEL_SUMMARY || "MiniMaxAI/MiniMax-M2.7",
  analysis: process.env.AI_MODEL_ANALYSIS || "MiniMaxAI/MiniMax-M2.7",
  strategy: process.env.AI_MODEL_STRATEGY || "MiniMaxAI/MiniMax-M2.7",
};

// Fallback models (used if primary model fails)
export const AI_FALLBACK_MODELS = {
  summary: process.env.AI_MODEL_SUMMARY_FALLBACK || null,
  analysis: process.env.AI_MODEL_ANALYSIS_FALLBACK || null,
  strategy: process.env.AI_MODEL_STRATEGY_FALLBACK || null,
};

// Cost estimates per 1M tokens (approximate)
export const AI_COSTS = {
  summary: { input: 0.01, output: 0.01 }, // MiniMax M2.7
  analysis: { input: 0.01, output: 0.01 },
  strategy: { input: 0.01, output: 0.01 },
};

// Model type for type-safe model selection
export type ModelType = "summary" | "analysis" | "strategy";

// AI Service class for Together.ai integration
export class AIService {
  private apiKey: string;
  private apiUrl: string;
  private requestTimeoutMs: number;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TOGETHER_API_KEY || "";
    if (!this.apiKey) {
      console.warn("TOGETHER_API_KEY not set. AI functionality will be limited.");
    }

    this.apiUrl = "https://api.together.xyz/v1/chat/completions";
    this.requestTimeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "30000"); // 30 seconds default
  }

  private resolveModel(model?: ModelType | string): string {
    if (!model) return AI_MODELS.analysis;
    if (model === "summary" || model === "analysis" || model === "strategy") {
      return AI_MODELS[model];
    }
    // Assume it's already a model string if not a ModelType
    return model;
  }

  private getFallbackModel(modelType?: ModelType): string | null {
    if (!modelType) return null;
    return AI_FALLBACK_MODELS[modelType] || null;
  }

  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    temperature: number = 0.7,
    maxTokens:  number = 2000,
    model?: ModelType | string,
    maxRetries: number = 1
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; modelUsed: string }> {
    if (!this.apiKey) {
      throw new Error("AI API key not configured");
    }

    const primaryModel = this.resolveModel(model);
    const modelType = typeof model === 'string' && ["summary", "analysis", "strategy"].includes(model) ? model as ModelType : null;
    const fallbackModel = this.getFallbackModel(modelType);

    const attemptGenerate = async (modelToUse: string, attemptMaxTokens: number, attempt: number = 1): Promise<{ content: string; inputTokens: number; outputTokens: number }> => {
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
            model: modelToUse,
            messages,
            temperature,
            max_tokens: attemptMaxTokens,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          
          // Log detailed error information
          this.logAPIError(response.status, errorBody, modelToUse, attempt);
          
          // Distinguish between transport errors and API errors
          const error = this.classifyError(response.status, errorBody);
          throw error;
        }

        const data = await response.json();

        let content = data.choices[0]?.message?.content || "";

        // Try to fix common JSON issues
        content = this.fixJSON(content);

        // Validate it's valid JSON
        try {
          JSON.parse(content);
        } catch (jsonError) {
          // If still invalid, try to fix more issues
          content = this.fixJSON(content, true);
          try {
            JSON.parse(content);
          } catch (finalError) {
            // Still invalid JSON - log and handle
            this.logJSONError(content, modelToUse);
            throw new Error(`Invalid JSON response from AI: ${finalError instanceof Error ? finalError.message : 'Unknown JSON error'}`);
          }
        }

        return {
          content,
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        
        // Handle fetch/network errors specifically
        if (error instanceof TypeError && error.message.includes('fetch')) {
          const fetchError = new Error(`Network/transport error: ${error.message}`);
          fetchError.name = 'FetchError';
          throw fetchError;
        }
        
        if (error.name === 'AbortError') {
          const timeoutError = new Error(`Request timeout after ${this.requestTimeoutMs}ms`);
          timeoutError.name = 'TimeoutError';
          throw timeoutError;
        }
        
        throw error; // Re-throw other errors
      }
    };

    try {
      // First attempt with primary model
      const result = await attemptGenerate(primaryModel, maxTokens, 1);
      return { ...result, modelUsed: primaryModel };
    } catch (firstError) {
      const errorMessage = firstError instanceof Error ? firstError.message : "Unknown error";
      const errorType = firstError instanceof Error ? firstError.name : "UnknownError";
      
      console.warn(`Primary model ${primaryModel} failed (${errorType}): ${errorMessage}`);

      // Classify the error type
      const isTransportError = this.isTransportError(firstError);
      const isTimeoutError = errorType === 'TimeoutError';
      const isJSONError = errorMessage.includes("JSON");

      // Transport/timeout errors: retry same model before falling back
      if ((isTransportError || isTimeoutError) && maxRetries > 0) {
        console.log(`Transport/timeout error detected, retrying ${primaryModel} (${maxRetries} attempts remaining)...`);
        try {
          const result = await attemptGenerate(primaryModel, maxTokens, 2);
          return { ...result, modelUsed: primaryModel };
        } catch (retryError) {
          console.warn(`Retry failed for ${primaryModel}: ${retryError instanceof Error ? retryError.message : "Unknown error"}`);
          // Continue to fallback after retry failure
        }
      }

      // Try fallback model if primary failed and fallback exists
      if (fallbackModel) {
        console.log(`Attempting fallback model: ${fallbackModel}`);
        try {
          const result = await attemptGenerate(fallbackModel, maxTokens, 1);
          return { ...result, modelUsed: fallbackModel };
        } catch (fallbackError) {
          console.error(`Fallback model ${fallbackModel} also failed: ${fallbackError instanceof Error ? fallbackError.message : "Unknown error"}`);
        }
      }

      // If JSON is invalid, retry with more tokens (in case response was truncated)
      if (isJSONError) {
        console.warn("Initial JSON parse failed, retrying with more tokens...");
        try {
          const result = await attemptGenerate(primaryModel, maxTokens * 2, 1);
          return { ...result, modelUsed: primaryModel };
        } catch (secondError) {
          // Try fallback with expanded tokens
          if (fallbackModel) {
            try {
              const result =  await attemptGenerate(fallbackModel, maxTokens * 2, 1);
              return { ...result, modelUsed: fallbackModel };
            } catch (fallbackError) {
              console.error("JSON retry also failed:", fallbackError);
              throw new Error(`AI generation failed after JSON retry: ${secondError instanceof Error ? secondError.message : "Unknown error"}`);
            }
          }
          console.error("JSON retry also failed:", secondError);
          throw new Error(`AI generation failed after JSON retry: ${secondError instanceof Error ? secondError.message : "Unknown error"}`);
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
  calculateCost(modelType: ModelType, inputTokens: number, outputTokens: number): number {
    const costs = AI_COSTS[modelType];
    return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
  }

  // Error classification helpers
  private classifyError(status: number, errorBody: string): Error {
    if (status >= 500) {
      // Server-side errors (503, 504, etc.)
      return new Error(`AI API server error: ${status} ${errorBody}`);
    } else if (status === 429) {
      // Rate limiting
      return new Error(`Rate limited: ${errorBody}`);
    } else if (status >= 400) {
      // Client errors (401, 403, 404)
      return new Error(`AI API client error: ${status} ${errorBody}`);
    }
    return new Error(`AI API unknown error: ${status} ${errorBody}`);
  }

  private isTransportError(error: any): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      error.name === 'FetchError' ||
      error.name === 'TimeoutError' ||
      errorMessage.includes('fetch failed') ||
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('ECONN') ||
      errorMessage.includes('socket') ||
      errorMessage.includes('aborted') ||
      errorMessage.includes('DNS') ||
      errorMessage.includes('TLS')
    );
  }

  private logAPIError(status: number, errorBody: string, model: string, attempt: number): void {
    console.error(`[AI Error] Model: ${model}, Attempt: ${attempt}, Status: ${status}`);
    console.error(`[AI Error] Response: ${errorBody.substring(0, 200)}${errorBody.length > 200 ? '...' : ''}`);
    
    // Log specific error details for debugging
    if (errorBody.includes('rate limit')) {
      console.error(`[AI Error] Rate limit exceeded`);
    } else if (status === 503) {
      console.error(`[AI Error] Service unavailable - model may be overloaded`);
    } else if (status === 504) {
      console.error(`[AI Error] Gateway timeout - request took too long`);
    }
  }

  private logJSONError(content: string, model: string): void {
    console.error(`[JSON Error] Model: ${model}`);
    console.error(`[JSON Error] Content preview: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    
    // Check for common JSON issues
    if (content.trim().endsWith(',') || content.includes(',}') || content.includes(',]')) {
      console.error(`[JSON Error] Trailing comma detected`);
    }
    if (!content.trim().startsWith('{') || !content.trim().endsWith('}')) {
      console.error(`[JSON Error] Missing JSON braces`);
    }
    const quoteCount = (content.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      console.error(`[JSON Error] Unbalanced quotes (${quoteCount} quotes)`);
    }
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