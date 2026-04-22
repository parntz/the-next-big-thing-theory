import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

function parseSessionToken(token: string): { id: string; exp: number } | null {
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [data, signature] = decoded.split("|");
    
    if (!data || !signature) return null;
    
    const sessionData = JSON.parse(data);
    if (sessionData.exp > Date.now()) {
      return { id: sessionData.id, exp: sessionData.exp };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = request.cookies.get("session");
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionData = parseSessionToken(session.value);
    if (!sessionData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = parseInt(params.id, 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    const db = getDb();

    // Verify ownership
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, sessionData.id)))
      .limit(1);

    if (projectRows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get factors
    const factors = await db.select().from(schema.factors).where(
      eq(schema.factors.projectId, id)
    );

    // Get companies - only ones that have scores (i.e., the top 6 competitors + main company)
    const allCompanies = await db.select().from(schema.companies).where(
      eq(schema.companies.projectId, id)
    );

    // Get scores
    const scores = await db.select().from(schema.companyFactorScores).where(
      eq(schema.companyFactorScores.projectId, id)
    );

    // Only include companies that have at least one score (i.e., were actually scored)
    const scoredCompanyIds = new Set(scores.map(s => s.companyId));
    const companies = allCompanies.filter(c => scoredCompanyIds.has(c.id));

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
        websiteUrl: c.websiteUrl,
        description: c.description,
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