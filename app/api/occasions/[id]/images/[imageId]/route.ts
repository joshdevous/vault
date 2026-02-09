import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImagesDir } from "@/lib/paths";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// DELETE - remove an image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  
  try {
    // Find the image
    const image = await prisma.occasionImage.findUnique({
      where: { id: imageId },
    });
    
    if (!image || image.occasionId !== id) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    
    // Delete file from disk
    const filepath = path.join(getImagesDir(), image.filename);
    if (existsSync(filepath)) {
      await unlink(filepath);
    }
    
    // Delete from database
    await prisma.occasionImage.delete({
      where: { id: imageId },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete image:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
