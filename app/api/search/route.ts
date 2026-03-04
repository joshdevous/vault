import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface SearchResult {
  type: "note" | "vault" | "memory";
  noteKind?: "note" | "sheet";
  id: string;
  title: string;
  snippet: string;
  parentTitle?: string; // For memories, the occasion title
  createdAt: string;
}

const SPREADSHEET_CONTENT_PREFIX = "vault:sheet:v1:";

// Strip HTML tags for text matching
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Create a snippet around the match
function createSnippet(text: string, query: string, maxLength: number = 150): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  
  if (index === -1) {
    return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
  }
  
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + query.length + 100);
  
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  
  return snippet;
}

function isSheetNote(note: { icon: string; content: string }): boolean {
  return note.icon === "sheet" || note.icon === "📊" || note.content.startsWith(SPREADSHEET_CONTENT_PREFIX);
}

function sheetContentToText(content: string): string {
  if (!content.startsWith(SPREADSHEET_CONTENT_PREFIX)) {
    return "";
  }

  try {
    const payload = content.slice(SPREADSHEET_CONTENT_PREFIX.length);
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) {
      return "";
    }

    return parsed
      .flatMap((row) => (Array.isArray(row) ? row : []))
      .map((cell) => (typeof cell === "string" ? cell.trim() : ""))
      .filter((cell) => cell.length > 0)
      .join(" ");
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const types = searchParams
    .get("types")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) || ["note", "vault", "memory"];
  const archiveFilter = searchParams.get("archive") || "active";
  const dateRange = searchParams.get("date") || "all";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [], query: "" });
  }

  const results: SearchResult[] = [];

  const now = Date.now();
  let createdAtGte: Date | undefined;
  if (dateRange === "24h") {
    createdAtGte = new Date(now - 24 * 60 * 60 * 1000);
  } else if (dateRange === "7d") {
    createdAtGte = new Date(now - 7 * 24 * 60 * 60 * 1000);
  } else if (dateRange === "30d") {
    createdAtGte = new Date(now - 30 * 24 * 60 * 60 * 1000);
  } else if (dateRange === "365d") {
    createdAtGte = new Date(now - 365 * 24 * 60 * 60 * 1000);
  }

  const createdAtWhere = createdAtGte ? { createdAt: { gte: createdAtGte } } : {};

  try {
    // Search notes
    if (types.includes("note")) {
      const archivedWhere =
        archiveFilter === "archived"
          ? { archived: true }
          : archiveFilter === "all"
            ? {}
            : { archived: false };

      const notes = await prisma.note.findMany({
        where: {
          ...archivedWhere,
          ...createdAtWhere,
          OR: [
            { title: { contains: query } },
            { content: { contains: query } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
      });

      for (const note of notes) {
        const sheet = isSheetNote(note);
        const plainContent = sheet ? sheetContentToText(note.content) : stripHtml(note.content);
        const matchInTitle = note.title.toLowerCase().includes(query.toLowerCase());
        const fallbackSnippet = sheet ? "Sheet content" : "";
        const snippetSource = plainContent || fallbackSnippet;
        
        results.push({
          type: "note",
          noteKind: sheet ? "sheet" : "note",
          id: note.id,
          title: note.title || (sheet ? "New sheet" : "New page"),
          snippet: matchInTitle 
            ? snippetSource.slice(0, 150) + (snippetSource.length > 150 ? "..." : "")
            : createSnippet(snippetSource, query),
          createdAt: note.createdAt.toISOString(),
        });
      }
    }

    // Search vault items
    if (types.includes("vault")) {
      const vaultItems = await prisma.vaultItem.findMany({
        where: {
          ...createdAtWhere,
          OR: [
            { key: { contains: query } },
            { value: { contains: query } },
            { tags: { contains: query } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
      });

      for (const item of vaultItems) {
        const matchInKey = item.key.toLowerCase().includes(query.toLowerCase());
        
        results.push({
          type: "vault",
          id: item.id,
          title: item.key,
          snippet: matchInKey 
            ? item.value.slice(0, 150) + (item.value.length > 150 ? "..." : "")
            : createSnippet(item.value, query),
          createdAt: item.createdAt.toISOString(),
        });
      }
    }

    // Search memories (with occasion info)
    if (types.includes("memory")) {
      const memories = await prisma.memory.findMany({
        where: {
          ...createdAtWhere,
          content: { contains: query },
        },
        include: {
          occasion: {
            select: { title: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
      });

      for (const memory of memories) {
        results.push({
          type: "memory",
          id: memory.id,
          title: memory.occasion.title || "Memory",
          parentTitle: memory.occasion.title,
          snippet: createSnippet(memory.content, query),
          createdAt: memory.createdAt.toISOString(),
        });
      }
    }

    // Sort all results by relevance (title matches first, then by date)
    results.sort((a, b) => {
      const aInTitle = a.title.toLowerCase().includes(query.toLowerCase());
      const bInTitle = b.title.toLowerCase().includes(query.toLowerCase());
      
      if (aInTitle && !bInTitle) return -1;
      if (!aInTitle && bInTitle) return 1;
      
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      results: results.slice(0, limit),
      query,
      total: results.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
