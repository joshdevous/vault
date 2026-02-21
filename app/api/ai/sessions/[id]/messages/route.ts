import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Generate title from first message
function generateTitle(content: string): string {
  const cleaned = content.slice(0, 50).trim();
  return cleaned.length < content.length ? cleaned + "..." : cleaned;
}

// POST /api/ai/sessions/[id]/messages - Add a message to a session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { role, content } = body;

    if (!role || !content) {
      return NextResponse.json({ error: "Role and content are required" }, { status: 400 });
    }

    // Get current session to check if we need to update title
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: { messages: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Create the message
    const message = await prisma.chatMessage.create({
      data: {
        role,
        content,
        sessionId: id,
      },
    });

    // If this is the first user message and title is still "New Chat", update it
    if (session.title === "New Chat" && role === "user" && session.messages.length === 0) {
      await prisma.chatSession.update({
        where: { id },
        data: { title: generateTitle(content) },
      });
    }

    // Touch the session to update updatedAt
    await prisma.chatSession.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error("Failed to add message:", error);
    return NextResponse.json({ error: "Failed to add message" }, { status: 500 });
  }
}
