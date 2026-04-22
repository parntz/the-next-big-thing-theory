import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getProject, getCompaniesByProject, getCompetitorsByProject } from "@/lib/services/db-service";

function formatDate(timestamp: number | string | Date): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

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
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, sessionData.id)))
      .limit(1);

    if (projectRows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = projectRows[0];
    const [companies, competitors] = await Promise.all([
      getCompaniesByProject(id),
      getCompetitorsByProject(id),
    ]);

    return NextResponse.json({
      project: {
        id: project.id,
        userId: project.userId,
        name: project.name,
        websiteUrl: project.websiteUrl,
        category: project.category,
        region: project.region,
        notes: project.notes,
        status: project.status,
        createdAt: formatDate(project.createdAt),
        updatedAt: formatDate(project.updatedAt),
      },
      companies: companies.map(c => ({
        id: c.id,
        projectId: c.projectId,
        name: c.name,
        websiteUrl: c.websiteUrl,
        description: c.description,
        isMainCompany: c.isMainCompany,
        createdAt: formatDate(c.createdAt),
      })),
      competitors: competitors.map(c => ({
        id: c.id,
        projectId: c.projectId,
        companyId: c.companyId,
        name: c.name,
        description: c.description,
        isMain: c.isMain,
        websiteUrl: c.websiteUrl,
        revenueEstimate: c.revenueEstimate,
        marketShare: c.marketShare,
        createdAt: formatDate(c.createdAt),
      })),
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    
    // Check if project exists and belongs to user
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, sessionData.id)))
      .limit(1);

    if (projectRows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Delete related records first (order matters due to foreign keys)
    // Delete records that depend on this project
    await db.delete(schema.reports).where(eq(schema.reports.projectId, id));
    await db.delete(schema.companyFactorScores).where(eq(schema.companyFactorScores.projectId, id));
    await db.delete(schema.evidenceItems).where(eq(schema.evidenceItems.projectId, id));
    await db.delete(schema.nextBigThingOptions).where(eq(schema.nextBigThingOptions.projectId, id));
    await db.delete(schema.competitors).where(eq(schema.competitors.projectId, id));
    await db.delete(schema.factors).where(eq(schema.factors.projectId, id));
    await db.delete(schema.analysisRuns).where(eq(schema.analysisRuns.projectId, id));
    await db.delete(schema.companies).where(eq(schema.companies.projectId, id));
    await db.delete(schema.projects).where(eq(schema.projects.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}