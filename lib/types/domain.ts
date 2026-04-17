// Domain types for The Next Big Thing Theory
// These are shared between the API, AI service, and UI

export interface BusinessContext {
  name: string;
  websiteUrl: string;
  category?: string;
  region?: string;
  notes?: string;
}

export interface CompanyData {
  name: string;
  description?: string;
  websiteUrl?: string;
  isMain?: boolean;
  revenueEstimate?: string;
  marketShare?: string;
}

export interface EvidenceItem {
  sourceUrl: string;
  snippet: string;
  relevanceScore: number;
}

export interface FactorScore {
  factorId: number;
  score: number; // 0-10
  confidence: number; // 0-1
  explanation: string;
  evidence: EvidenceItem[];
}

export interface CompanyFactorScore {
  companyId: number;
  companyName: string;
  scores: FactorScore[];
}

export interface AnalysisFactor {
  id?: number;
  name: string;
  description: string;
  isEliminated: boolean;
  isReduced: boolean;
  isRaised: boolean;
  isNewCreation: boolean;
}

export interface ValueCurvePoint {
  factor: string;
  currentScore: number;
  proposedScore: number;
  change: number; // positive = raise, negative = reduce/eliminate
}

export interface NextBigThingStrategy {
  id?: number;
  title: string;
  summary: string;
  eliminate: string;
  reduce: string;
  raise: string;
  create: string;
  valueCurve: ValueCurvePoint[];
  targetCustomer: string;
  positioningStatement: string;
  risks: string[];
  difficulty: number; // 1-10
  operationalImplications: string;
  revenuePotential?: string;
}

export interface CanvasData {
  factors: AnalysisFactor[];
  companies: {
    id: number;
    name: string;
    isMain: boolean;
    scores: { [factorId: number]: { score: number; confidence: number } };
  }[];
}

export interface StrategyReport {
  id?: number;
  title: string;
  executiveSummary: string;
  currentPositioning: {
    mainCompany: CompanyData;
    competitors: CompanyData[];
    keyFindings: string[];
  };
  competitorAnalysis: {
    marketPosition: string;
    competitive advantages: string[];
    weaknesses: string[];
  };
  nextBigThingOptions: NextBigThingStrategy[];
  recommendedStrategy?: NextBigThingStrategy;
  confidenceScore: number;
  createdAt: string;
}

export type AnalysisStage = 
  | "business_research"
  | "competitor_discovery"
  | "competitor_normalization"
  | "factor_generation"
  | "company_scoring"
  | "strategy_canvas"
  | "next_big_thing"
  | "report_assembly"
  | "complete";

export interface AnalysisRun {
  id: number;
  projectId: number;
  stage: AnalysisStage;
  status: "pending" | "running" | "completed" | "failed";
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  error?: string;
  costCents?: number;
  elapsedSeconds?: number;
  createdAt: string;
  completedAt?: string;
}

// AI Response Types (intermediate between AI and database)
export interface BusinessResearchResult {
  summary: string;
  keyStrengths: string[];
  keyWeaknesses: string[];
  marketPosition: string;
  uniqueValueProposition: string;
}

export interface CompetitorDiscoveryResult {
  competitors: CompanyData[];
  marketSize?: string;
  growthRate?: string;
}

export interface NormalizedCompetitor {
  id?: number;
  name: string;
  description: string;
  websiteUrl?: string;
  revenueEstimate?: string;
  marketShare?: string;
  isMain: boolean;
}

export interface GeneratedFactor {
  name: string;
  description: string;
  isEliminated: boolean;
  isReduced: boolean;
  isRaised: boolean;
  isNewCreation: boolean;
}

export interface CompanyScoreResult {
  companyId: number;
  companyName: string;
  scores: { [factorName: string]: FactorScore };
}

export interface StrategyCanvasResult {
  factors: GeneratedFactor[];
  scores: CompanyScoreResult[];
}

export interface NextBigThingResult {
  strategies: NextBigThingStrategy[];
  summary: string;
}