import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  real,
} from "drizzle-orm/sqlite-core";

/**
 * Users table - stores user accounts
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"), // Nullable for existing users
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Projects table - represents a market analysis project
 */
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .references(() => users.id),
  name: text("name").notNull(),
  websiteUrl: text("website_url").notNull(),
  category: text("category"),
  region: text("region"),
  notes: text("notes"),
  status: text("status", {
    enum: ["pending", "researching", "analyzing", "complete", "failed"],
  }).default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Companies table - stores company information
 */
export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  name: text("name").notNull(),
  websiteUrl: text("website_url"),
  description: text("description"),
  isMainCompany: integer("is_main_company", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Competitors table - stores competitor data
 */
export const competitors = sqliteTable("competitors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  description: text("description"),
  isMain: integer("is_main", { mode: "boolean" }).default(false),
  isTopCompetitor: integer("is_top_competitor", { mode: "boolean" }).default(false),
  websiteUrl: text("website_url"),
  revenueEstimate: text("revenue_estimate"),
  marketShare: text("market_share"),
  competitiveScore: integer("competitive_score"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Analysis runs table - tracks analysis pipeline stages
 */
export const analysisRuns = sqliteTable("analysis_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  stage: text("stage", {
    enum: [
      "business_research",
      "competitor_discovery",
      "competitor_normalization",
      "deep_main_research",        // NEW: Deep dive on main company
      "deep_competitor_research",   // NEW: Deep dive on competitors
      "competitor_selection",      // NEW: Deep website reading & selection of top 6
      "review_aggregation",         // NEW: Aggregate reviews from multiple sources
      "factor_generation",
      "company_scoring",
      "strategy_canvas",
      "next_big_thing",
      "report_assembly",
      "complete",
    ],
  }).notNull(),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"],
  }).notNull(),
  inputData: text("input_data", { mode: "json" }),
  outputData: text("output_data", { mode: "json" }),
  error: text("error"),
  costCents: real("cost_cents"),
  elapsedSeconds: real("elapsed_seconds"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

/**
 * Factors table - strategy canvas factors
 */
export const factors = sqliteTable("factors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isEliminated: integer("is_eliminated", { mode: "boolean" }).default(false),
  isReduced: integer("is_reduced", { mode: "boolean" }).default(false),
  isRaised: integer("is_raised", { mode: "boolean" }).default(false),
  isNewCreation: integer("is_new_creation", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Company factor scores - scores for each company on each factor
 */
export const companyFactorScores = sqliteTable("company_factor_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  companyId: integer("company_id")
    .references(() => companies.id)
    .notNull(),
  factorId: integer("factor_id")
    .references(() => factors.id)
    .notNull(),
  score: real("score").notNull(), // 0-10
  confidence: real("confidence").notNull(), // 0-1
  explanation: text("explanation").notNull(),
  evidence: text("evidence", { mode: "json" }), // Array of evidence items
  isMainCompany: integer("is_main_company", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Evidence items - supporting evidence for scores
 */
export const evidenceItems = sqliteTable("evidence_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  companyId: integer("company_id").references(() => companies.id),
  sourceUrl: text("source_url").notNull(),
  snippet: text("snippet").notNull(),
  relevanceScore: real("relevance_score").notNull(), // 0-1
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Next big thing strategy options
 */
export const nextBigThingOptions = sqliteTable("next_big_thing_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  analysisRunId: integer("analysis_run_id").references(() => analysisRuns.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  eliminate: text("eliminate").notNull(), // What to eliminate
  reduce: text("reduce").notNull(), // What to reduce
  raise: text("raise").notNull(), // What to raise
  create: text("create").notNull(), // What to create
  valueCurve: text("value_curve", { mode: "json" }), // Array of score changes
  targetCustomer: text("target_customer").notNull(),
  positioningStatement: text("positioning_statement").notNull(),
  risks: text("risks", { mode: "json" }), // Array of risks
  difficulty: integer("difficulty").notNull(), // 1-10
  operationalImplications: text("operational_implications").notNull(),
  revenuePotential: text("revenue_potential"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Final reports
 */
export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  analysisRunId: integer("analysis_run_id").references(() => analysisRuns.id),
  title: text("title").notNull(),
  executiveSummary: text("executive_summary").notNull(),
  currentPositioning: text("current_positioning", { mode: "json" }),
  competitorAnalysis: text("competitor_analysis", { mode: "json" }),
  nextBigThingOptions: text("next_big_thing_options", { mode: "json" }),
  recommendedStrategy: text("recommended_strategy"),
  confidenceScore: real("confidence_score").notNull(), // 0-1
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Export types for use in application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;

export type AnalysisRun = typeof analysisRuns.$inferSelect;
export type NewAnalysisRun = typeof analysisRuns.$inferInsert;

export type Factor = typeof factors.$inferSelect;
export type NewFactor = typeof factors.$inferInsert;

export type CompanyFactorScore = typeof companyFactorScores.$inferSelect;
export type NewCompanyFactorScore = typeof companyFactorScores.$inferInsert;

export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type NewEvidenceItem = typeof evidenceItems.$inferInsert;

export type NextBigThingOption = typeof nextBigThingOptions.$inferSelect;
export type NewNextBigThingOption = typeof nextBigThingOptions.$inferInsert;

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;