import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getProject, getCompaniesByProject, getCompetitorsByProject, getAnalysisRunsByProject } from "@/lib/services/db-service";

function formatDate(timestamp: number | string | Date): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
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

    const project = await getProject(id);
    
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const [companies, competitors] = await Promise.all([
      getCompaniesByProject(id),
      getCompetitorsByProject(id),
    ]);

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        websiteUrl: project.websiteUrl,
        category: project.category,
        region: project.region,
        notes: project.notes,
        status: project.status,
        createdAt: formatDate(project.createdAt),
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
      competitors: competitors.map(comp => ({
        id: comp.id,
        projectId: comp.projectId,
        companyId: comp.companyId,
        name: comp.name,
        description: comp.description,
        isMain: comp.isMain,
        websiteUrl: comp.websiteUrl,
        revenueEstimate: comp.revenueEstimate,
        marketShare: comp.marketShare,
        createdAt: formatDate(comp.createdAt),
      })),
    });
  } catch (error) {
    console.error("Error getting project:", error);
    return NextResponse.json({ error: "Failed to get project" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    const db = getDb();
    const project = await getProject(id);
    
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Delete related data first (in order of dependencies)
    const analysisRuns = await getAnalysisRunsByProject(id);
    
    // Delete analysis runs and related data
    for (const run of analysisRuns) {
      // Delete factors for this project
      await db.delete(schema.factors).where(eq(schema.factors.projectId, id));
      
      // Delete company factor scores for this project
      await db.delete(schema.companyFactorScores).where(eq(schema.companyFactorScores.projectId, id));
      
      // Delete next big thing options for this project
      await db.delete(schema.nextBigThingOptions).where(eq(schema.nextBigThingOptions.projectId, id));
      
      // Delete reports for this project
      await db.delete(schema.reports).where(eq(schema.reports.projectId, id));
      
      // Delete analysis run itself
      await db.delete(schema.analysisRuns).where(eq(schema.analysisRuns.id, run.id));
    }

    // Delete competitors
    await db.delete(schema.competitors).where(eq(schema.competitors.projectId, id));
    
    // Delete companies
    await db.delete(schema.companies).where(eq(schema.companies.projectId, id));
    
    // Delete the project
    await db.delete(schema.projects).where(eq(schema.projects.id, id));

    return NextResponse.json({ success: true, message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}