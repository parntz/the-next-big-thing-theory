import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { 
  Project, 
  NewProject, 
  Company, 
  NewCompany, 
  Competitor, 
  NewCompetitor,
  AnalysisRun,
  NewAnalysisRun,
  Factor,
  NewFactor,
  CompanyFactorScore,
  NewCompanyFactorScore,
  EvidenceItem,
  NewEvidenceItem,
  NextBigThingOption,
  NewNextBigThingOption,
  Report,
  NewReport
} from "../db/schema";

// Project Service
export async function createProject(data: NewProject): Promise<Project> {
  const db = getDb();
  const [project] = await db.insert(schema.projects).values(data).returning();
  return project;
}

export async function getProject(id: number): Promise<Project | undefined> {
  const db = getDb();
  return db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
}

export async function updateProject(id: number, data: Partial<NewProject>): Promise<Project | undefined> {
  const db = getDb();
  const [project] = await db
    .update(schema.projects)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, id))
    .returning();
  return project;
}

export async function listProjects(limit: number = 100): Promise<Project[]> {
  const db = getDb();
  return db.query.projects.findMany({
    orderBy: [sql`created_at DESC`],
    limit,
  });
}

// Company Service
export async function createCompany(data: NewCompany): Promise<Company> {
  const db = getDb();
  const [company] = await db.insert(schema.companies).values(data).returning();
  return company;
}

export async function getCompaniesByProject(projectId: number): Promise<Company[]> {
  const db = getDb();
  return db.query.companies.findMany({
    where: eq(schema.companies.projectId, projectId),
  });
}

export async function getCompany(id: number): Promise<Company | undefined> {
  const db = getDb();
  return db.query.companies.findFirst({
    where: eq(schema.companies.id, id),
  });
}

export async function updateCompany(id: number, data: Partial<NewCompany>): Promise<Company | undefined> {
  const db = getDb();
  const [company] = await db
    .update(schema.companies)
    .set(data)
    .where(eq(schema.companies.id, id))
    .returning();
  return company;
}

// Competitor Service
export async function createCompetitor(data: NewCompetitor): Promise<Competitor> {
  const db = getDb();
  const [competitor] = await db.insert(schema.competitors).values(data).returning();
  return competitor;
}

export async function getCompetitorsByProject(projectId: number): Promise<Competitor[]> {
  const db = getDb();
  return db.query.competitors.findMany({
    where: eq(schema.competitors.projectId, projectId),
  });
}

export async function getCompetitor(id: number): Promise<Competitor | undefined> {
  const db = getDb();
  return db.query.competitors.findFirst({
    where: eq(schema.competitors.id, id),
  });
}

// Analysis Run Service
export async function createAnalysisRun(data: NewAnalysisRun): Promise<AnalysisRun> {
  const db = getDb();
  const [analysisRun] = await db.insert(schema.analysisRuns).values(data).returning();
  return analysisRun;
}

export async function getAnalysisRun(id: number): Promise<AnalysisRun | undefined> {
  const db = getDb();
  return db.query.analysisRuns.findFirst({
    where: eq(schema.analysisRuns.id, id),
  });
}

export async function getAnalysisRunsByProject(projectId: number): Promise<AnalysisRun[]> {
  const db = getDb();
  return db.query.analysisRuns.findMany({
    where: eq(schema.analysisRuns.projectId, projectId),
    orderBy: [schema.analysisRuns.createdAt],
  });
}

export async function updateAnalysisRun(
  id: number,
  data: Partial<NewAnalysisRun>
): Promise<AnalysisRun | undefined> {
  const db = getDb();
  const [analysisRun] = await db
    .update(schema.analysisRuns)
    .set(data)
    .where(eq(schema.analysisRuns.id, id))
    .returning();
  return analysisRun;
}

// Factor Service
export async function createFactor(data: NewFactor): Promise<Factor> {
  const db = getDb();
  const [factor] = await db.insert(schema.factors).values(data).returning();
  return factor;
}

export async function getFactorsByProject(projectId: number): Promise<Factor[]> {
  const db = getDb();
  return db.query.factors.findMany({
    where: eq(schema.factors.projectId, projectId),
  });
}

export async function updateFactor(id: number, data: Partial<NewFactor>): Promise<Factor | undefined> {
  const db = getDb();
  const [factor] = await db
    .update(schema.factors)
    .set(data)
    .where(eq(schema.factors.id, id))
    .returning();
  return factor;
}

// Company Factor Score Service
export async function createCompanyFactorScore(data: NewCompanyFactorScore): Promise<CompanyFactorScore> {
  const db = getDb();
  const [score] = await db.insert(schema.companyFactorScores).values(data).returning();
  return score;
}

export async function getCompanyFactorScoresByProject(projectId: number): Promise<CompanyFactorScore[]> {
  const db = getDb();
  return db.query.companyFactorScores.findMany({
    where: eq(schema.companyFactorScores.projectId, projectId),
  });
}

export async function getScoresForCompany(companyId: number): Promise<CompanyFactorScore[]> {
  const db = getDb();
  return db.query.companyFactorScores.findMany({
    where: eq(schema.companyFactorScores.companyId, companyId),
  });
}

// Evidence Item Service
export async function createEvidenceItem(data: NewEvidenceItem): Promise<EvidenceItem> {
  const db = getDb();
  const [evidence] = await db.insert(schema.evidenceItems).values(data).returning();
  return evidence;
}

export async function getEvidenceByProject(projectId: number): Promise<EvidenceItem[]> {
  const db = getDb();
  return db.query.evidenceItems.findMany({
    where: eq(schema.evidenceItems.projectId, projectId),
  });
}

export async function getEvidenceByCompany(companyId: number): Promise<EvidenceItem[]> {
  const db = getDb();
  return db.query.evidenceItems.findMany({
    where: eq(schema.evidenceItems.companyId, companyId),
  });
}

// Next Big Thing Option Service
export async function createNextBigThingOption(data: NewNextBigThingOption): Promise<NextBigThingOption> {
  const db = getDb();
  const [option] = await db.insert(schema.nextBigThingOptions).values(data).returning();
  return option;
}

export async function getNextBigThingOptionsByProject(projectId: number): Promise<NextBigThingOption[]> {
  const db = getDb();
  return db.query.nextBigThingOptions.findMany({
    where: eq(schema.nextBigThingOptions.projectId, projectId),
  });
}

export async function getNextBigThingOption(id: number): Promise<NextBigThingOption | undefined> {
  const db = getDb();
  return db.query.nextBigThingOptions.findFirst({
    where: eq(schema.nextBigThingOptions.id, id),
  });
}

// Report Service
export async function createReport(data: NewReport): Promise<Report> {
  const db = getDb();
  const [report] = await db.insert(schema.reports).values(data).returning();
  return report;
}

export async function getReportByProject(projectId: number): Promise<Report | undefined> {
  const db = getDb();
  return db.query.reports.findFirst({
    where: eq(schema.reports.projectId, projectId),
    orderBy: [schema.reports.createdAt.desc],
  });
}

export async function updateReport(id: number, data: Partial<NewReport>): Promise<Report | undefined> {
  const db = getDb();
  const [report] = await db
    .update(schema.reports)
    .set(data)
    .where(eq(schema.reports.id, id))
    .returning();
  return report;
}

// Initialize analysis stages
export async function initializeAnalysis(projectId: number): Promise<AnalysisRun> {
  const db = getDb();
  
  const analysisRun = await createAnalysisRun({
    projectId,
    stage: "business_research",
    status: "pending",
  });
  
  return analysisRun;
}

// Get next pending analysis stage
export async function getNextPendingStage(projectId: number): Promise<AnalysisRun | undefined> {
  const db = getDb();
  
  const analysisRuns = await getAnalysisRunsByProject(projectId);
  
  // Find the first pending or running stage
  const pendingStage = analysisRuns.find(
    run => run.status === "pending" || run.status === "running"
  );
  
  return pendingStage;
}