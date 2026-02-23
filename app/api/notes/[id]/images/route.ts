import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImagesDir } from "@/lib/paths";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

type UploadLike = Blob & { name?: string };
interface JsonUploadBody {
  base64?: unknown;
  mimeType?: unknown;
  ext?: unknown;
  originalName?: unknown;
}

function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
}

function getImageExtension(file: UploadLike): string {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/svg+xml") return "svg";

  const fromName = file.name?.split(".").pop()?.toLowerCase();
  return fromName && /^[a-z0-9]+$/.test(fromName) ? fromName : "png";
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "image/bmp") return "bmp";
  if (mimeType === "image/avif") return "avif";
  return "png";
}

function normalizeExtension(ext: string): string {
  const normalized = ext.trim().toLowerCase().replace(/^\./, "");
  return /^[a-z0-9]+$/.test(normalized) ? normalized : "png";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = randomUUID();
  const { id } = await params;

  try {
    console.log("[notes:image-upload] request:start", {
      requestId,
      noteId: id,
      method: request.method,
      contentType: request.headers.get("content-type"),
    });

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) {
      console.error("[notes:image-upload] note:not-found", { requestId, noteId: id });
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const imagesDir = getImagesDir();
    let filename = "";

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("application/json")) {
      const body = (await request.json()) as JsonUploadBody;
      const base64 = typeof body.base64 === "string" ? body.base64.trim() : "";
      const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
      const extFromBody = typeof body.ext === "string" ? normalizeExtension(body.ext) : "";

      console.log("[notes:image-upload] json:received", {
        requestId,
        mimeType,
        hasBase64: base64.length > 0,
        base64Length: base64.length,
        extFromBody,
        originalName: typeof body.originalName === "string" ? body.originalName : null,
      });

      if (!base64) {
        return NextResponse.json({ error: "No image provided" }, { status: 400 });
      }

      if (!mimeType.startsWith("image/")) {
        return NextResponse.json({ error: "File must be an image" }, { status: 400 });
      }

      const ext = extFromBody || extensionFromMime(mimeType);
      filename = `${randomUUID()}.${ext}`;
      const filepath = path.join(imagesDir, filename);

      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");

      console.log("[notes:image-upload] json:file-target", {
        requestId,
        imagesDir,
        ext,
        filename,
        filepath,
        byteLength: buffer.byteLength,
      });

      await writeFile(filepath, buffer);
    } else {
      const formData = await request.formData();
      const keys = Array.from(formData.keys());
      console.log("[notes:image-upload] formdata:keys", { requestId, keys });

      const image = formData.get("image") as UploadLike | null;

      if (!image) {
        console.error("[notes:image-upload] image:missing", { requestId, keys });
        return NextResponse.json({ error: "No image provided" }, { status: 400 });
      }

      console.log("[notes:image-upload] image:metadata", {
        requestId,
        type: image.type,
        size: image.size,
        hasName: typeof image.name === "string",
        name: image.name ?? null,
        constructor: (image as { constructor?: { name?: string } }).constructor?.name,
      });

      if (typeof image.type !== "string" || !image.type.startsWith("image/")) {
        console.error("[notes:image-upload] image:invalid-type", {
          requestId,
          type: image.type,
        });
        return NextResponse.json({ error: "File must be an image" }, { status: 400 });
      }

      const ext = getImageExtension(image);
      filename = `${randomUUID()}.${ext}`;
      const filepath = path.join(imagesDir, filename);

      console.log("[notes:image-upload] file:target", {
        requestId,
        imagesDir,
        ext,
        filename,
        filepath,
      });

      const bytes = await image.arrayBuffer();
      console.log("[notes:image-upload] file:array-buffer", {
        requestId,
        byteLength: bytes.byteLength,
      });

      await writeFile(filepath, Buffer.from(bytes));
    }

    console.log("[notes:image-upload] request:success", {
      requestId,
      noteId: id,
      filename,
    });

    return NextResponse.json(
      {
        requestId,
        filename,
        url: `/api/images/${filename}`,
      },
      { status: 201 }
    );
  } catch (error) {
    const details = serialiseError(error);
    console.error("[notes:image-upload] request:error", {
      requestId,
      noteId: id,
      ...details,
    });

    return NextResponse.json(
      {
        error: "Failed to upload image",
        requestId,
        details,
      },
      { status: 500 }
    );
  }
}