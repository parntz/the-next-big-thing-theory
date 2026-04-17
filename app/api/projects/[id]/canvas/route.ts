import { getDb } from "@lib/db/client";
import * as schema from "@lib/db/schema";
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

    // Get factors
    const factors = await db.query.factors.findMany({
      where: eq(schema.factors.projectId, id),
    });

    // Get companies
    const companies = await db.query.companies.findMany({
      where: eq(schema.companies.projectId, id),
    });

    // Get scores
    const scores = await db.query.companyFactorScores.findMany({
      where: eq(schema.companyFactorScores.projectId, id),
    });

    // Build canvas data structure
    const canvasData = {
      projectId: id,
      factors: factors.map(f => ({
        id: f.id,
        name: f.name,
        description: f.description,
        isEliminated: f.isEliminated,
        isReduced: f.isReduced,
        isRaised: f.isRaised,
        isNewCreation: f.isNewCreation,
      })),
      companies: companies.map(c => ({
        id: c.id,
        name: c.name,
        isMain: c.isMainCompany,
      })),
      scores: scores.map(s => ({
        companyId: s.companyId,
        factorId: s.factorId,
        score: s.score,
        confidence: s.confidence,
        explanation: s.explanation,
        evidence: s.evidence,
      })),
    };

    return NextResponse.json(canvasData);
  } catch (error) {
    console.error("Error getting canvas data:", error);
    return NextResponse.json({ error: "Failed to get canvas data" }, { status: 500 });
  }
}