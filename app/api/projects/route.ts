import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

const ProjectCreateSchema = z.object({
  name: z.string().min(1),
  websiteUrl: z.string().url(),
  category: z.string().optional(),
  region: z.string().optional(),
  notes: z.string().optional(),
});

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

function formatDate(timestamp: number | string | Date): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const session = request.cookies.get("session");
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionData = parseSessionToken(session.value);
    if (!sessionData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        userId: sessionData.id,
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
        createdAt: formatDate(project.createdAt),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ERROR in POST /api/projects:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error details:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create project", details: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get("session");
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionData = parseSessionToken(session.value);
    if (!sessionData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const projects = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, sessionData.id))
      .orderBy(schema.projects.createdAt)
      .limit(100);

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