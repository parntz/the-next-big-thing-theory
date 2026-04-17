import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

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

    // Get report for this project
    const report = await db.select().from(schema.reports).where(
      eq(schema.reports.projectId, id)
    ).orderBy(schema.reports.createdAt).limit(1).then(rows => rows[0]);

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Get analysis run
    const analysisRun = report.analysisRunId 
      ? await db.select().from(schema.analysisRuns).where(
          eq(schema.analysisRuns.id, report.analysisRunId)
        ).limit(1).then(rows => rows[0])
      : null;

    return NextResponse.json({
      id: report.id,
      projectId: report.projectId,
      title: report.title,
      executiveSummary: report.executiveSummary,
      currentPositioning: report.currentPositioning,
      competitorAnalysis: report.competitorAnalysis,
      nextBigThingOptions: report.nextBigThingOptions,
      recommendedStrategy: report.recommendedStrategy,
      confidenceScore: report.confidenceScore,
      createdAt: report.createdAt.toISOString(),
      analysisRunId: report.analysisRunId,
      analysisStage: analysisRun?.stage,
    });
  } catch (error) {
    console.error("Error getting report:", error);
    return NextResponse.json({ error: "Failed to get report" }, { status: 500 });
  }
}