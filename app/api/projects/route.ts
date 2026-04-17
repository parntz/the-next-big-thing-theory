import { getDb } from "@lib/db/client";
import * as schema from "@lib/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ProjectCreateSchema = z.object({
  name: z.string().min(1),
  websiteUrl: z.string().url(),
  category: z.string().optional(),
  region: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ProjectCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const db = getDb();
    
    const [project] = await db
      .insert(schema.projects)
      .values({
        name: validation.data.name,
        websiteUrl: validation.data.websiteUrl,
        category: validation.data.category,
        region: validation.data.region,
        notes: validation.data.notes,
        status: "pending",
      })
      .returning();

    return NextResponse.json(
      { 
        id: project.id,
        name: project.name,
        websiteUrl: project.websiteUrl,
        category: project.category,
        region: project.region,
        notes: project.notes,
        status: project.status,
        createdAt: project.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    
    const projects = await db.query.projects.findMany({
      orderBy: [schema.projects.createdAt.desc],
      limit: 100,
    });

    return NextResponse.json(
      projects.map(p => ({
        id: p.id,
        name: p.name,
        websiteUrl: p.websiteUrl,
        category: p.category,
        region: p.region,
        notes: p.notes,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("Error listing projects:", error);
    return NextResponse.json(
      { error: "Failed to list projects" },
      { status: 500 }
    );
  }
}