import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET all vault items
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const vaultItems = await prisma.vaultItem.findMany({
      where: search
        ? {
            OR: [
              { key: { contains: search } },
              { value: { contains: search } },
              { tags: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(vaultItems);
  } catch (error) {
    console.error("Failed to fetch vault items:", error);
    return NextResponse.json({ error: "Failed to fetch vault items" }, { status: 500 });
  }
}

// POST create new vault item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, tags } = body;

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const vaultItem = await prisma.vaultItem.create({
      data: {
        key,
        value: value || "",
        tags: tags || "",
      },
    });
    return NextResponse.json(vaultItem);
  } catch (error) {
    console.error("Failed to create vault item:", error);
    return NextResponse.json({ error: "Failed to create vault item" }, { status: 500 });
  }
}
