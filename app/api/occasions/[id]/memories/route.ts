import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST create new memory under an occasion
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: occasionId } = await params;
    const body = await request.json();
    
    // Get max order for this occasion
    const maxOrder = await prisma.memory.aggregate({
      where: { occasionId },
      _max: { order: true },
    });
    
    const memory = await prisma.memory.create({
      data: {
        content: body.content || "",
        order: (maxOrder._max.order ?? -1) + 1,
        occasionId,
      },
    });
    
    return NextResponse.json(memory);
  } catch (error) {
    console.error("Failed to create memory:", error);
    return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
  }
}
