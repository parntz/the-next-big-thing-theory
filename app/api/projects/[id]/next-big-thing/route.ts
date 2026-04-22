import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { formatDate } from "@/lib/utils/date";

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

    // Get next big thing options from table
    const options = await db.select().from(schema.nextBigThingOptions).where(
      eq(schema.nextBigThingOptions.projectId, id)
    ).orderBy(schema.nextBigThingOptions.createdAt);

    // If no options in table, try to get from the report
    if (options.length === 0) {
      const reports = await db.select().from(schema.reports).where(
        eq(schema.reports.projectId, id)
      ).orderBy(schema.reports.createdAt).limit(1);

      if (reports.length > 0 && reports[0].nextBigThingOptions) {
        const reportOptions = typeof reports[0].nextBigThingOptions === 'string'
          ? JSON.parse(reports[0].nextBigThingOptions)
          : reports[0].nextBigThingOptions;

        return NextResponse.json({
          projectId: id,
          options: reportOptions.map((opt: any, index: number) => ({
            id: index + 1,
            title: opt.title,
            summary: opt.summary,
            eliminate: opt.eliminate || opt.reduce || "",
            reduce: opt.reduce || "",
            raise: opt.raise || "",
            create: opt.create || "",
            valueCurve: opt.valueCurve || [],
            targetCustomer: opt.targetCustomer || "",
            positioningStatement: opt.positioningStatement || "",
            risks: opt.risks || [],
            difficulty: opt.difficulty || 5,
            operationalImplications: opt.operationalImplications || "",
            revenuePotential: opt.revenuePotential || null,
          })),
          source: "report",
        });
      }
    }

    return NextResponse.json({
      projectId: id,
      options: options.map(opt => ({
        id: opt.id,
        title: opt.title,
        summary: opt.summary,
        eliminate: opt.eliminate,
        reduce: opt.reduce,
        raise: opt.raise,
        create: opt.create,
        valueCurve: typeof opt.valueCurve === 'string' ? JSON.parse(opt.valueCurve) : opt.valueCurve,
        targetCustomer: opt.targetCustomer,
        positioningStatement: opt.positioningStatement,
        risks: (() => {
          try {
            return typeof opt.risks === 'string' ? JSON.parse(opt.risks) : (opt.risks || []);
          } catch {
            return [];
          }
        })(),
        difficulty: opt.difficulty,
        operationalImplications: opt.operationalImplications,
        revenuePotential: opt.revenuePotential,
        createdAt: formatDate(opt.createdAt),
      })),
    });
  } catch (error) {
    console.error("Error getting next big thing options:", error);
    return NextResponse.json({ error: "Failed to get next big thing options" }, { status: 500 });
  }
}

export async function POST(
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

    const body = await request.json();
    const { title, summary, eliminate, reduce, raise, create, valueCurve, targetCustomer, positioningStatement, risks, difficulty, operationalImplications, revenuePotential } = body;

    const db = getDb();

    const [option] = await db
      .insert(schema.nextBigThingOptions)
      .values({
        projectId: id,
        title,
        summary,
        eliminate,
        reduce,
        raise,
        create,
        valueCurve,
        targetCustomer,
        positioningStatement,
        risks,
        difficulty,
        operationalImplications,
        revenuePotential,
      })
      .returning();

    return NextResponse.json({
      id: option.id,
      projectId: option.projectId,
      title: option.title,
      summary: option.summary,
      eliminate: option.eliminate,
      reduce: option.reduce,
      raise: option.raise,
      create: option.create,
      valueCurve: option.valueCurve,
      targetCustomer: option.targetCustomer,
      positioningStatement: option.positioningStatement,
      risks: option.risks,
      difficulty: option.difficulty,
      operationalImplications: option.operationalImplications,
      revenuePotential: option.revenuePotential,
      createdAt: formatDate(option.createdAt),
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating next big thing option:", error);
    return NextResponse.json({ error: "Failed to create next big thing option" }, { status: 500 });
  }
}