import { getDb } from "@lib/db/client";
import * as schema from "@lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getProject, createAnalysisRun, updateAnalysisRun } from "@lib/services/db-service";

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
    let analysisRun = await db.query.analysisRuns.findFirst({
      where: and(
        eq(schema.analysisRuns.projectId, id),
        eq(schema.analysisRuns.status, "pending")
      ),
    });

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

    // Process the stage (placeholder for actual AI processing)
    // In production, this would call the AI service layer
    
    return NextResponse.json({
      id: analysisRun.id,
      projectId: analysisRun.projectId,
      stage: analysisRun.stage,
      status: analysisRun.status,
      createdAt: analysisRun.createdAt.toISOString(),
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
    
    const analysisRuns = await db.query.analysisRuns.findMany({
      where: eq(schema.analysisRuns.projectId, id),
      orderBy: [schema.analysisRuns.createdAt],
    });

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
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error getting analysis status:", error);
    return NextResponse.json({ error: "Failed to get analysis status" }, { status: 500 });
  }
}