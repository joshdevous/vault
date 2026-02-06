import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET single occasion
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const occasion = await prisma.occasion.findUnique({
      where: { id },
      include: { memories: { orderBy: { order: "asc" } } },
    });
    
    if (!occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 404 });
    }
    
    return NextResponse.json(occasion);
  } catch (error) {
    console.error("Failed to fetch occasion:", error);
    return NextResponse.json({ error: "Failed to fetch occasion" }, { status: 500 });
  }
}

// PATCH update occasion
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const occasion = await prisma.occasion.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.order !== undefined && { order: body.order }),
      },
      include: { memories: { orderBy: { order: "asc" } } },
    });
    
    return NextResponse.json(occasion);
  } catch (error) {
    console.error("Failed to update occasion:", error);
    return NextResponse.json({ error: "Failed to update occasion" }, { status: 500 });
  }
}

// DELETE occasion
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.occasion.delete({
      where: { id },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete occasion:", error);
    return NextResponse.json({ error: "Failed to delete occasion" }, { status: 500 });
  }
}
