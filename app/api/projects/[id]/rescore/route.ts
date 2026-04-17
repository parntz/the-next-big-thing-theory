import { getDb } from "@lib/db/client";
import * as schema from "@lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCompanyFactorScoresByProject, updateFactor, getFactorsByProject } from "@lib/services/db-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    const body = await request.json();
    const { factorId, score, confidence, explanation, evidence } = body;

    const db = getDb();

    // Validate factor belongs to project
    const factor = await db.query.factors.findFirst({
      where: eq(schema.factors.id, factorId),
    });

    if (!factor || factor.projectId !== id) {
      return NextResponse.json({ error: "Factor not found or belongs to different project" }, { status: 404 });
    }

    // Update factor
    await db
      .update(schema.factors)
      .set({
        isEliminated: body.isEliminated ?? factor.isEliminated,
        isReduced: body.isReduced ?? factor.isReduced,
        isRaised: body.isRaised ?? factor.isRaised,
        isNewCreation: body.isNewCreation ?? factor.isNewCreation,
      })
      .where(eq(schema.factors.id, factorId));

    // Get company factor scores and update them
    const scores = await db.query.companyFactorScores.findMany({
      where: eq(schema.companyFactorScores.projectId, id),
    });

    const updatedScores = scores.map(scoreItem => ({
      companyId: scoreItem.companyId,
      factorId: scoreItem.factorId,
      score: score ?? scoreItem.score,
      confidence: confidence ?? scoreItem.confidence,
      explanation: explanation ?? scoreItem.explanation,
      evidence: evidence ?? scoreItem.evidence,
    }));

    return NextResponse.json({
      success: true,
      factorId,
      updatedScores,
    });
  } catch (error) {
    console.error("Error rescoreing:", error);
    return NextResponse.json({ error: "Failed to rescore" }, { status: 500 });
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

    const factors = await getFactorsByProject(id);

    return NextResponse.json({
      factors: factors.map(f => ({
        id: f.id,
        name: f.name,
        description: f.description,
        isEliminated: f.isEliminated,
        isReduced: f.isReduced,
        isRaised: f.isRaised,
        isNewCreation: f.isNewCreation,
      })),
    });
  } catch (error) {
    console.error("Error getting factors:", error);
    return NextResponse.json({ error: "Failed to get factors" }, { status: 500 });
  }
}