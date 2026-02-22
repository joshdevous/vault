import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImagesDir } from "@/lib/paths";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

function getImageExtension(file: File): string {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/svg+xml") return "svg";

  const fromName = file.name.split(".").pop()?.toLowerCase();
  return fromName && /^[a-z0-9]+$/.test(fromName) ? fromName : "png";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const image = formData.get("image") as File | null;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const imagesDir = getImagesDir();
    const ext = getImageExtension(image);
    const filename = `${randomUUID()}.${ext}`;
    const filepath = path.join(imagesDir, filename);

    const bytes = await image.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    return NextResponse.json(
      {
        filename,
        url: `/api/images/${filename}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to upload note image:", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}