import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { formatDate } from "@/lib/utils/date";

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

    // Get next big thing options
    const options = await db.select().from(schema.nextBigThingOptions).where(
      eq(schema.nextBigThingOptions.projectId, id)
    ).orderBy(schema.nextBigThingOptions.createdAt);

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
        valueCurve: opt.valueCurve,
        targetCustomer: opt.targetCustomer,
        positioningStatement: opt.positioningStatement,
        risks: opt.risks,
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