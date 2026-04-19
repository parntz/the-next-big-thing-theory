import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ProjectCreateSchema = z.object({
  name: z.string().min(1),
  websiteUrl: z.string().url(),
  category: z.string().optional(),
  region: z.string().optional(),
  notes: z.string().optional(),
});

function formatDate(timestamp: number | string | Date): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

export async function POST(request: NextRequest) {
  try {
    console.log("1. Starting POST /api/projects");
    const body = await request.json();
    console.log("2. Request body parsed:", { name: body.name, websiteUrl: body.websiteUrl });

    const validation = ProjectCreateSchema.safeParse(body);
    console.log("3. Validation result:", validation.success ? "passed" : "failed");

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    console.log("4. Getting database connection...");
    const db = getDb();
    console.log("5. Database connection established successfully");

    console.log("6. Inserting project into database...");
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

    console.log("7. Project created successfully:", project.id);

    return NextResponse.json(
      {
        id: project.id,
        name: project.name,
        websiteUrl: project.websiteUrl,
        category: project.category,
        region: project.region,
        notes: project.notes,
        status: project.status,
        createdAt: formatDate(project.createdAt),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ERROR in POST /api/projects:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "No stack trace";
    console.error("Error details:", errorMessage);
    console.error("Error stack:", errorStack);
    return NextResponse.json(
      { error: "Failed to create project", details: errorMessage, stack: errorStack },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    
    const projects = await db.select().from(schema.projects).orderBy(
      schema.projects.createdAt
    ).limit(100);

    return NextResponse.json(
      projects.map(p => ({
        id: p.id,
        name: p.name,
        websiteUrl: p.websiteUrl,
        category: p.category,
        region: p.region,
        notes: p.notes,
        status: p.status,
        createdAt: formatDate(p.createdAt),
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