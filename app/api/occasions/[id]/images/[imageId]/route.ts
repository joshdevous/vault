import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteImageFileIfUnused } from "@/lib/imageReferences";

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
    
    // Delete from database first
    await prisma.occasionImage.delete({
      where: { id: imageId },
    });

    // Delete file from disk only if nothing references it anywhere
    await deleteImageFileIfUnused(image.filename);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete image:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
