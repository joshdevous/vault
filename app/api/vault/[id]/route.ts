import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET single vault item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vaultItem = await prisma.vaultItem.findUnique({
      where: { id },
    });
    if (!vaultItem) {
      return NextResponse.json({ error: "Vault item not found" }, { status: 404 });
    }
    return NextResponse.json(vaultItem);
  } catch (error) {
    console.error("Failed to fetch vault item:", error);
    return NextResponse.json({ error: "Failed to fetch vault item" }, { status: 500 });
  }
}

// PATCH update vault item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const vaultItem = await prisma.vaultItem.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(vaultItem);
  } catch (error) {
    console.error("Failed to update vault item:", error);
    return NextResponse.json({ error: "Failed to update vault item" }, { status: 500 });
  }
}

// DELETE vault item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.vaultItem.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete vault item:", error);
    return NextResponse.json({ error: "Failed to delete vault item" }, { status: 500 });
  }
}
