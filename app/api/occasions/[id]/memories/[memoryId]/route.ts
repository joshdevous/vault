import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH update memory
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memoryId: string }> }
) {
  try {
    const { memoryId } = await params;
    const body = await request.json();
    
    const memory = await prisma.memory.update({
      where: { id: memoryId },
      data: {
        ...(body.content !== undefined && { content: body.content }),
        ...(body.order !== undefined && { order: body.order }),
      },
    });
    
    return NextResponse.json(memory);
  } catch (error) {
    console.error("Failed to update memory:", error);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

// DELETE memory
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memoryId: string }> }
) {
  try {
    const { memoryId } = await params;
    await prisma.memory.delete({
      where: { id: memoryId },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete memory:", error);
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
