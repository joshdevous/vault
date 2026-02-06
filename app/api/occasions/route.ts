import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET all occasions with their memories
export async function GET() {
  try {
    const occasions = await prisma.occasion.findMany({
      include: { memories: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(occasions);
  } catch (error) {
    console.error("Failed to fetch occasions:", error);
    return NextResponse.json({ error: "Failed to fetch occasions" }, { status: 500 });
  }
}

// POST create new occasion
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get max order
    const maxOrder = await prisma.occasion.aggregate({
      _max: { order: true },
    });
    
    const occasion = await prisma.occasion.create({
      data: {
        title: body.title || "Untitled",
        icon: body.icon || "📸",
        order: (maxOrder._max.order ?? -1) + 1,
      },
      include: { memories: true },
    });
    
    return NextResponse.json(occasion);
  } catch (error) {
    console.error("Failed to create occasion:", error);
    return NextResponse.json({ error: "Failed to create occasion" }, { status: 500 });
  }
}
