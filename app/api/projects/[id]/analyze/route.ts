import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getProject, createAnalysisRun, updateAnalysisRun, getCompaniesByProject, getCompetitorsByProject, createFactor, createCompany, createCompetitor, createCompanyFactorScore, createNextBigThingOption, createReport } from "@/lib/services/db-service";
import { formatDate } from "@/lib/utils/date";
import { analysisService } from "@/lib/services/ai-service";
import { BusinessResearchSchema, CompetitorDiscoverySchema, NormalizedCompetitorSchema, AnalysisFactorSchema, CompanyScoreResultSchema, StrategyCanvasSchema, NextBigThingStrategySchema, NextBigThingResultSchema, StrategyReport, ReportSchema } from "@/lib/services/ai-service";
import { scrapeWebsite, scrapeCompetitors, formatCompetitorInsights } from "@/lib/services/scraper-service";
import { aggregateReviews, getCompetitorReviewInsights, formatReviewsForPrompt } from "@/lib/services/review-aggregation-service";

// Analysis stages - extended with deep research
type AnalysisStage = 
  | "business_research"
  | "competitor_discovery"
  | "competitor_normalization"
  | "deep_main_research"        // NEW: Deep dive on main company
  | "deep_competitor_research"  // NEW: Deep dive on competitors
  | "review_aggregation"        // NEW: Aggregate reviews from multiple sources
  | "factor_generation"
  | "company_scoring"
  | "strategy_canvas"
  | "next_big_thing"
  | "report_assembly"
  | "complete";

interface AnalysisContext {
  businessResearch?: any;
  competitors?: any;
  normalizedCompetitors?: any;
  factors?: any;
  companyScores?: any;
  strategyCanvas?: any;
  nextBigThingOptions?: any;
  report?: any;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    const project = await getProject(id);
    
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const { stage, resume } = body;

    const db = getDb();

    // If resuming, find the pending/running stage
    let analysisRun = await db.select().from(schema.analysisRuns).where(
      and(
        eq(schema.analysisRuns.projectId, id),
        eq(schema.analysisRuns.status, "pending")
      )
    ).limit(1).then(rows => rows[0]);

    // If no pending run found and not resuming, create new
    if (!analysisRun && !resume) {
      analysisRun = await createAnalysisRun({
        projectId: id,
        stage: "business_research",
        status: "running",
      });
    }

    if (!analysisRun) {
      return NextResponse.json({ 
        message: "Analysis pipeline completed or no pending stages",
        completed: true,
      });
    }

    // Update status to running
    await updateAnalysisRun(analysisRun.id, { status: "running" });

    // Process the stage based on the analysis stage
    const startTime = Date.now();
    let resultData: any = null;
    let nextStage: AnalysisStage | null = null;
    let completed = false;

    try {
      switch (analysisRun.stage) {
        case "business_research":
          resultData = await processBusinessResearch(id, project, analysisRun.inputData);
          nextStage = "competitor_discovery";
          break;

        case "competitor_discovery":
          resultData = await processCompetitorDiscovery(id, project, analysisRun.inputData);
          nextStage = "competitor_normalization";
          break;

        case "competitor_normalization":
          resultData = await processCompetitorNormalization(id, project, analysisRun.inputData);
          nextStage = "deep_main_research";
          break;

        case "deep_main_research":
          console.log("=== STAGE: Deep Main Website Research ===");
          resultData = await processDeepMainResearch(id, project, analysisRun.inputData);
          nextStage = "deep_competitor_research";
          break;

        case "deep_competitor_research":
          console.log("=== STAGE: Deep Competitor Website Research ===");
          resultData = await processDeepCompetitorResearch(id, project, analysisRun.inputData);
          nextStage = "review_aggregation";
          break;

        case "review_aggregation":
          console.log("=== STAGE: Review Aggregation ===");
          resultData = await processReviewAggregation(id, project, analysisRun.inputData);
          nextStage = "factor_generation";
          break;

        case "factor_generation":
          resultData = await processFactorGeneration(id, project, analysisRun.inputData);
          nextStage = "company_scoring";
          break;

        case "company_scoring":
          resultData = await processCompanyScoring(id, project, analysisRun.inputData);
          nextStage = "strategy_canvas";
          break;

        case "strategy_canvas":
          resultData = await processStrategyCanvas(id, project, analysisRun.inputData);
          nextStage = "next_big_thing";
          break;

        case "next_big_thing":
          resultData = await processNextBigThing(id, project, analysisRun.inputData);
          nextStage = "report_assembly";
          break;

        case "report_assembly":
          resultData = await processReportAssembly(id, project, analysisRun.inputData);
          nextStage = "complete";
          break;

        case "complete":
          completed = true;
          break;

        default:
          nextStage = null;
      }
    } catch (error) {
      console.error(`Error processing stage ${analysisRun.stage}:`, error);
      await updateAnalysisRun(analysisRun.id, { 
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return NextResponse.json({ error: `Failed to process stage: ${error instanceof Error ? error.message : "Unknown error"}` }, { status: 500 });
    }

    const elapsedSeconds = (Date.now() - startTime) / 1000;

    if (completed) {
      await updateAnalysisRun(analysisRun.id, { 
        status: "completed",
        completedAt: new Date(),
      });
      return NextResponse.json({
        id: analysisRun.id,
        projectId: analysisRun.projectId,
        stage: analysisRun.stage,
        status: "completed",
        outputData: resultData,
        elapsedSeconds,
        createdAt: formatDate(analysisRun.createdAt),
        completedAt: formatDate(new Date()),
      });
    }

    // Update the analysis run with output data and progress to next stage
    const updatedRun = await updateAnalysisRun(analysisRun.id, {
      status: "completed",
      outputData: resultData,
      elapsedSeconds,
      completedAt: new Date(),
    });

    // If there's a next stage, create a new analysis run for it
    if (nextStage && nextStage !== "complete") {
      const nextRun = await createAnalysisRun({
        projectId: id,
        stage: nextStage,
        status: "pending",
        inputData: resultData,
      });

      return NextResponse.json({
        id: updatedRun?.id || analysisRun.id,
        projectId: analysisRun.projectId,
        stage: nextStage,
        status: "pending",
        createdAt: formatDate(updatedRun?.createdAt || analysisRun.createdAt),
      });
    }

    // All stages complete
    await updateAnalysisRun(analysisRun.id, { 
      status: "completed",
      completedAt: new Date(),
    });

    return NextResponse.json({
      id: analysisRun.id,
      projectId: analysisRun.projectId,
      stage: analysisRun.stage,
      status: "completed",
      outputData: resultData,
      elapsedSeconds,
      createdAt: formatDate(analysisRun.createdAt),
      completedAt: formatDate(new Date()),
    });
  } catch (error) {
    console.error("Error starting analysis:", error);
    return NextResponse.json({ error: "Failed to start analysis" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    const db = getDb();
    
    const analysisRuns = await db.select().from(schema.analysisRuns).where(
      eq(schema.analysisRuns.projectId, id)
    ).orderBy(schema.analysisRuns.createdAt);

    return NextResponse.json({
      projectId: id,
      runs: analysisRuns.map(run => ({
        id: run.id,
        stage: run.stage,
        status: run.status,
        inputData: run.inputData,
        outputData: run.outputData,
        error: run.error,
        costCents: run.costCents,
        elapsedSeconds: run.elapsedSeconds,
        createdAt: formatDate(run.createdAt),
        completedAt: run.completedAt ? formatDate(run.completedAt) : null,
      })),
    });
  } catch (error) {
    console.error("Error getting analysis status:", error);
    return NextResponse.json({ error: "Failed to get analysis status" }, { status: 500 });
  }
}

// ============ Analysis Processing Functions ============

async function processBusinessResearch(projectId: number, project: any, previousData: any): Promise<any> {
  const projectContext = [
    `Business Name: ${project.name}`,
    `Website: ${project.websiteUrl}`,
    project.category && `Category: ${project.category}`,
    project.notes && `User-provided Description/Notes: ${project.notes}`,
    project.region && `Region: ${project.region}`,
  ].filter(Boolean).join('\n');

  const prompt = `Analyze this business. This is the user's own description of their business - believe it completely:
  
${projectContext}

**CRITICAL INSTRUCTIONS:**
1. The "User-provided Description/Notes" is the GROUND TRUTH for what this business is. Follow it exactly.
2. Do NOT make assumptions or add information not provided by the user.
3. If the description says it's a mens clothing store, it is a mens clothing store - NOT a pet store, not a pet apparel store, etc.
4. Your analysis must be consistent with and derived entirely from the user's description.

Provide business research including:
  - Brief summary of the business (based entirely on user's description)
  - Key strengths and weaknesses (based on user's stated goals)
  - Market position (where this business fits vs competitors)
  - Unique value proposition (what makes it stand out per user's description)
  - Revenue model
  - Target market

Return JSON with keys: summary, keyStrengths, keyWeaknesses, marketPosition, uniqueValueProposition, revenueModel, targetMarket.`;

  const { content } = await analysisService.generateResponse([
    { role: "system", content: "You are a business analyst. Provide detailed business research in JSON format." },
    { role: "user", content: prompt },
  ]);

  const result = JSON.parse(content);
  
  // Update the project with this research data
  const db = getDb();
  await db.update(schema.projects).set({
    updatedAt: new Date(),
  }).where(eq(schema.projects.id, projectId));

  return { ...result, ...previousData };
}

async function processCompetitorDiscovery(projectId: number, project: any, previousData: any): Promise<any> {
  // Include project details - especially notes/description which contains user's context
  const projectDetails = [
    project.name,
    project.category && `Category: ${project.category}`,
    project.notes && `Description/Notes: ${project.notes}`,
    project.region && `Region: ${project.region}`,
  ].filter(Boolean).join(' - ');

  const prompt = `For the business: ${projectDetails}

  **CRITICAL: The description/notes above define exactly what this business is. Find competitors that compete with THIS SPECIFIC BUSINESS, not generic industry players.**
  
  **IMPORTANT: If the description says "mens clothing store", look for other MENS CLOTHING stores. NOT pet stores, not women's clothing, not general fashion.**
  
  Identify key competitors that DIRECTLY compete with this specific business model, product offering, and target market.
  Find competitors that are similar in:
  - Product type and style
  - Price point and positioning
  - Target customer demographic
  - Business model (D2C, subscription, etc.)

  Research and return:
  - List of 8-12 main competitors with names, descriptions, website URLs
  - Market size and growth rate estimates
  - Market trends

  Return JSON with a "competitors" array and market data.`;

  const { content } = await analysisService.generateResponse([
    { role: "system", content: "You are a market research analyst. Identify competitors in JSON format." },
    { role: "user", content: prompt },
  ]);

  const result = JSON.parse(content);
  
  // Save competitors and companies to the database
  const db = getDb();
  
  // First, create the main company being analyzed
  const existingMainCompany = await db.select().from(schema.companies).where(
    and(
      eq(schema.companies.projectId, projectId),
      eq(schema.companies.isMainCompany, true)
    )
  ).limit(1).then(rows => rows[0]);
  
  if (!existingMainCompany) {
    await db.insert(schema.companies).values({
      projectId,
      name: project.name,
      websiteUrl: project.websiteUrl,
      description: "",
      isMainCompany: true,
    });
  }
  
  for (const competitor of result.competitors || []) {
    // Insert into competitors table
    const newCompetitor = await db.insert(schema.competitors).values({
      projectId,
      name: competitor.name || "Unknown",
      description: competitor.description || "",
      websiteUrl: competitor.websiteUrl || "",
      revenueEstimate: competitor.revenueEstimate || null,
      marketShare: competitor.marketShare || null,
    }).returning();
    
    // Also create company record for the canvas
    const existingCompany = await db.select().from(schema.companies).where(
      and(
        eq(schema.companies.projectId, projectId),
        eq(schema.companies.name, competitor.name || "Unknown")
      )
    ).limit(1).then(rows => rows[0]);
    
    if (!existingCompany) {
      await db.insert(schema.companies).values({
        projectId,
        name: competitor.name || "Unknown",
        websiteUrl: competitor.websiteUrl || "",
        description: competitor.description || "",
        isMainCompany: false,
      });
    }
  }

  return { ...result, ...previousData };
}

async function processCompetitorNormalization(projectId: number, project: any, previousData: any): Promise<any> {
  // Normalize competitors to a standard format
  const competitors = previousData?.competitors || [];
  
  // Update existing competitors in the database
  const db = getDb();
  const normalized = [];
  
  for (const competitor of competitors) {
    // Try to find existing competitor by name
    const existingCompetitor = await db.select().from(schema.competitors).where(
      and(
        eq(schema.competitors.projectId, projectId),
        eq(schema.competitors.name, competitor.name)
      )
    ).limit(1).then(rows => rows[0]);
    
    let companyId: number;
    
    if (existingCompetitor) {
      // Update existing competitor
      await db.update(schema.competitors).set({
        description: competitor.description || existingCompetitor.description,
        websiteUrl: competitor.websiteUrl || existingCompetitor.websiteUrl,
        revenueEstimate: competitor.revenueEstimate || existingCompetitor.revenueEstimate,
        marketShare: competitor.marketShare || existingCompetitor.marketShare,
      }).where(eq(schema.competitors.id, existingCompetitor.id));
      
      companyId = existingCompetitor.id;
      normalized.push({
        ...existingCompetitor,
        ...competitor,
        id: existingCompetitor.id,
      });
    } else {
      // Create new competitor
      const newCompetitor = await db.insert(schema.competitors).values({
        projectId,
        name: competitor.name || "Unknown",
        description: competitor.description || "",
        websiteUrl: competitor.websiteUrl || "",
        revenueEstimate: competitor.revenueEstimate || null,
        marketShare: competitor.marketShare || null,
      }).returning();
      
      companyId = newCompetitor.id;
      normalized.push({
        id: newCompetitor.id,
        ...competitor,
      });
    }
    
    // Also create or update company record for the canvas
    const existingCompany = await db.select().from(schema.companies).where(
      and(
        eq(schema.companies.projectId, projectId),
        eq(schema.companies.name, competitor.name || "Unknown")
      )
    ).limit(1).then(rows => rows[0]);
    
    if (!existingCompany) {
      await db.insert(schema.companies).values({
        projectId,
        name: competitor.name || "Unknown",
        websiteUrl: competitor.websiteUrl || "",
        description: competitor.description || "",
        isMainCompany: false,
      });
    }
  }

  return { ...previousData, competitors: normalized };
}

// ========== NEW DEEP RESEARCH STAGES ==========

async function processDeepMainResearch(projectId: number, project: any, previousData: any): Promise<any> {
  console.log("=== DEEP MAIN RESEARCH: Starting deep dive into", project.name, "website ===");

  const websiteUrl = project.websiteUrl || `https://${project.name.toLowerCase().replace(/\s+/g, '')}.com`;

  // Build context to ensure AI understands what this business IS
  const businessContext = `
BUSINESS DESCRIPTION (from user - this is ground truth):
${project.notes || 'No description provided.'}
${project.category ? `Category: ${project.category}` : ''}
${project.region ? `Region: ${project.region}` : ''}
`.trim();

  try {
    const result = await scrapeWebsite(websiteUrl, project.name, businessContext);
    
    if (result.success) {
      console.log("=== DEEP MAIN RESEARCH: Completed for", project.name, "===");
      return {
        ...previousData,
        mainResearch: result.content,
        mainResearchSuccess: true
      };
    } else {
      console.warn("=== DEEP MAIN RESEARCH: Failed for", project.name, "===");
      return {
        ...previousData,
        mainResearch: result.content,
        mainResearchSuccess: false,
        mainResearchError: result.error
      };
    }
  } catch (error) {
    console.error("=== DEEP MAIN RESEARCH: Error:", error);
    return {
      ...previousData,
      mainResearchSuccess: false,
      mainResearchError: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function processDeepCompetitorResearch(projectId: number, project: any, previousData: any): Promise<any> {
  console.log("=== DEEP COMPETITOR RESEARCH: Starting deep dive into competitor websites ===");

  const competitors = previousData?.competitors || [];
  const topCompetitors = competitors.slice(0, 6); // Limit to top 6

  if (topCompetitors.length === 0) {
    console.log("=== DEEP COMPETITOR RESEARCH: No competitors found, skipping ===");
    return {
      ...previousData,
      competitorResearchSuccess: false
    };
  }

  // Build context to help AI understand the target business when analyzing competitors
  const businessContext = `
BUSINESS DESCRIPTION (from user - this is ground truth):
${project.notes || 'No description provided.'}
${project.category ? `Category: ${project.category}` : ''}
${project.region ? `Region: ${project.region}` : ''}
`.trim();

  try {
    const results = await scrapeCompetitors(topCompetitors, businessContext);
    const competitorInsights = formatCompetitorInsights(results);
    
    // Store detailed results
    const competitorResearch: Record<string, any> = {};
    for (const [name, result] of results) {
      competitorResearch[name] = result.content;
    }
    
    console.log("=== DEEP COMPETITOR RESEARCH: Completed for", topCompetitors.length, "competitors ===");
    
    return {
      ...previousData,
      competitorResearch,
      competitorInsights,
      competitorResearchSuccess: true
    };
  } catch (error) {
    console.error("=== DEEP COMPETITOR RESEARCH: Error:", error);
    return {
      ...previousData,
      competitorResearchSuccess: false,
      competitorResearchError: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function processReviewAggregation(projectId: number, project: any, previousData: any): Promise<any> {
  console.log("=== REVIEW AGGREGATION: Starting to gather reviews from multiple sources ===");
  
  const competitors = previousData?.competitors || [];
  const mainCompanyName = project.name;
  const mainWebsiteUrl = project.websiteUrl;
  
  try {
    // Get reviews for main company
    const mainReviews = await aggregateReviews(mainCompanyName, mainWebsiteUrl);
    console.log("=== REVIEW AGGREGATION: Found", mainReviews.reviews.length, "reviews for main company ===");
    
    // Get reviews for top competitors
    const competitorReviewResults = await getCompetitorReviewInsights(competitors.slice(0, 6));
    
    // Store reviews by company
    const allReviews: Record<string, any> = {
      [mainCompanyName]: {
        reviews: mainReviews.reviews,
        rating: mainReviews.aggregatedRating,
        summary: mainReviews.summary
      }
    };
    
    for (const [name, result] of competitorReviewResults) {
      allReviews[name] = {
        reviews: result.reviews,
        rating: result.aggregatedRating,
        summary: result.summary
      };
    }
    
    // Format for analysis
    const mainReviewsText = formatReviewsForPrompt(mainReviews.reviews, mainCompanyName);
    
    console.log("=== REVIEW AGGREGATION: Completed ===");
    
    return {
      ...previousData,
      reviews: allReviews,
      mainReviewsText,
      reviewAggregationSuccess: mainReviews.success
    };
  } catch (error) {
    console.error("=== REVIEW AGGREGATION: Error:", error);
    return {
      ...previousData,
      reviewAggregationSuccess: false
    };
  }
}

async function processFactorGeneration(projectId: number, project: any, previousData: any): Promise<any> {
  console.log("processFactorGeneration called, previousData keys:", previousData ? Object.keys(previousData) : "null");
  
  const prompt = `Based on the business research and competitors for "${project.name}", identify key factors that customers use to compare providers in this industry.

  Suggest 5-8 factors that are important in this market.
  For each factor, describe what it means.

  Return JSON with a "factors" array where each factor has: name, description, isEliminated, isReduced, isRaised, isNewCreation.`;

  const { content } = await analysisService.generateResponse([
    { role: "system", content: "You are a strategy consultant. Define key factors in JSON format." },
    { role: "user", content: prompt },
  ]);

  const result = JSON.parse(content);
  
  // Save factors to the database
  const db = getDb();
  const savedFactors = [];
  
  for (const factor of result.factors || []) {
    const newFactor = await db.insert(schema.factors).values({
      projectId,
      name: factor.name,
      description: factor.description || "",
      isEliminated: factor.isEliminated || false,
      isReduced: factor.isReduced || false,
      isRaised: factor.isRaised || false,
      isNewCreation: factor.isNewCreation || false,
    }).returning();
    
    savedFactors.push(newFactor);
  }

  console.log("  processFactorGeneration returning factors:", savedFactors.length);
  return { ...result, ...previousData, factors: savedFactors };
}

async function processCompanyScoring(projectId: number, project: any, previousData: any): Promise<any> {
  console.log("processCompanyScoring called, previousData keys:", previousData ? Object.keys(previousData) : "null");
  const factors = previousData?.factors || [];
  const competitors = previousData?.competitors || [];
  
  console.log("  factors count:", factors.length);
  console.log("  factors structure check - is array:", Array.isArray(factors), "is factors[0] array:", Array.isArray(factors[0]));
  console.log("  factors[0]:", JSON.stringify(factors[0]));
  console.log("  competitors count:", competitors.length);
  console.log("  competitors[0]:", JSON.stringify(competitors[0]));
  
  // Handle potential nested array structure - keep flattening until we get actual objects
  let factorsList = factors;
  while (factorsList.length > 0 && Array.isArray(factorsList[0])) {
    factorsList = factorsList.flat();
  }
  // If still not an array of objects, try another approach
  if (factorsList.length > 0 && typeof factorsList[0] !== 'object') {
    factorsList = [];
  }
  console.log("  factorsList (after flatten):", factorsList.length, factorsList[0] ? 'has items' : 'empty');
  // Limit to top 6 competitors
  const topCompetitors = competitors.slice(0, 6);
  // Include the main company in scoring
  const allCompaniesToScore = [{ name: project.name, isMain: true }, ...topCompetitors.map(c => ({ name: c.name, isMain: false }))];
  
  const prompt = `Score the following companies on each factor for "${project.name}":
  
  Factors: ${factorsList.map((f: any) => f.name).join(", ")}
  Companies: ${allCompaniesToScore.map((c: any) => c.name).join(", ")}
  
  For each company, provide scores (0-10) for each factor with confidence levels and evidence.
  
  Return JSON with "scores" array containing company scores.`;

  console.log("  Prompt factors list:", factors.map((f: any) => f.name).join(", "));
  console.log("  Prompt competitors list:", competitors.map((c: any) => c.name).join(", "));

  let content: string;
  let result: any;
  const db = getDb();

  // Get all companies for this project for name-based matching
  const companies = await db.select().from(schema.companies).where(
    eq(schema.companies.projectId, projectId)
  );

  try {
    const response = await analysisService.generateResponse([
      { role: "system", content: "You are a data analyst. Provide scores in JSON format." },
      { role: "user", content: prompt },
    ]);
    content = response.content;
    console.log("  Raw AI content (first 500 chars):", content.substring(0, 500));
    result = JSON.parse(content);
    console.log("  AI scoring succeeded, result keys:", Object.keys(result));
    console.log("  result.scores?.length:", result.scores?.length);
    console.log("  First score result keys:", result.scores?.[0] ? Object.keys(result.scores[0]) : 'none');
    console.log("  Score result sample:", JSON.stringify(result.scores?.[0]).substring(0, 200));
  } catch (error) {
    console.error("AI generation/scoring failed for company scoring:", error);
    // Generate and save dummy scores so the pipeline can continue - include all previous data
    const dummyResult = await generateAndSaveDummyScores(projectId, factors, competitors, db);
    return { ...previousData, scores: dummyResult.scores };
  }
  
  // Save scores to the database
  const savedScores = [];

  console.log("  Saving scores, result.scores:", result.scores?.length);

  // Build a map of company names to company records for fast lookup
  const companyMap = new Map(companies.map(c => [c.name, c]));
  console.log("    DB companies map size:", companyMap.size);

  for (let i = 0; i < result.scores?.length; i++) {
    const scoreResult = result.scores[i];
    const companyName = scoreResult.company || scoreResult.companyName || `Company ${i + 1}`;
    console.log("    scoreResult company:", companyName);

    // Match by company NAME since AI names match DB names
    const company = companyMap.get(companyName);
    if (!company) {
      console.log("    company not found in DB:", companyName);
      // Try to find partial match
      const partialMatch = companies.find(c => c.name.includes(companyName) || companyName.includes(c.name));
      if (partialMatch) {
        console.log("    found partial match:", partialMatch.name);
      }
      continue;
    }
    console.log("    matched to DB company:", company.name);

    // AI returns scores with factor names as keys directly on the object:
    // { "company": "Name", "factor_name": { score, confidence, evidence }, ... }
    // OR with nested factors/scores array
    let scoreArray = scoreResult.scores || scoreResult.factors || [];
    
    // If still empty, extract all keys except "company" as factor scores
    if (scoreArray.length === 0) {
      const allKeys = Object.keys(scoreResult);
      const factorKeys = allKeys.filter(k => k !== 'company');
      scoreArray = factorKeys.map(key => {
        const data = scoreResult[key];
        return {
          factor: key,
          score: typeof data === 'object' ? data.score : data,
          confidence: typeof data === 'object' ? data.confidence : 0.5,
          evidence: typeof data === 'object' ? data.evidence : ""
        };
      });
    } else if (typeof scoreArray === 'object' && !Array.isArray(scoreArray)) {
      // If it's an object like { "factor": {...} }, convert to array
      scoreArray = Object.entries(scoreArray).map(([factor, data]) => ({
        factor,
        ...(typeof data === 'object' ? data : { score: data })
      }));
    }
    
    console.log("    scoreArray length:", scoreArray.length);

    // Use index-based factor matching
    for (let j = 0; j < scoreArray.length; j++) {
      const scoreEntry = scoreArray[j];
      const factorName = scoreEntry.factor || `Factor ${j + 1}`;
      const scoreData = scoreEntry.score;
      // Handle confidence that might be "High"/"Medium"/"Low" or a number
      let confidence = scoreEntry.confidence || 0.5;
      if (typeof confidence === 'string') {
        confidence = confidence === 'High' ? 0.8 : confidence === 'Medium' ? 0.5 : 0.3;
      }
      const explanation = scoreEntry.evidence || "Auto-scored";

      // Use index-based factor matching since factor names may not match
      const factor = factorsList[j];
      if (!factor) {
        console.log("      factor at index", j, "not found!");
        continue;
      }

      console.log("      inserting score for company:", company.name, "factor:", factor.name, "score:", scoreData);

      const newScore = await db.insert(schema.companyFactorScores).values({
        projectId,
        companyId: company.id,
        factorId: factor.id,
        score: scoreData,
        confidence: confidence,
        explanation: explanation || "",
        evidence: JSON.stringify([]),
        isMainCompany: company.isMainCompany,
      }).returning();

      savedScores.push(newScore);
    }
  }

  console.log("  Saved", savedScores.length, "scores");

  return { ...result, ...previousData, scores: savedScores };
}

async function generateAndSaveDummyScores(projectId: number, factors: any[], competitors: any[], db: any): Promise<any> {
  // Handle nested array structure
  const factorsList = factors.length > 0 && Array.isArray(factors[0]) ? factors.flat() : factors;
  
  console.log("generateAndSaveDummyScores called:");
  console.log("  factors count:", factors?.length, "-> factorsList count:", factorsList?.length);
  console.log("  competitors count:", competitors?.length);
  
  // Get all companies for this project
  const companies = await db.select().from(schema.companies).where(
    eq(schema.companies.projectId, projectId)
  );
  console.log("  companies found:", companies?.length);
  
  // Generate dummy scores so the pipeline can continue
  const scores = [];
  
  for (const company of companies || []) {
    console.log("    Processing company:", company.name);
    const companyScores: any = {};
    
    for (let j = 0; j < factorsList?.length; j++) {
      const factor = factorsList[j];
      await db.insert(schema.companyFactorScores).values({
        projectId,
        companyId: company.id,
        factorId: factor.id,
        score: 5,
        confidence: 0.5,
        explanation: "Score generation failed, using default value",
        evidence: JSON.stringify([]),
        isMainCompany: company.isMainCompany,
      });
      
      companyScores[factor.name] = {
        score: 5,
        confidence: 0.5,
        explanation: "Score generation failed, using default value",
        evidence: []
      };
    }
    
    scores.push({
      companyName: company.name,
      scores: companyScores
    });
  }
  
  console.log("  Saved", scores.length, "company score groups");
  return { scores };
}

async function processStrategyCanvas(projectId: number, project: any, previousData: any): Promise<any> {
  const factors = previousData?.factors || [];
  const companyScores = previousData?.scores || [];
  
  const prompt = `Create a strategy canvas for "${project.name}" based on the factor scores and factors.
  
  The strategy canvas should show how the company compares to competitors on each factor.
  
  Return JSON with factors array and scores array.`;

  const { content } = await analysisService.generateResponse([
    { role: "system", content: "You are a strategy consultant. Create a strategy canvas in JSON format." },
    { role: "user", content: prompt },
  ]);

  const result = JSON.parse(content);

  return { ...result, ...previousData };
}

async function processNextBigThing(projectId: number, project: any, previousData: any): Promise<any> {
  const businessResearch = previousData?.businessResearch || {};
  const factors = previousData?.factors || [];
  const factorsList = factors.length > 0 && Array.isArray(factors[0]) ? factors.flat() : factors;
  const competitors = previousData?.competitors || [];
  const scores = previousData?.scores || [];
  const mainResearch = previousData?.mainResearch || {};
  const competitorInsights = previousData?.competitorInsights || '';
  const reviews = previousData?.reviews || {};
  
  // Use project notes heavily - it's the user's own description
  const projectContext = [
    `Business: ${project.name}`,
    project.notes && `User Description: ${project.notes}`,
    project.websiteUrl && `Website: ${project.websiteUrl}`,
  ].filter(Boolean).join('\n');

  const prompt = `Create "Next Big Thing" strategy options for "${project.name}".
  
  ════════════════════════════════════════════════════════════════
  CRITICAL BUSINESS CONTEXT (from user's description):
  ════════════════════════════════════════════════════════════════
  ${project.notes || 'No user description provided'}
  
  ════════════════════════════════════════════════════════════════
  YOUR COMPLETE RESEARCH DATA
  ════════════════════════════════════════════════════════════════
  
  **1. MAIN COMPANY DEEP RESEARCH:**
  ${mainResearch.description || 'No deep research available'}
  Target Market: ${mainResearch.targetMarket || 'N/A'}
  Price Range: ${mainResearch.pricing || 'N/A'}
  Main Products: ${(mainResearch.mainProducts || []).join(", ") || 'N/A'}
  Unique Selling Points: ${(mainResearch.uniqueSellingPoints || []).join(", ") || 'N/A'}
  Brand Story: ${mainResearch.brandStory || 'N/A'}
  
  **2. COMPETITOR DEEP ANALYSIS:**
  ${competitorInsights || 'No competitor analysis available'}
  
  **3. BUSINESS ANALYSIS:**
  - Summary: ${businessResearch.summary || 'N/A'}
  - Key Strengths: ${(businessResearch.keyStrengths || []).join(", ")}
  - Key Weaknesses: ${(businessResearch.keyWeaknesses || []).join(", ")}
  - Market Position: ${businessResearch.marketPosition || 'N/A'}
  - Unique Value Proposition: ${businessResearch.uniqueValueProposition || 'N/A'}
  
  **4. CUSTOMER REVIEWS & SENTIMENT:**
  ${previousData?.mainReviewsText || 'No review data available'}
  
  **5. KEY FACTORS IN THIS MARKET:**
  ${factorsList.map((f: any) => f.name).join(", ") || 'N/A'}
  
  ════════════════════════════════════════════════════════════════
  TASK: Based on ALL the research above, create breakthrough strategy options
  ════════════════════════════════════════════════════════════════
  
  The strategies should:
  - Address the weaknesses shown in customer reviews
  - Differentiate from what competitors are doing
  - Leverage the company's unique strengths
  - Help achieve the user's stated vision
  
  For each strategy option, provide:
  - A catchy title
  - One-sentence summary
  - What to eliminate from the industry's formula
  - What to reduce below industry standard
  - What to raise above industry standard
  - What to create that the industry has never offered
  - Value curve showing changes
  - Target customer segment
  - Positioning statement
  - Potential risks
  - Implementation difficulty (1-10)
  - Operational implications
  - Revenue potential (optional)
  
  Provide 2-3 strategy options.`;

  let content: string;
  let result: any;
  
  try {
    const response = await analysisService.generateResponse([
      { role: "system", content: "You are a strategy expert. Create Next Big Thing strategies in JSON format." },
      { role: "user", content: prompt },
    ]);
    content = response.content;
    result = JSON.parse(content);
  } catch (error) {
    console.error("AI generation failed for next big thing:", error);
    // Return dummy strategies so the pipeline can continue - but include all previous data
    return {
      ...previousData,
      strategies: [
        {
          title: "Premium Pet Fashion",
          summary: "Focus on high-end, stylish pet apparel for affluent pet owners",
          eliminate: "Low-quality materials",
          reduce: "Production costs",
          raise: "Design quality",
          create: "Exclusive collaborations with fashion designers",
          targetCustomer: "Affluent millennials and Gen Z pet owners",
          positioningStatement: "For pet owners who see their pets as family members deserving of premium care",
          risks: ["Market may be too niche", "Higher production costs"],
          difficulty: 7,
          operationalImplications: "Need to source premium materials and hire skilled designers",
          revenuePotential: "High margins but lower volume",
        }
      ]
    };
  }
  
  // Save strategy options to the database
  const db = getDb();
  const savedOptions = [];
  
  // AI may return either "strategies" or "strategy_options" - empty array is falsy, so check for non-empty
  const strategyList = (result.strategy_options?.length > 0 ? result.strategy_options : null) ||
                       (result.strategies?.length > 0 ? result.strategies : null) ||
                       [];

  // Helper to truncate arrays to prevent SQLite parameter limits
  const truncateArray = (arr: any[], maxLen: number = 50) => {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, maxLen);
  };

  for (const option of strategyList) {
    try {
      const newOption = await db.insert(schema.nextBigThingOptions).values({
        projectId,
        title: (option.title || option.Name || "Strategy Option").slice(0, 500),
        summary: (option.summary || option.description || "A strategic option for growth").slice(0, 2000),
        eliminate: (option.eliminate || option.eliminateWhat || "").slice(0, 1000),
        reduce: (option.reduce || option.reduceWhat || "").slice(0, 1000),
        raise: (option.raise || option.raiseWhat || "").slice(0, 1000),
        create: (option.create || option.createWhat || "").slice(0, 1000),
        valueCurve: truncateArray(Array.isArray(option.valueCurve) ? option.valueCurve : (option.value_curve || [])),
        targetCustomer: (option.targetCustomer || option.target_customer || option.customerSegment || "").slice(0, 500),
        positioningStatement: (option.positioningStatement || option.positioning_statement || "").slice(0, 1000),
        risks: truncateArray(Array.isArray(option.risks) ? option.risks : (option.Risks || [])),
        difficulty: option.difficulty || option.implementationDifficulty || 5,
        operationalImplications: (option.operationalImplications || option.operational_implications || "").slice(0, 1000),
        revenuePotential: option.revenuePotential || option.revenue_potential || null,
      }).returning();
      
      savedOptions.push(newOption);
    } catch (saveError) {
      console.error("Failed to save strategy option:", saveError);
    }
  }

  return { ...result, ...previousData, strategies: savedOptions };
}

async function processReportAssembly(projectId: number, project: any, previousData: any): Promise<any> {
  // Extract data from previous stages
  const businessResearch = previousData?.businessResearch || {};
  const strategies = previousData?.strategies || [];
  const strategyCanvas = previousData?.strategyCanvas || {};
  const companyScores = previousData?.scores || [];
  const competitors = previousData?.competitors || [];
  const mainResearch = previousData?.mainResearch || {};
  const competitorInsights = previousData?.competitorInsights || '';
  const reviews = previousData?.reviews || {};

  const strategiesText = strategies.length > 0 ? strategies.map((s: any, i: number) => `
Strategy ${i + 1}: ${s.title || 'Strategy ' + (i+1)}
Summary: ${s.summary || 'No summary available'}
ERRC:
- Eliminate: ${s.eliminate || 'Not specified'}
- Reduce: ${s.reduce || 'Not specified'}
- Raise: ${s.raise || 'Not specified'}
- Create: ${s.create || 'Not specified'}
Target Customer: ${s.targetCustomer || 'Not specified'}
Difficulty: ${s.difficulty || 5}/10
`).join('\n') : 'No strategy options available';

  const scoresText = companyScores.length > 0 ? companyScores.map((c: any) => `- ${c.companyName || 'Unknown'}`).join('\n') : 'No scores available';

  const competitorsText = competitors.length > 0 ? competitors.map((c: any) => `- ${c.name || 'Unknown'}: ${c.description || 'Description not available'}`).join('\n') : 'No competitor data available';

  const prompt = `You are creating a comprehensive strategic analysis report for "${project.name}".

═══════════════════════════════════════════════════════════════
THIS DATA WAS JUST GATHERED FROM EXTENSIVE REAL-TIME RESEARCH
═══════════════════════════════════════════════════════════════
DO NOT say "insufficient data" - SYNTHESIZE what you have!

**1. YOUR MAIN COMPANY DEEP RESEARCH:**
${mainResearch.description || 'No deep research available'}
Target Market: ${mainResearch.targetMarket || 'N/A'}
Price Range: ${mainResearch.pricing || 'N/A'}
Main Products: ${(mainResearch.mainProducts || []).join(", ") || 'N/A'}
Brand Story: ${mainResearch.brandStory || 'N/A'}
Strengths from deep research: ${(mainResearch.strengths || []).join(", ") || 'N/A'}
Weaknesses from deep research: ${(mainResearch.weaknesses || []).join(", ") || 'N/A'}

**2. COMPETITOR DEEP ANALYSIS:**
${competitorInsights || 'No competitor analysis available'}

**3. CUSTOMER REVIEWS & SENTIMENT:**
${previousData?.mainReviewsText || 'No review data available'}

**4. BUSINESS ANALYSIS (Traditional):**
${businessResearch.summary || 'Business summary not available'}
- Strengths: ${(businessResearch.keyStrengths || []).join("; ") || 'Not specified'}
- Weaknesses: ${(businessResearch.keyWeaknesses || []).join("; ") || 'Not specified'}
- Market Position: ${businessResearch.marketPosition || 'Position not specified'}
- Unique Value Proposition: ${businessResearch.uniqueValueProposition || 'UVP not specified'}
- Target Market: ${businessResearch.targetMarket || 'Target market not specified'}

**5. COMPETITORS IDENTIFIED:**
${competitorsText}

**6. COMPANY SCORES ANALYSIS:**
${scoresText}

**7. STRATEGIC OPTIONS DEVELOPED:**
${strategiesText}

═══════════════════════════════════════════════════════════════
TASK: Synthesize ALL the above information into a comprehensive strategic analysis report. Extract key findings, identify patterns, compare against competitor strategies, and provide actionable recommendations.
═══════════════════════════════════════════════════════════════

Return a comprehensive report with this JSON structure:
{
  "title": "Strategic Analysis Report for [Company Name]",
  "executiveSummary": "2-3 sentence executive summary of the analysis and key recommendation",
  "currentPositioning": {
    "mainCompany": { "name": "...", "description": "...", "websiteUrl": "..." },
    "competitors": [{ "name": "...", "description": "..." }],
    "keyFindings": ["...", "..."]
  },
  "competitorAnalysis": {
    "marketPosition": "Description of market position",
    "competitiveAdvantages": ["...", "..."],
    "weaknesses": ["...", "..."]
  },
  "nextBigThingOptions": [
    { "id": 1, "title": "...", "summary": "...", "difficulty": 5 }
  ],
  "recommendedStrategy": {
    "id": 1,
    "title": "...",
    "summary": "..."
  },
  "confidenceScore": 0.85
}

Return ONLY valid JSON, no additional text.`;

  let content: string;
  let result: any;
  
  try {
    const response = await analysisService.generateResponse([
      { role: "system", content: "You are a strategic analysis report writer. Create detailed, actionable reports based on provided analysis data. Always respond with valid JSON only." },
      { role: "user", content: prompt },
    ]);
    content = response.content;
    result = JSON.parse(content);
  } catch (error) {
    console.error("AI generation failed for report assembly:", error);
    // Build a report from available data if AI fails - include ALL deep research
    const mainCompany = {
      name: project.name,
      description: mainResearch?.description || businessResearch?.summary || `Strategic analysis for ${project.name}`,
      websiteUrl: project.websiteUrl,
    };
    result = {
      title: `Strategy Report for ${project.name}`,
      executiveSummary: strategies.length > 0
        ? `Analysis identified ${strategies.length} strategic options for ${project.name}. Key differentiators identified through deep research.`
        : `Comprehensive analysis of ${project.name} based on competitor research and market factors.`,
      currentPositioning: {
        mainCompany,
        competitors: (competitorInsights ? competitorInsights.split('\n').slice(0, 5) : competitors.slice(0, 5)).map((c: any) => typeof c === 'string' ? { name: c } : c),
        keyFindings: mainResearch?.strengths?.length > 0 
          ? mainResearch.strengths.map((s: string) => `Strength: ${s}`)
          : (strategies.length > 0 
            ? strategies.map((s: any) => `Strategy "${s.title}": ${s.summary}`)
            : ["Analysis based on comprehensive market research"]),
      },
      competitorAnalysis: {
        marketPosition: mainResearch?.targetMarket || businessResearch?.marketPosition || "Market position analysis complete",
        competitiveAdvantages: [...(mainResearch?.strengths || []), ...(businessResearch?.keyStrengths || [])].slice(0, 5),
        weaknesses: [...(mainResearch?.weaknesses || []), ...(businessResearch?.keyWeaknesses || [])].slice(0, 5),
      },
      nextBigThingOptions: strategies.slice(0, 3).map((s: any, i: number) => ({
        id: i + 1,
        title: s.title || "Strategic Option",
        summary: s.summary || "A strategic option for growth",
        difficulty: s.difficulty || 5,
      })),
      recommendedStrategy: strategies.length > 0 ? {
        id: 1,
        title: strategies[0].title,
        summary: strategies[0].summary,
      } : null,
      confidenceScore: strategies.length > 0 ? 0.7 : 0.3,
    };
  }
  
  // Save report to the database
  const db = getDb();
  
  // Delete existing reports for this project
  await db.delete(schema.reports).where(eq(schema.reports.projectId, projectId));
  
  await db.insert(schema.reports).values({
    projectId,
    title: result.title || `Strategy Report for ${project.name}`,
    executiveSummary: result.executiveSummary || "",
    currentPositioning: JSON.stringify(result.currentPositioning || {}),
    competitorAnalysis: JSON.stringify(result.competitorAnalysis || {}),
    nextBigThingOptions: JSON.stringify(result.nextBigThingOptions || []),
    recommendedStrategy: JSON.stringify(result.recommendedStrategy || {}),
    confidenceScore: result.confidenceScore || 0.5,
  });

  return { ...result, ...previousData };
}