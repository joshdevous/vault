import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImagesDir } from "@/lib/paths";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// GET - list all images for an occasion
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const images = await prisma.occasionImage.findMany({
      where: { occasionId: id },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(images);
  } catch (error) {
    console.error("Failed to fetch images:", error);
    return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 });
  }
}

// POST - upload new image(s) to an occasion
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const formData = await request.formData();
    const files = formData.getAll("images") as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    
    // Verify occasion exists
    const occasion = await prisma.occasion.findUnique({ where: { id } });
    if (!occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 404 });
    }
    
    // Get the images directory (creates if needed)
    const imagesDir = getImagesDir();
    
    // Get current max order
    const maxOrder = await prisma.occasionImage.aggregate({
      where: { occasionId: id },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? -1) + 1;
    
    const savedImages = [];
    
    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        continue; // Skip non-image files
      }
      
      // Generate unique filename
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${randomUUID()}.${ext}`;
      const filepath = path.join(imagesDir, filename);
      
      // Write file to disk
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filepath, buffer);
      
      // Save to database
      const image = await prisma.occasionImage.create({
        data: {
          filename,
          order: nextOrder++,
          occasionId: id,
        },
      });
      
      savedImages.push(image);
    }
    
    return NextResponse.json(savedImages, { status: 201 });
  } catch (error) {
    console.error("Failed to upload images:", error);
    return NextResponse.json({ error: "Failed to upload images" }, { status: 500 });
  }
}
