import { getDb } from "../db/client";
import { createProject, getProject, updateProject } from "../services/db-service";
import * as schema from "../db/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, websiteUrl, category, region, notes } = body;

    // Validate required fields
    if (!name || !websiteUrl) {
      return Response.json(
        { error: "Name and website URL are required" },
        { status: 400 }
      );
    }

    const db = getDb();
    
    const [project] = await db
      .insert(schema.projects)
      .values({
        name,
        websiteUrl,
        category,
        region,
        notes,
        status: "pending",
      })
      .returning();

    return Response.json(
      { 
        id: project.id,
        name: project.name,
        websiteUrl: project.websiteUrl,
        category: project.category,
        region: project.region,
        status: project.status,
        createdAt: project.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating project:", error);
    return Response.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    
    const projects = await db.query.projects.findMany({
      orderBy: [schema.projects.createdAt.desc],
      limit: 100,
    });

    return Response.json(
      projects.map(p => ({
        id: p.id,
        name: p.name,
        websiteUrl: p.websiteUrl,
        category: p.category,
        region: p.region,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("Error listing projects:", error);
    return Response.json(
      { error: "Failed to list projects" },
      { status: 500 }
    );
  }
}