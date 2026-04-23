import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getProject, createAnalysisRun, updateAnalysisRun, getCompaniesByProject, getCompetitorsByProject, createFactor, createCompany, createCompetitor, createCompanyFactorScore, createNextBigThingOption, createReport } from "@/lib/services/db-service";
import { formatDate } from "@/lib/utils/date";
import { summaryService, analysisService, strategyService, AIService, AI_COSTS, type ModelType } from "@/lib/services/ai-service";
import { BusinessResearchSchema, CompetitorDiscoverySchema, NormalizedCompetitorSchema, AnalysisFactorSchema, CompanyScoreResultSchema, StrategyCanvasSchema, NextBigThingStrategySchema, NextBigThingResultSchema, StrategyReport, ReportSchema } from "@/lib/services/ai-service";
import { scrapeWebsite, scrapeCompetitors, formatCompetitorInsights, validateCompetitorRelevance, checkUrlLive } from "@/lib/services/scraper-service";
import { aggregateReviews, getCompetitorReviewInsights, formatReviewsForPrompt } from "@/lib/services/review-aggregation-service";

// Analysis stages - extended with deep research
type AnalysisStage = 
  | "business_research"
  | "competitor_discovery"
  | "competitor_normalization"
  | "deep_main_research"        // Deep dive on main company
  | "deep_competitor_research"  // Initial deep dive on competitors
  | "competitor_selection"      // NEW: Deep website reading & selection of top 6
  | "review_aggregation"        // Aggregate reviews from multiple sources
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

interface AIUsageRecord {
  model: string;
  modelType: ModelType;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

function calculateCallCost(modelType: ModelType, inputTokens: number, outputTokens: number): number {
  const costs = AI_COSTS[modelType];
  return ((inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output) * 100;
}

function sumAIUsage(usageList: AIUsageRecord[]): AIUsageRecord[] {
  return usageList;
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

    // Track elapsed time - exit early if running low on time
    const startTime = Date.now();
    const MAX_STAGE_TIME_MS = 24000; // 24 seconds - leave 2s buffer for Netlify limit

    const checkTimeout = (stage: AnalysisStage, currentProgress: any): { timedOut: boolean; progress: any } => {
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_STAGE_TIME_MS) {
        console.log(`[TIMEOUT] Stage ${stage} ran for ${elapsed}ms, saving progress and exiting early`);
        return { timedOut: true, progress: currentProgress };
      }
      return { timedOut: false, progress: null };
    };

    // If we've been running too long, exit immediately
    if (Date.now() - startTime > MAX_STAGE_TIME_MS) {
      return NextResponse.json({
        message: "Stage timeout - will resume on next call",
        stage: analysisRun.stage,
        status: "pending",
        timedOut: true,
      });
    }

    // Process the stage based on the analysis stage
    let resultData: any = null;
    let nextStage: AnalysisStage | null = null;
    let completed = false;
    const stageAIUsage: AIUsageRecord[] = [];

    try {
      switch (analysisRun.stage) {
        case "business_research":
          resultData = await processBusinessResearch(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "competitor_discovery";
          break;

        case "competitor_discovery":
          resultData = await processCompetitorDiscovery(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "competitor_normalization";
          break;

        case "competitor_normalization":
          resultData = await processCompetitorNormalization(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "deep_main_research";
          break;

        case "deep_main_research":
          console.log("=== STAGE: Deep Main Website Research ===");
          resultData = await processDeepMainResearch(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "deep_competitor_research";
          break;

        case "deep_competitor_research":
          console.log("=== STAGE: Deep Competitor Website Research ===");
          resultData = await processDeepCompetitorResearch(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "competitor_selection";
          break;

        case "competitor_selection":
          console.log("=== STAGE: Competitor Selection & Deep Website Reading ===");
          resultData = await processCompetitorSelection(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "review_aggregation";
          break;

        case "review_aggregation":
          console.log("=== STAGE: Review Aggregation ===");
          resultData = await processReviewAggregation(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "factor_generation";
          break;

        case "factor_generation":
          resultData = await processFactorGeneration(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "company_scoring";
          break;

        case "company_scoring":
          resultData = await processCompanyScoring(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "strategy_canvas";
          break;

        case "strategy_canvas":
          resultData = await processStrategyCanvas(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "next_big_thing";
          break;

        case "next_big_thing":
          resultData = await processNextBigThing(id, project, analysisRun.inputData, stageAIUsage);
          nextStage = "report_assembly";
          break;

        case "report_assembly":
          resultData = await processReportAssembly(id, project, analysisRun.inputData, stageAIUsage);
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
    const stageCostCents = stageAIUsage.reduce((sum, u) => sum + u.costCents, 0);
    const updatedRun = await updateAnalysisRun(analysisRun.id, {
      status: "completed",
      outputData: resultData,
      elapsedSeconds,
      completedAt: new Date(),
      costCents: stageCostCents,
      aiUsage: stageAIUsage,
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

async function processBusinessResearch(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
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

  const response = await summaryService.generateResponse([
    { role: "system", content: "You are a business analyst. Provide detailed business research in JSON format. Always respond with valid JSON only." },
    { role: "user", content: prompt },
  ], 0.3, 4000, "summary");

  aiUsage.push({
    model: response.modelUsed,
    modelType: "summary",
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costCents: calculateCallCost("summary", response.inputTokens, response.outputTokens),
  });

  const result = JSON.parse(response.content);

  // Update the project with this research data
  const db = getDb();
  await db.update(schema.projects).set({
    updatedAt: new Date(),
  }).where(eq(schema.projects.id, projectId));

  return { ...result, ...previousData };
}

async function processCompetitorDiscovery(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
  // Include project details - especially notes/description which contains user's context
  const projectDetails = [
    project.name,
    project.category && `Category: ${project.category}`,
    project.notes && `Description/Notes: ${project.notes}`,
    project.region && `Region: ${project.region}`,
  ].filter(Boolean).join(' - ');

  const prompt = `For the business: ${projectDetails}

  **CRITICAL: This business is located in ${project.region || 'an unspecified location'}. You MUST find competitors that are located in the SAME REGION/area.**

  **DO NOT find competitors that are in a different state, city, or region unless explicitly stated.**

  **CRITICAL: The description/notes above define exactly what this business is. Find competitors that compete with THIS SPECIFIC BUSINESS, not generic industry players.**

  **IMPORTANT: If the description says "mens clothing store", look for other MENS CLOTHING stores. NOT pet stores, not women's clothing, not general fashion.**

  **CRITICAL: The businesses must be in the SAME region and directly compete with this business. Do NOT include businesses from other regions.**

  **EVEN MORE IMPORTANT: You MUST find and return the actual website URL for each competitor. Do NOT leave websiteUrl blank. If you cannot find a competitor's website, search for it by name. Every competitor MUST have a valid website URL starting with http:// or https://.**

  Identify key competitors that DIRECTLY compete with this specific business model, product offering, and target market.
  Find competitors that are similar in:
  - Product type and style
  - Price point and positioning
  - Target customer demographic
  - Business model (D2C, subscription, etc.)
  - **LOCATION: Must be in the same region as the target business**

  For each competitor, research and return:
  - Name
  - Description (2-3 sentences)
  - **Website URL** (required - this is critical)
  - Revenue estimate if available
  - Market share if available

  Return JSON with a "competitors" array. Every competitor object MUST have a "websiteUrl" field with a valid URL. If you cannot find a website, use your knowledge to construct the most likely domain (e.g., for "Brand Name" try "brandname.com").`;

  const initResponse = await summaryService.generateResponse([
    { role: "system", content: "You are a market research analyst. Identify competitors in JSON format. Always respond with valid JSON only." },
    { role: "user", content: prompt },
  ], 0.3, 4000, "summary");

  aiUsage.push({
    model: initResponse.modelUsed,
    modelType: "summary",
    inputTokens: initResponse.inputTokens,
    outputTokens: initResponse.outputTokens,
    costCents: calculateCallCost("summary", initResponse.inputTokens, initResponse.outputTokens),
  });

  const result = JSON.parse(initResponse.content);

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
  
  // First, verify each competitor URL is actually live before saving
  const liveCompetitors: Array<any> = [];
  
  for (const competitor of result.competitors || []) {
    if (competitor.websiteUrl && competitor.websiteUrl.startsWith("http")) {
      console.log(`=== COMPETITOR DISCOVERY: Checking URL liveness for ${competitor.name}: ${competitor.websiteUrl} ===`);
      const urlCheck = await checkUrlLive(competitor.websiteUrl);
      
      if (urlCheck.isLive) {
        console.log(`=== COMPETITOR DISCOVERY: URL is LIVE (${urlCheck.statusCode}) - adding ${competitor.name} ===`);
        liveCompetitors.push(competitor);
      } else {
        console.log(`=== COMPETITOR DISCOVERY: URL is DEAD (${urlCheck.statusCode}) - "${competitor.name}" rejected ===`);
      }
    } else {
      console.log(`=== COMPETITOR DISCOVERY: No URL provided - "${competitor.name}" rejected ===`);
    }
    
    // Rate limiting between URL checks
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // If we have fewer than 6 live competitors, ask AI to find replacements
  if (liveCompetitors.length < 6) {
    console.log(`=== COMPETITOR DISCOVERY: Only ${liveCompetitors.length} live competitors, finding ${6 - liveCompetitors.length} more ===`);
    
    const liveNames = liveCompetitors.map(c => c.name).join(", ");
    const replacementPrompt = `For the business: ${projectDetails}
    
You already found these competitors with LIVE websites: ${liveNames}
But we need ${6 - liveCompetitors.length} MORE competitors that:
1. Have ACTIVE, LIVE websites (we verified they work)
2. DIRECTLY compete with the business above
3. Are in the SAME industry/business type

Find ${6 - liveCompetitors.length} more competitors with real, working websites.
Each MUST have a websiteUrl that you KNOW FOR CERTAIN is live and active.

Return JSON with "competitors" array: name, description, websiteUrl`;

    try {
      const replacementResponse = await summaryService.generateResponse([
        { role: "system", content: "You are a market research analyst. Find competitors in JSON format. Only include competitors you know have active websites. Always respond with valid JSON only." },
        { role: "user", content: replacementPrompt }
      ], 0.3, 3000, "summary");

      aiUsage.push({
        model: replacementResponse.modelUsed,
        modelType: "summary",
        inputTokens: replacementResponse.inputTokens,
        outputTokens: replacementResponse.outputTokens,
        costCents: calculateCallCost("summary", replacementResponse.inputTokens, replacementResponse.outputTokens),
      });

      const replacementResult = JSON.parse(replacementResponse.content);
      
      for (const replacement of replacementResult.competitors || []) {
        if (replacement.websiteUrl) {
          const urlCheck = await checkUrlLive(replacement.websiteUrl);
          if (urlCheck.isLive) {
            console.log(`=== COMPETITOR DISCOVERY: Found replacement "${replacement.name}" with live URL ===`);
            liveCompetitors.push(replacement);
          } else {
            console.log(`=== COMPETITOR DISCOVERY: Replacement "${replacement.name}" URL is dead, skipping ===`);
          }
        }
        
        if (liveCompetitors.length >= 6) break;
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error("=== COMPETITOR DISCOVERY: Failed to find replacement competitors ===", e);
    }
  }
  
  // Now save only the live competitors
  for (const competitor of liveCompetitors) {
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
  
  console.log(`=== COMPETITOR DISCOVERY: Saved ${liveCompetitors.length} competitors with verified live URLs ===`);

  return { ...result, ...previousData };
}

async function processCompetitorNormalization(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
  // Normalize competitors to a standard format
  // ONLY include competitors that have a valid websiteUrl — no URL means not a valid competitor
  let competitors = (previousData?.competitors || []).filter(
    (c: any) => c.websiteUrl && c.websiteUrl.startsWith("http")
  );

  // If we don't have 6 competitors with URLs, fetch more
  const allCompetitorNames = new Set<string>();
  for (const c of competitors) {
    allCompetitorNames.add(c.name);
  }

  let maxAttempts = 5;
  while (competitors.length < 6 && maxAttempts > 0) {
    maxAttempts--;
    console.log(`=== COMPETITOR NORMALIZATION: Have ${competitors.length} with URLs, need ${6 - competitors.length} more — fetching more ===`);

    const prompt = `For the business: ${project.name} (${project.notes || project.category || "no description"})
Region: ${project.region || 'Not specified'}

You already know about: ${Array.from(allCompetitorNames).join(", ")}

Find ${6 - competitors.length} MORE direct competitors that have ACTIVE, LIVE websites.
Each competitor MUST have:
- A real, working website URL that you KNOW IS ACTIVE (we will verify with a live check)
- A description of what they sell
- Direct competition with the business above
- **Same region/area as the target business**

CRITICAL: Do NOT include competitors from different regions unless they explicitly serve this region.

IMPORTANT: Only include competitors with websites that are currently live and accessible. We will verify each URL.

Return a JSON "competitors" array with: name, description, websiteUrl
Do NOT repeat any competitor already listed above.`;

    const normResponse = await summaryService.generateResponse([
      { role: "system", content: "You are a market research analyst. Find competitors in JSON format. Only include competitors with verified active websites. Always respond with valid JSON only." },
      { role: "user", content: prompt },
    ], 0.3, 3000, "summary");

    aiUsage.push({
      model: normResponse.modelUsed,
      modelType: "summary",
      inputTokens: normResponse.inputTokens,
      outputTokens: normResponse.outputTokens,
      costCents: calculateCallCost("summary", normResponse.inputTokens, normResponse.outputTokens),
    });

    try {
      const result = JSON.parse(normResponse.content);
      for (const c of result.competitors || []) {
        if (
          c.websiteUrl && c.websiteUrl.startsWith("http") &&
          !allCompetitorNames.has(c.name)
        ) {
          // Verify URL is actually live before adding
          const urlCheck = await checkUrlLive(c.websiteUrl);
          if (urlCheck.isLive) {
            console.log(`=== COMPETITOR NORMALIZATION: Verified live URL for "${c.name}" ===`);
            allCompetitorNames.add(c.name);
            competitors.push(c);
          } else {
            console.log(`=== COMPETITOR NORMALIZATION: URL dead for "${c.name}" (${urlCheck.statusCode}), skipping ===`);
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error("=== COMPETITOR NORMALIZATION: Failed to parse extra competitors ===", e);
    }
  }

  if (competitors.length < 6) {
    console.warn(`=== COMPETITOR NORMALIZATION: Only found ${competitors.length} competitors with valid URLs — proceeding anyway ===`);
  }

  const normalized = [];
  const db = getDb();

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
      const [newCompetitor] = await db.insert(schema.competitors).values({
        projectId,
        name: competitor.name || "Unknown",
        description: competitor.description || "",
        websiteUrl: competitor.websiteUrl || "",
        revenueEstimate: competitor.revenueEstimate || null,
        marketShare: competitor.marketShare || null,
      }).returning();

      if (!newCompetitor) {
        throw new Error(`Failed to insert competitor: ${competitor.name || "Unknown"}`);
      }

      companyId = newCompetitor.id;
      normalized.push({
        id: newCompetitor.id,
        ...competitor,
      });
    }

    // Also create or update company record for the canvas
    // Always ensure competitor has a company record (even if competitor already existed)
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
    } else {
      // Update company record if competitor data changed
      await db.update(schema.companies).set({
        websiteUrl: competitor.websiteUrl || existingCompany.websiteUrl,
        description: competitor.description || existingCompany.description,
      }).where(eq(schema.companies.id, existingCompany.id));
    }
  }

  return { ...previousData, competitors: normalized };
}

// ========== NEW DEEP RESEARCH STAGES ==========

async function processDeepMainResearch(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
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

async function processDeepCompetitorResearch(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
  console.log("=== DEEP COMPETITOR RESEARCH: Starting deep dive into competitor websites ===");

  // Get ALL competitors for initial deep dive (this is before selection)
  const competitors = previousData?.competitors || [];
  const topCompetitors = competitors.slice(0, 6); // Use top 6 from normalization for initial deep dive

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

  // For competitors missing URLs, try to construct a likely domain and scrape
  for (const competitor of topCompetitors) {
    if (!competitor.websiteUrl) {
      const name = competitor.name || "";
      // Try common domain patterns
      const variations = [
        name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) + ".com",
        name.toLowerCase().replace(/\s+/g, "") + ".com",
        name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") + ".com",
      ];
      for (const url of variations) {
        try {
          const result = await scrapeWebsite(`https://${url}`, competitor.name, businessContext);
          if (result.success) {
            competitor.websiteUrl = `https://${url}`;
            console.log(`=== DEEP COMPETITOR RESEARCH: Found URL for ${competitor.name}: ${competitor.websiteUrl} ===`);
            break;
          }
        } catch {
          // Try next variation
        }
      }
      // If still no URL, use the name to try one more scrape with just the domain
      if (!competitor.websiteUrl) {
        try {
          const guessedUrl = `https://${name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)}.com`;
          const result = await scrapeWebsite(guessedUrl, competitor.name, businessContext);
          if (result.success) {
            competitor.websiteUrl = guessedUrl;
          }
        } catch {
          // Could not find URL
        }
      }
    }
  }

  try {
    const results = await scrapeCompetitors(topCompetitors, businessContext);
    
    // Validate each competitor - ensure they actually match the business type
    const validatedCompetitors: Array<{name: string, websiteUrl: string, description?: string, isValid: boolean, reason?: string}> = [];
    const invalidCompetitorNames: string[] = [];
    
    for (const competitor of topCompetitors) {
      if (competitor.websiteUrl) {
        const result = results.get(competitor.name);
        if (result?.success) {
          const validation = await validateCompetitorRelevance(competitor.name, result, businessContext);
          if (validation.isRelevant) {
            validatedCompetitors.push({ ...competitor, isValid: true });
          } else {
            console.log(`=== DEEP COMPETITOR RESEARCH: REJECTED "${competitor.name}" - ${validation.reason} ===`);
            invalidCompetitorNames.push(competitor.name);
          }
        } else {
          // Scrape failed - reject it
          invalidCompetitorNames.push(competitor.name);
        }
      } else {
        // No URL - reject it
        invalidCompetitorNames.push(competitor.name);
      }
    }
    
    // If we rejected any competitors, find replacements
    if (invalidCompetitorNames.length > 0) {
      console.log(`=== DEEP COMPETITOR RESEARCH: Found ${invalidCompetitorNames.length} invalid competitors, finding replacements ===`);
      
      const replacementPrompt = `For the business: ${project.name} (${project.notes || project.category || "no description"})
        
You previously identified these competitors but they were REJECTED because they don't actually compete with this business:
${invalidCompetitorNames.join(", ")}

We need ${invalidCompetitorNames.length} REPLACEMENT competitors that:
1. DIRECTLY compete with this specific business (same products/services, same target market)
2. Have real, working website URLs (we will scrape them)
3. Are actual competitors - NOT keyword matches or unrelated businesses

Return a JSON "competitors" array with: name, description, websiteUrl
Each competitor MUST have a valid URL starting with http:// or https://`;

      try {
        const replacementResponse = await summaryService.generateResponse([
          { role: "system", content: "You are a market research analyst. Find replacement competitors in JSON format. Always respond with valid JSON only." },
          { role: "user", content: replacementPrompt }
        ], 0.3, 3000, "summary");

        aiUsage.push({
          model: replacementResponse.modelUsed,
          modelType: "summary",
          inputTokens: replacementResponse.inputTokens,
          outputTokens: replacementResponse.outputTokens,
          costCents: calculateCallCost("summary", replacementResponse.inputTokens, replacementResponse.outputTokens),
        });

        const replacementResult = JSON.parse(replacementResponse.content);
        
        // Scrape the replacement competitors
        for (const replacement of replacementResult.competitors || []) {
          if (replacement.websiteUrl && replacement.websiteUrl.startsWith("http")) {
            try {
              const scrapeResult = await scrapeWebsite(replacement.websiteUrl, replacement.name, businessContext);
              if (scrapeResult.success) {
                const validation = await validateCompetitorRelevance(replacement.name, scrapeResult, businessContext);
                if (validation.isRelevant) {
                  console.log(`=== DEEP COMPETITOR RESEARCH: Adding replacement "${replacement.name}" ===`);
                  validatedCompetitors.push({
                    name: replacement.name,
                    websiteUrl: replacement.websiteUrl,
                    description: replacement.description,
                    isValid: true
                  });
                } else {
                  console.log(`=== DEEP COMPETITOR RESEARCH: Replacement "${replacement.name}" also rejected: ${validation.reason} ===`);
                }
              }
            } catch (e) {
              console.log(`=== DEEP COMPETITOR RESEARCH: Failed to scrape replacement "${replacement.name}" ===`);
            }
          }
        }
      } catch (e) {
        console.error("=== DEEP COMPETITOR RESEARCH: Failed to find replacement competitors ===", e);
      }
    }
    
    const competitorInsights = formatCompetitorInsights(results);
    const db = getDb();

    // Update competitors in DB with validated results
    for (const competitor of validatedCompetitors) {
      if (competitor.websiteUrl) {
        const result = results.get(competitor.name);
        if (result?.success) {
          const aiTitle = result.content.title;
          // Try to extract or construct URL from the scrape result
          // The scrape always uses the competitor.websiteUrl we passed, but the AI title might give us the real domain
          await db.update(schema.competitors).set({
            websiteUrl: competitor.websiteUrl,
            description: result.content.description || competitor.description || "",
          }).where(
            and(
              eq(schema.competitors.projectId, projectId),
              eq(schema.competitors.name, competitor.name)
            )
          );
          // Also update the company record for canvas
          await db.update(schema.companies).set({
            websiteUrl: competitor.websiteUrl,
            description: result.content.description || competitor.description || "",
          }).where(
            and(
              eq(schema.companies.projectId, projectId),
              eq(schema.companies.name, competitor.name)
            )
          );
        }
      }
    }

    // Delete invalid competitors from database
    if (invalidCompetitorNames.length > 0) {
      for (const invalidName of invalidCompetitorNames) {
        await db.delete(schema.competitors).where(
          and(
            eq(schema.competitors.projectId, projectId),
            eq(schema.competitors.name, invalidName)
          )
        );
        await db.delete(schema.companies).where(
          and(
            eq(schema.companies.projectId, projectId),
            eq(schema.companies.name, invalidName)
          )
        );
        console.log(`=== DEEP COMPETITOR RESEARCH: Deleted invalid competitor "${invalidName}" from DB ===`);
      }
    }

    // Store detailed results
    const competitorResearch: Record<string, any> = {};
    for (const [name, result] of Array.from(results)) {
      competitorResearch[name] = result.content;
    }

    console.log(`=== DEEP COMPETITOR RESEARCH: Completed - ${validatedCompetitors.length} valid competitors (rejected ${invalidCompetitorNames.length}) ===`);

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

async function processCompetitorSelection(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
  console.log("=== COMPETITOR SELECTION: Starting deep website reading for competitor selection ===");

  const competitors = previousData?.competitors || [];
  
  // Get ALL competitors from database to ensure we have at least 18
  const db = getDb();
  const allDbCompetitors = await db.select().from(schema.competitors).where(
    eq(schema.competitors.projectId, projectId)
  );
  
  // If we have fewer than 18, find more
  let finalCompetitors = [...allDbCompetitors];
  if (finalCompetitors.length < 18) {
    console.log(`=== COMPETITOR SELECTION: Only ${finalCompetitors.length} competitors, finding ${18 - finalCompetitors.length} more ===`);
    
    const existingNames = new Set(finalCompetitors.map(c => c.name));
    const businessContext = `
BUSINESS DESCRIPTION (from user - this is ground truth):
${project.notes || 'No description provided.'}
${project.category ? `Category: ${project.category}` : ''}
${project.region ? `Region: ${project.region}` : ''}
`.trim();

    const prompt = `For the business: ${project.name} (${project.notes || project.category || "no description"})
Region: ${project.region || 'Not specified'}

You already know about: ${Array.from(existingNames).join(", ")}

Find ${18 - finalCompetitors.length} MORE direct competitors that have ACTIVE, LIVE websites.
Each competitor MUST have:
- A real, working website URL that you KNOW IS ACTIVE
- Direct competition with the business above (same products/services)
- Similar target market and business model
- **Same region/area as the target business**

CRITICAL: Do NOT include competitors from different regions unless they explicitly serve this region.

IMPORTANT: Only include competitors with websites that are currently live and accessible.

Return a JSON "competitors" array with: name, description, websiteUrl
Do NOT repeat any competitor already listed above.`;

    try {
      const compSelResponse = await summaryService.generateResponse([
        { role: "system", content: "You are a market research analyst. Find competitors in JSON format. Only include competitors with verified active websites. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ], 0.3, 3000, "summary");

      aiUsage.push({
        model: compSelResponse.modelUsed,
        modelType: "summary",
        inputTokens: compSelResponse.inputTokens,
        outputTokens: compSelResponse.outputTokens,
        costCents: calculateCallCost("summary", compSelResponse.inputTokens, compSelResponse.outputTokens),
      });

      const result = JSON.parse(compSelResponse.content);
      
      for (const newCompetitor of result.competitors || []) {
        if (newCompetitor.websiteUrl && !existingNames.has(newCompetitor.name)) {
          // Verify URL is actually live before adding
          const urlCheck = await checkUrlLive(newCompetitor.websiteUrl);
          if (urlCheck.isLive) {
            console.log(`=== COMPETITOR SELECTION: Verified live URL for "${newCompetitor.name}" ===`);
            
            // Save to database
            await db.insert(schema.competitors).values({
              projectId,
              name: newCompetitor.name || "Unknown",
              description: newCompetitor.description || "",
              websiteUrl: newCompetitor.websiteUrl || "",
              revenueEstimate: newCompetitor.revenueEstimate || null,
              marketShare: newCompetitor.marketShare || null,
            });
            
            await db.insert(schema.companies).values({
              projectId,
              name: newCompetitor.name || "Unknown",
              websiteUrl: newCompetitor.websiteUrl || "",
              description: newCompetitor.description || "",
              isMainCompany: false,
            });
            
            finalCompetitors.push(newCompetitor);
            existingNames.add(newCompetitor.name);
          } else {
            console.log(`=== COMPETITOR SELECTION: URL dead for "${newCompetitor.name}" (${urlCheck.statusCode}), skipping ===`);
          }
        }
        
        if (finalCompetitors.length >= 18) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error("=== COMPETITOR SELECTION: Failed to find additional competitors ===", e);
    }
  }

  console.log(`=== COMPETITOR SELECTION: Found ${finalCompetitors.length} total competitors ===`);
  
  // Now deeply read ALL 18+ competitor websites (up to 10 pages each)
  const deepAnalysisResults: Array<{competitor: any; analysis: any; score: number}> = [];
  
  for (const competitor of finalCompetitors.slice(0, 25)) { // Limit to top 25 to avoid timeout
    try {
      console.log(`=== COMPETITOR SELECTION: Deep reading ${competitor.name} ===`);
      
      const deepPrompt = `Conduct a COMPREHENSIVE analysis of this competitor website: ${competitor.websiteUrl}

Analyze up to 10 pages including:
- Homepage
- About page
- Products/Services pages
- Pricing pages
- Blog/Content
- Customer testimonials/reviews
- Contact/Support pages

CRITICAL: Compare this competitor's region to the target business's region. If they are in different regions, heavily penalize their score.

Evaluate:
1. Business model & revenue streams
2. Product/service quality & differentiation
3. Pricing strategy
4. Target customer demographics
5. Market positioning
6. Competitive advantages
7. Website quality & conversion optimization
8. Customer engagement strategies
9. Marketing tactics
10. **Region match: Is this competitor in the same region?** (if different region, heavily penalize)
11. **Overall competitiveness score (1-100)** - heavily penalize for region mismatch

Return JSON:
{
  "analysis": "Comprehensive summary",
  "score": 85,
  "strengths": ["list"],
  "weaknesses": ["list"],
  "marketPosition": "description"
}`;

      const deepResponse = await summaryService.generateResponse([
        { role: "system", content: "You are a competitive intelligence analyst. Deeply analyze competitor websites across multiple pages. Provide comprehensive scoring and analysis." },
        { role: "user", content: deepPrompt }
      ], 0.3, 8000, "analysis");

      aiUsage.push({
        model: deepResponse.modelUsed,
        modelType: "analysis",
        inputTokens: deepResponse.inputTokens,
        outputTokens: deepResponse.outputTokens,
        costCents: calculateCallCost("analysis", deepResponse.inputTokens, deepResponse.outputTokens),
      });

      const result = JSON.parse(deepResponse.content);
      deepAnalysisResults.push({
        competitor,
        analysis: result,
        score: result.score || 50
      });
      
      console.log(`=== COMPETITOR SELECTION: ${competitor.name} scored ${result.score || 50}/100 ===`);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`=== COMPETITOR SELECTION: Failed deep analysis for ${competitor.name} ===`, error);
    }
  }
  
  // Sort by score and select top 6
  deepAnalysisResults.sort((a, b) => b.score - a.score);
  const top6Competitors = deepAnalysisResults.slice(0, 6);
  
  console.log(`=== COMPETITOR SELECTION: Selected top 6 competitors ===`);
  top6Competitors.forEach((item, index) => {
    console.log(`${index + 1}. ${item.competitor.name}: ${item.score}/100`);
  });
  
  // Update database to mark top 6 as "selected"
  for (const item of deepAnalysisResults) {
    const isTop6 = top6Competitors.includes(item);
    await db.update(schema.competitors).set({
      isTopCompetitor: isTop6,
      competitiveScore: item.score
    }).where(
      and(
        eq(schema.competitors.projectId, projectId),
        eq(schema.competitors.name, item.competitor.name)
      )
    );
  }
  
  return {
    ...previousData,
    competitors: top6Competitors.map(item => item.competitor),
    competitorAnalysis: deepAnalysisResults,
    competitorSelectionSuccess: true
  };
}

async function processReviewAggregation(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
  console.log("=== REVIEW AGGREGATION: Starting to gather reviews from multiple sources ===");
  
  // Get top 6 competitors from database
  const db = getDb();
  const topCompetitors = await db.select().from(schema.competitors).where(
    and(
      eq(schema.competitors.projectId, projectId),
      eq(schema.competitors.isTopCompetitor, true)
    )
  ).limit(6);
  
  const mainCompanyName = project.name;
  const mainWebsiteUrl = project.websiteUrl;
  
  try {
    // Get reviews for main company
    const mainReviews = await aggregateReviews(mainCompanyName, mainWebsiteUrl);
    console.log("=== REVIEW AGGREGATION: Found", mainReviews.reviews.length, "reviews for main company ===");
    
    // Get reviews for top competitors - map to expected format with non-null websiteUrl
    const competitorReviewResults = await getCompetitorReviewInsights(
      topCompetitors
        .filter((c): c is typeof c & { websiteUrl: string } => c.websiteUrl !== null)
        .map(c => ({ name: c.name, websiteUrl: c.websiteUrl }))
    );
    
    // Store reviews by company
    const allReviews: Record<string, any> = {
      [mainCompanyName]: {
        reviews: mainReviews.reviews,
        rating: mainReviews.aggregatedRating,
        summary: mainReviews.summary
      }
    };
    
    for (const [name, result] of Array.from(competitorReviewResults)) {
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

async function processFactorGeneration(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
  console.log("processFactorGeneration called, previousData keys:", previousData ? Object.keys(previousData) : "null");
  
  const prompt = `Based on the business research and competitors for "${project.name}", identify key factors that customers use to compare providers in this industry.

  Suggest 5-8 factors that are important in this market.
  For each factor, describe what it means.

  Return JSON with a "factors" array where each factor has: name, description, isEliminated, isReduced, isRaised, isNewCreation.`;

  const factorResponse = await analysisService.generateResponse([
    { role: "system", content: "You are a strategy consultant. Define key factors with EXACT JSON structure: {\"factors\": [{\"name\": string, \"description\": string, \"isEliminated\": boolean, \"isReduced\": boolean, \"isRaised\": boolean, \"isNewCreation\": boolean}]}. Respond with valid JSON only. Be consistent and precise." },
    { role: "user", content: prompt },
  ], 0.1, 2000, "analysis");

  aiUsage.push({
    model: factorResponse.modelUsed,
    modelType: "analysis",
    inputTokens: factorResponse.inputTokens,
    outputTokens: factorResponse.outputTokens,
    costCents: calculateCallCost("analysis", factorResponse.inputTokens, factorResponse.outputTokens),
  });

  const result = JSON.parse(factorResponse.content);
  
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

async function processCompanyScoring(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
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

  // Also flatten competitors if needed
  let competitorsList = competitors;
  while (competitorsList.length > 0 && Array.isArray(competitorsList[0])) {
    competitorsList = competitorsList.flat();
  }

  // Limit to top 6 competitors
  const topCompetitors = competitorsList.slice(0, 6);
  // Include the main company in scoring
  const allCompaniesToScore = [{ name: project.name, isMain: true }, ...topCompetitors.map((c: any) => ({ name: c.name, isMain: false }))];

  const companyNames = allCompaniesToScore.map((c: any) => c.name);
  const prompt = `Score ALL ${companyNames.length} companies listed below on each factor for "${project.name}".

CRITICAL: You MUST return a "scores" array with an entry for EVERY company listed. Do NOT skip any company.

Companies to score: ${companyNames.join(", ")}

Factors: ${factorsList.map((f: any) => f.name).join(", ")}

For EACH company above, provide scores (0-10) for EACH factor listed.

Return JSON with "scores" array containing ${companyNames.length} entries, one per company. Each entry must have the companyName field.`;

  let content: string;
  let result: any;
  const db = getDb();

  // Get all companies for this project for name-based matching
  const companies = await db.select().from(schema.companies).where(
    eq(schema.companies.projectId, projectId)
  );

  try {
    const scoringResponse = await analysisService.generateResponse([
      { role: "system", content: "You are a data analyst. Score each company 0-10 on each factor with confidence (0-1). Format: {\"scores\": [{\"companyName\": string, \"scores\": {\"factorName\": {\"score\": number, \"confidence\": number, \"explanation\": string}}}]}. Always respond with valid JSON only. Be consistent in your scoring methodology." },
      { role: "user", content: prompt },
    ], 0.1, 4000, "analysis");

    aiUsage.push({
      model: scoringResponse.modelUsed,
      modelType: "analysis",
      inputTokens: scoringResponse.inputTokens,
      outputTokens: scoringResponse.outputTokens,
      costCents: calculateCallCost("analysis", scoringResponse.inputTokens, scoringResponse.outputTokens),
    });

    content = scoringResponse.content;
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

      // Validate score is a number between 0-10
      let validScore = typeof scoreData === 'number' ? scoreData : parseFloat(scoreData);
      if (isNaN(validScore) || validScore < 0) validScore = 0;
      if (validScore > 10) validScore = 10;

      const newScore = await db.insert(schema.companyFactorScores).values({
        projectId,
        companyId: company.id,
        factorId: factor.id,
        score: validScore,
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

async function processStrategyCanvas(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
  const factors = previousData?.factors || [];
  const companyScores = previousData?.scores || [];
  
  const prompt = `Create a strategy canvas for "${project.name}" based on the factor scores and factors.
  
  The strategy canvas should show how the company compares to competitors on each factor.
  
  Return JSON with factors array and scores array.`;

  const canvasResponse = await analysisService.generateResponse([
    { role: "system", content: "You are a strategy consultant. Create a strategy canvas in JSON format with EXACT structure. Respond with valid JSON only. Be consistent in factor analysis." },
    { role: "user", content: prompt },
  ], 0.1, 3000, "analysis");

  aiUsage.push({
    model: canvasResponse.modelUsed,
    modelType: "analysis",
    inputTokens: canvasResponse.inputTokens,
    outputTokens: canvasResponse.outputTokens,
    costCents: calculateCallCost("analysis", canvasResponse.inputTokens, canvasResponse.outputTokens),
  });

  const result = JSON.parse(canvasResponse.content);

  return { ...result, ...previousData };
}

async function processNextBigThing(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
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

  const prompt = `Create 2 short strategy options for "${project.name}".
Context: ${(project.notes || '').slice(0, 200)}
Position: ${mainResearch.targetMarket || businessResearch.marketPosition || 'N/A'}
Return JSON with 'strategies' array containing 2 objects with: title, summary, eliminate, reduce, raise, create, difficulty (1-10), targetCustomer, positioningStatement, risks (array), operationalImplications. Each field must have meaningful content, not be empty or "Not specified".`;

  let content: string;
  let result: any;
  
  const MAX_RETRIES = 2;
  let retryCount = 0;
  
  while (retryCount <= MAX_RETRIES) {
    try {
      // Create a custom AI service instance with short timeout for Netlify compatibility
      const nextBigThingAIService = new AIService();
      nextBigThingAIService.requestTimeoutMs = 30000; // 30 seconds
      
      const nbtResponse = await nextBigThingAIService.generateResponse([
        { role: "system", content: "You are a strategy expert. Create JSON with 'strategies' array. EACH strategy MUST include ALL of these fields with real content: title, summary, eliminate, reduce, raise, create, difficulty (1-10), targetCustomer (WHO is the customer), positioningStatement (in quotes), risks (array with 2+ items), operationalImplications. Be concise but complete - do not use placeholder text like 'Not specified'." },
        { role: "user", content: prompt },
      ], 0.7, 1500, "strategy");

      aiUsage.push({
        model: nbtResponse.modelUsed,
        modelType: "strategy",
        inputTokens: nbtResponse.inputTokens,
        outputTokens: nbtResponse.outputTokens,
        costCents: calculateCallCost("strategy", nbtResponse.inputTokens, nbtResponse.outputTokens),
      });

      content = nbtResponse.content;
      result = JSON.parse(content);
      break; // Success, exit retry loop
    } catch (error) {
      retryCount++;
      console.error(`AI generation failed for next big thing (attempt ${retryCount}/${MAX_RETRIES}):`, error);
      
      if (retryCount > MAX_RETRIES) {
        // Final attempt failed, use fallback
        console.log("All retry attempts failed, using fallback strategies");
        return {
          ...previousData,
          strategies: [
            {
              title: "Market Differentiation Strategy",
              summary: "Identify and capitalize on unique market positioning",
              eliminate: "Commoditized offerings",
              reduce: "Average service levels",
              raise: "Customer experience above industry standard",
              create: "Unique value proposition",
              difficulty: 6,
              targetCustomer: "Enterprise customers seeking premium domain services",
              positioningStatement: "For customers seeking differentiated domain registration experience",
              risks: ["Implementation challenges", "Market acceptance uncertainty"],
              operationalImplications: "Requires investment in customer experience improvements",
              valueCurve: [],
            }
          ]
        };
      }
    }
  }
  
  // Save strategy options to the database
  const db = getDb();
  const savedOptions = [];

  // AI may return various formats - check for all possible keys
  let strategyList = (result.strategy_options?.length > 0 ? result.strategy_options : null) ||
                       (result.strategies?.length > 0 ? result.strategies : null) ||
                       (result.nextBigThingOptions?.length > 0 ? result.nextBigThingOptions : null) ||
                       [];

  // If still empty but result is an array, use it directly
  if (strategyList.length === 0 && Array.isArray(result)) {
    strategyList = result;
  }

  console.log("  Strategy list: found", strategyList.length, "options");
  if (strategyList.length === 0) {
    console.log("  WARNING: No strategies found! AI result keys:", Object.keys(result));
    console.log("  AI result content preview:", JSON.stringify(result).slice(0, 500));
  }

  // Helper to truncate arrays to prevent SQLite parameter limits
  const truncateArray = (arr: any[], maxLen: number = 50) => {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, maxLen);
  };

  for (const option of strategyList) {
    try {
      // Small delay between inserts to prevent SQLite parameter limit issues
      await new Promise(resolve => setTimeout(resolve, 100));

      // Ensure all required fields have valid values (even if empty string)
      const title = (option.title || option.Name || "Strategy Option").slice(0, 500) || "Untitled Strategy";
      const summary = (option.summary || option.description || "A strategic option for growth").slice(0, 2000) || "No summary available";
      const eliminate = (option.eliminate || option.eliminateWhat || option.errc?.eliminate || "").slice(0, 1000) || "Not specified";
      const reduce = (option.reduce || option.reduceWhat || option.errc?.reduce || "").slice(0, 1000) || "Not specified";
      const raise = (option.raise || option.raiseWhat || option.errc?.raise || "").slice(0, 1000) || "Not specified";
      const create = (option.create || option.createWhat || option.errc?.create || "").slice(0, 1000) || "Not specified";
      const targetCustomer = (option.targetCustomer || option.target_customer || option.customerSegment || "").slice(0, 500) || "Target customers not specified";
      const positioningStatement = (option.positioningStatement || option.positioning_statement || "").slice(0, 1000) || "Positioning not defined";
      const operationalImplications = (option.operationalImplications || option.operational_implications || "").slice(0, 1000) || "Operational implications not detailed";
      const difficulty = option.difficulty || option.implementationDifficulty || 5;
      const revenuePotential = option.revenuePotential || option.revenue_potential || null;

      const newOption = await db.insert(schema.nextBigThingOptions).values({
        projectId,
        title,
        summary,
        eliminate,
        reduce,
        raise,
        create,
        // Explicitly JSON.stringify to avoid Drizzle expanding arrays into too many SQL parameters
        valueCurve: JSON.stringify(truncateArray(Array.isArray(option.valueCurve) ? option.valueCurve : (option.value_curve || []), 20)),
        targetCustomer,
        positioningStatement,
        risks: JSON.stringify(truncateArray(Array.isArray(option.risks) ? option.risks : (option.Risks || []), 20)),
        difficulty,
        operationalImplications,
        revenuePotential,
      }).returning();

      console.log("  Saved strategy option:", newOption[0]?.title);
      savedOptions.push(newOption[0]); // Push the actual object, not the array
    } catch (saveError) {
      console.error("Failed to save strategy option:", saveError);
      console.error("  Option that failed:", JSON.stringify(option).slice(0, 500));
    }
  }

  return { ...result, ...previousData, strategies: savedOptions };
}

async function processReportAssembly(projectId: number, project: any, previousData: any, aiUsage: AIUsageRecord[]): Promise<any> {
  // Extract data from previous stages
  const businessResearch = previousData?.businessResearch || {};
  const strategies = previousData?.strategies || [];
  const strategyCanvas = previousData?.strategyCanvas || {};
  const companyScores = previousData?.scores || [];
  const competitors = previousData?.competitors || [];
  const mainResearch = previousData?.mainResearch || {};
  const competitorInsights = previousData?.competitorInsights || '';
  const reviews = previousData?.reviews || {};

  console.log("  Report assembly: strategies count =", strategies.length);
  if (strategies.length > 0) {
    console.log("  First strategy keys:", Object.keys(strategies[0]));
    console.log("  First strategy sample:", JSON.stringify(strategies[0]).slice(0, 300));
  }

  const strategiesText = strategies.length > 0 ? strategies.map((s: any, i: number) => `
Strategy ${i + 1}: ${s.title || 'Strategy ' + (i+1)}
Summary: ${s.summary || 'No summary available'}
ERRC:
- Eliminate: ${s.eliminate || 'Not specified'}
- Reduce: ${s.reduce || 'Not specified'}
- Raise: ${s.raise || 'Not specified'}
- Create: ${s.create || 'Not specified'}
Target Customer: ${s.targetCustomer || 'Not specified'}
Positioning: ${s.positioningStatement || 'Not specified'}
Risks: ${Array.isArray(s.risks) ? s.risks.join(', ') : 'Not specified'}
Difficulty: ${s.difficulty || 5}/10
Operational Implications: ${s.operationalImplications || 'Not specified'}
`).join('\n') : 'No strategy options available';

  const competitorsText = competitors.length > 0 ? competitors.map((c: any) => `- ${c.name || 'Unknown'}: ${c.description || 'Description not available'}`).join('\n') : 'No competitor data available';

  const strengths = [...(mainResearch?.strengths || []), ...(businessResearch?.keyStrengths || [])];
  const weaknesses = [...(mainResearch?.weaknesses || []), ...(businessResearch?.keyWeaknesses || [])];
  const marketPosition = mainResearch?.targetMarket || businessResearch?.marketPosition || 'Market position analysis in progress';

  const prompt = `Create a comprehensive strategic report for "${project.name}".
Company: ${mainResearch.description || businessResearch.summary || project.name}
Website: ${project.websiteUrl || 'N/A'}
Market Position: ${marketPosition}

Key Strengths:
${strengths.length > 0 ? strengths.map((s: string) => `- ${s}`).join('\n') : '- Analysis in progress'}

Key Weaknesses:
${weaknesses.length > 0 ? weaknesses.map((w: string) => `- ${w}`).join('\n') : '- Analysis in progress'}

Competitors:
${competitorsText}

Strategies Generated:
${strategiesText}

Return a complete JSON report with ALL of these fields:
- title: Report title
- executiveSummary: 2-3 sentence summary of findings and recommendations
- currentPositioning: { mainCompany: {name, description, websiteUrl}, competitors: [{name, description}], keyFindings: [strings] }
- competitorAnalysis: { marketPosition: string, competitiveAdvantages: [strings], weaknesses: [strings] }
- nextBigThingOptions: array of strategy objects (include all strategies above with all their fields)
- recommendedStrategy: the first/best strategy from nextBigThingOptions
- confidenceScore: number 0-1

Ensure nextBigThingOptions includes COMPLETE strategy data including difficulty (1-10), eliminate, reduce, raise, create, targetCustomer, positioningStatement, risks array, and operationalImplications.`;

  let content: string;
  let result: any;
  
  const MAX_RETRIES = 2;
  let retryCount = 0;
  
  while (retryCount <= MAX_RETRIES) {
    try {
      // Create a custom AI service instance with longer timeout for comprehensive reports
      const reportAIService = new AIService();
      reportAIService.requestTimeoutMs = 25000; // 25 seconds for report generation

      const reportResponse = await reportAIService.generateResponse([
        { role: "system", content: `You are a strategic analysis report writer. Create detailed JSON with all requested fields.
CRITICAL: Every strategy object in nextBigThingOptions MUST include ALL of these fields:
- title (string)
- summary (string)
- eliminate (string) - ERRC: what to eliminate
- reduce (string) - ERRC: what to reduce
- raise (string) - ERRC: what to raise
- create (string) - ERRC: what to create
- difficulty (number 1-10)
- targetCustomer (string) - WHO is the target customer, be specific
- positioningStatement (string) - A complete positioning statement in quotes
- risks (array of strings) - At least 2-3 specific risks
- operationalImplications (string) - What operations changes are needed
- valueCurve (array)
- revenuePotential (string or null)` },
        { role: "user", content: prompt },
      ], 0.7, 2000, "strategy"); // More tokens for comprehensive report

      aiUsage.push({
        model: reportResponse.modelUsed,
        modelType: "strategy",
        inputTokens: reportResponse.inputTokens,
        outputTokens: reportResponse.outputTokens,
        costCents: calculateCallCost("strategy", reportResponse.inputTokens, reportResponse.outputTokens),
      });

      content = reportResponse.content;
      result = JSON.parse(content);
      break; // Success, exit retry loop
    } catch (error) {
      retryCount++;
      console.error(`AI generation failed for report assembly (attempt ${retryCount}/${MAX_RETRIES}):`, error);
      
      if (retryCount > MAX_RETRIES) {
        // Final attempt failed, use fallback
        console.log("All retry attempts failed, using fallback report generation");
        const mainCompany = {
          name: project.name,
          description: mainResearch?.description || businessResearch?.summary || `Analysis of ${project.name}`,
          websiteUrl: project.websiteUrl,
        };
        const strengths = [...(mainResearch?.strengths || []), ...(businessResearch?.keyStrengths || [])];
        const weaknesses = [...(mainResearch?.weaknesses || []), ...(businessResearch?.keyWeaknesses || [])];
        
        result = {
          title: `Strategy Report for ${project.name}`,
          executiveSummary: strategies.length > 0
            ? `Analysis identified ${strategies.length} strategic options. Key differentiators: ${strengths.slice(0, 2).join(', ')}`
            : `Analysis of ${project.name} based on market research.`,
          currentPositioning: {
            mainCompany,
            competitors: competitors.slice(0, 5).map((c: any) => ({ name: c.name || 'Unknown', description: c.description || '' })),
            keyFindings: strengths.length > 0 
              ? strengths.map((s: string) => `Strength: ${s}`)
              : ["Analysis based on comprehensive market research"],
          },
          competitorAnalysis: {
            marketPosition: mainResearch?.targetMarket || businessResearch?.marketPosition || "Market position analysis complete",
            competitiveAdvantages: strengths.slice(0, 5),
            weaknesses: weaknesses.slice(0, 5),
          },
          nextBigThingOptions: strategies.slice(0, 3).map((s: any, i: number) => ({
            id: i + 1,
            title: s.title || "Strategic Option",
            summary: s.summary || "A strategic option for growth",
            difficulty: s.difficulty || 5,
            eliminate: s.eliminate || "",
            reduce: s.reduce || "",
            raise: s.raise || "",
            create: s.create || "",
            targetCustomer: s.targetCustomer || "",
            positioningStatement: s.positioningStatement || "",
            risks: Array.isArray(s.risks) ? s.risks : [],
            operationalImplications: s.operationalImplications || "",
            valueCurve: Array.isArray(s.valueCurve) ? s.valueCurve : [],
          })),
          recommendedStrategy: strategies.length > 0 ? {
            id: 1,
            title: strategies[0].title,
            summary: strategies[0].summary,
          } : null,
          confidenceScore: strategies.length > 0 ? 0.7 : 0.3,
        };
        break; // Exit the retry loop
      }
    }
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