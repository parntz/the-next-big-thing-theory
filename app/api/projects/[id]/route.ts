import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getProject, getCompaniesByProject, getCompetitorsByProject } from "@/lib/services/db-service";

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
        createdAt: project.createdAt.toISOString(),
      },
      companies: companies.map(c => ({
        id: c.id,
        projectId: c.projectId,
        name: c.name,
        websiteUrl: c.websiteUrl,
        description: c.description,
        isMainCompany: c.isMainCompany,
        createdAt: c.createdAt.toISOString(),
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
        createdAt: comp.createdAt.toISOString(),
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

    await db.delete(schema.projects).where(eq(schema.projects.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}