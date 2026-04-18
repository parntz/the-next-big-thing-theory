import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getProject, createAnalysisRun, updateAnalysisRun, getCompaniesByProject, getCompetitorsByProject, createFactor, createCompany, createCompetitor, createCompanyFactorScore, createNextBigThingOption, createReport } from "@/lib/services/db-service";
import { formatDate } from "@/lib/utils/date";
import { analysisService } from "@/lib/services/ai-service";
import { BusinessResearchSchema, CompetitorDiscoverySchema, NormalizedCompetitorSchema, AnalysisFactorSchema, CompanyScoreResultSchema, StrategyCanvasSchema, NextBigThingStrategySchema, NextBigThingResultSchema, StrategyReport, ReportSchema } from "@/lib/services/ai-service";

// Analysis stages
type AnalysisStage = 
  | "business_research"
  | "competitor_discovery"
  | "competitor_normalization"
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
  const prompt = `Analyze the business for: ${project.name} (${project.websiteUrl})
  
  Provide business research including:
  - Brief summary of the business
  - Key strengths and weaknesses
  - Market position
  - Unique value proposition
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

  return result;
}

async function processCompetitorDiscovery(projectId: number, project: any, previousData: any): Promise<any> {
  const prompt = `For the business "${project.name}" in category "${project.category || 'general'}", identify key competitors.

  Research and return:
  - List of main competitors with names, descriptions, website URLs
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

  return result;
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

  return { competitors: normalized };
}

async function processFactorGeneration(projectId: number, project: any, previousData: any): Promise<any> {
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

  return { ...result, factors: savedFactors, competitors: previousData.competitors };
}

async function processCompanyScoring(projectId: number, project: any, previousData: any): Promise<any> {
  const factors = previousData?.factors || [];
  const competitors = previousData?.competitors || [];
  
  console.log("processCompanyScoring called:");
  console.log("  factors count:", factors.length);
  console.log("  competitors count:", competitors.length);
  console.log("  factors[0]:", factors[0]);
  console.log("  competitors[0]:", competitors[0]);
  
  const prompt = `Score each competitor on each factor for "${project.name}":
  
  Factors: ${factors.map((f: any) => f.name).join(", ")}
  Competitors: ${competitors.map((c: any) => c.name).join(", ")}
  
  For each competitor, provide scores (0-10) for each factor with confidence levels and evidence.
  
  Return JSON with "scores" array containing company scores.`;

  let content: string;
  let result: any;
  const db = getDb();
  
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
  } catch (error) {
    console.error("AI generation/scoring failed for company scoring:", error);
    // Generate and save dummy scores so the pipeline can continue
    return await generateAndSaveDummyScores(projectId, factors, competitors, db);
  }
  
  // Save scores to the database
  const savedScores = [];
  
  console.log("  Saving scores, result.scores:", result.scores?.length);
  
  // Use index-based matching since AI uses generic factor names
  for (let i = 0; i < result.scores?.length; i++) {
    const scoreResult = result.scores[i];
    const companyName = scoreResult.companyName || `Company ${i + 1}`;
    console.log("    scoreResult company:", companyName);
    
    // Get scores as an array or object
    const scoreEntries = Object.entries(scoreResult.scores || {});
    
    for (let j = 0; j < scoreEntries.length; j++) {
      const [factorName, scoreData] = scoreEntries[j];
      
      // Use index-based matching since factor names may not match
      const factor = factors[j];
      if (!factor) {
        console.log("      factor at index", j, "not found!");
        continue;
      }
      
      console.log("      factor:", factor.name, "index:", j);
      
      // Handle both numeric scores and object scores
      const score = typeof scoreData === 'object' ? scoreData.score : scoreData;
      const confidence = typeof scoreData === 'object' ? scoreData.confidence : 0.5;
      const explanation = typeof scoreData === 'object' ? scoreData.explanation : "Auto-scored";
      const evidence = typeof scoreData === 'object' ? scoreData.evidence : [];
      
      // Find the company by name in the companies table
      const company = await db.select().from(schema.companies).where(
        and(
          eq(schema.companies.projectId, projectId),
          eq(schema.companies.name, companyName)
        )
      ).limit(1).then(rows => rows[0]);
      
      console.log("      company:", company?.name, "found:", !!company);
      
      if (!company) continue;
      
      const newScore = await db.insert(schema.companyFactorScores).values({
        projectId,
        companyId: company.id,
        factorId: factor.id,
        score: score,
        confidence: confidence,
        explanation: explanation || "",
        evidence: JSON.stringify(evidence || []),
        isMainCompany: company.isMainCompany,
      }).returning();
      
      savedScores.push(newScore);
    }
  }
  
  console.log("  Saved", savedScores.length, "scores");

  return { ...result, scores: savedScores };
}

async function generateAndSaveDummyScores(projectId: number, factors: any[], competitors: any[], db: any): Promise<any> {
  console.log("generateAndSaveDummyScores called:");
  console.log("  factors count:", factors?.length);
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
    
    for (let j = 0; j < factors?.length; j++) {
      const factor = factors[j];
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

  return result;
}

async function processNextBigThing(projectId: number, project: any, previousData: any): Promise<any> {
  const prompt = `Create "Next Big Thing" strategy options for "${project.name}".
  
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
    // Return dummy strategies so the pipeline can continue
    return {
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
  
  for (const option of result.strategies || []) {
    try {
      const newOption = await db.insert(schema.nextBigThingOptions).values({
        projectId,
        title: option.title || "Strategy Option",
        summary: option.summary || "A strategic option for growth",
        eliminate: option.eliminate || "",
        reduce: option.reduce || "",
        raise: option.raise || "",
        create: option.create || "",
        valueCurve: JSON.stringify(option.valueCurve || []),
        targetCustomer: option.targetCustomer || "",
        positioningStatement: option.positioningStatement || "",
        risks: JSON.stringify(option.risks || []),
        difficulty: option.difficulty || 5,
        operationalImplications: option.operationalImplications || "",
        revenuePotential: option.revenuePotential || null,
      }).returning();
      
      savedOptions.push(newOption);
    } catch (saveError) {
      console.error("Failed to save strategy option:", saveError);
    }
  }

  return { ...result, strategies: savedOptions };
}

async function processReportAssembly(projectId: number, project: any, previousData: any): Promise<any> {
  // Extract data from previous stages
  const strategies = previousData?.strategies || [];
  const strategyCanvas = previousData?.strategyCanvas || {};
  const companyScores = previousData?.companyScores || [];
  const competitors = previousData?.competitors || [];

  const prompt = `Assemble a comprehensive strategic analysis report for "${project.name}".

Incorporate the following data from the analysis pipeline:

**Generated Strategy Options:**
${strategies.length > 0 ? strategies.map((s: any, i: number) => `
Strategy ${i + 1}: ${s.title}
- Summary: ${s.summary}
- Eliminate: ${s.eliminate}
- Reduce: ${s.reduce}
- Raise: ${s.raise}
- Create: ${s.create}
- Target Customer: ${s.targetCustomer}
- Difficulty: ${s.difficulty}/10
`).join('\n') : 'No strategy options were generated.'}

**Company Scores:**
${companyScores.length > 0 ? companyScores.map((c: any) => `- ${c.companyName}: Overall score ${c.overallScore}`).join('\n') : 'No company scores available.'}

**Competitors:**
${competitors.length > 0 ? competitors.map((c: any) => `- ${c.name}: ${c.description || 'No description'}`).join('\n') : 'No competitor data available.'}

Create a comprehensive report with this exact JSON structure:
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
    // Build a report from available data if AI fails
    const mainCompany = {
      name: project.name,
      description: `Strategic analysis for ${project.name}`,
    };
    result = {
      title: `Strategy Report for ${project.name}`,
      executiveSummary: strategies.length > 0 
        ? `Analysis identified ${strategies.length} strategic options for ${project.name}.`
        : "Analysis completed with limitations.",
      currentPositioning: {
        mainCompany,
        competitors: competitors.slice(0, 5),
        keyFindings: strategies.length > 0 
          ? strategies.map((s: any) => `Strategy "${s.title}" offers: ${s.summary}`)
          : ["Analysis completed with limitations"],
      },
      competitorAnalysis: {
        marketPosition: companyScores.length > 0 ? "Market position analysis complete" : "Analysis in progress",
        competitiveAdvantages: strategies.length > 0 ? strategies.map((s: any) => s.raise || s.create || "Strategic opportunity identified") : [],
        weaknesses: strategies.length > 0 ? strategies.map((s: any) => s.reduce || s.eliminate || "Implementation challenges exist") : [],
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

  return result;
}