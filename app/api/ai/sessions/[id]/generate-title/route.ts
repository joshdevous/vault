import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/ai/sessions/[id]/generate-title - Generate title using AI
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { apiKey, provider = "openai" } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 400 });
    }

    // Get session with messages
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 4 } },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.messages.length < 2) {
      return NextResponse.json({ error: "Need at least 2 messages" }, { status: 400 });
    }

    // Build conversation summary for title
    const conversationSnippet = session.messages
      .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const titlePrompt = `Generate a very short title (3-5 words max) for this conversation. Just the title, no quotes or punctuation.

${conversationSnippet}`;

    // Call AI to generate title
    let title: string;

    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 20,
          messages: [{ role: "user", content: titlePrompt }],
        }),
      });

      if (!response.ok) {
        throw new Error("Anthropic API error");
      }

      const data = await response.json();
      title = data.content[0]?.text?.trim() || "New Chat";
    } else {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: titlePrompt }],
          max_tokens: 20,
        }),
      });

      if (!response.ok) {
        throw new Error("OpenAI API error");
      }

      const data = await response.json();
      title = data.choices[0]?.message?.content?.trim() || "New Chat";
    }

    // Clean up title
    title = title.replace(/^["']|["']$/g, "").slice(0, 50);

    // Update session title
    const updatedSession = await prisma.chatSession.update({
      where: { id },
      data: { title },
    });

    return NextResponse.json({ title: updatedSession.title });
  } catch (error) {
    console.error("Failed to generate title:", error);
    return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
  }
}
