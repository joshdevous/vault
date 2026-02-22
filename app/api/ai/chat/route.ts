import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Strip HTML tags from notes
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Get context from database based on keywords
async function getRelevantContext(query: string, limit: number = 5): Promise<string[]> {
  const context: string[] = [];
  
  // Extract keywords (simple approach - can be improved)
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !["the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "has", "have", "been", "were", "they", "this", "that", "with", "what", "when", "where", "which", "their", "about"].includes(w));
  
  if (keywords.length === 0) {
    // No specific keywords, get recent notes as context
    const recentNotes = await prisma.note.findMany({
      where: { archived: false },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    
    for (const note of recentNotes) {
      const content = stripHtml(note.content);
      if (content.length > 0) {
        context.push(`[Note: ${note.title}]\n${content.slice(0, 500)}`);
      }
    }
    return context;
  }

  // Search notes for keywords
  const notes = await prisma.note.findMany({
    where: {
      archived: false,
      OR: keywords.flatMap(kw => [
        { title: { contains: kw } },
        { content: { contains: kw } },
      ]),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  for (const note of notes) {
    const content = stripHtml(note.content);
    if (content.length > 0) {
      context.push(`[Note: ${note.title}]\n${content.slice(0, 500)}`);
    }
  }

  // Search vault items
  const vaultItems = await prisma.vaultItem.findMany({
    where: {
      OR: keywords.flatMap(kw => [
        { key: { contains: kw } },
        { value: { contains: kw } },
      ]),
    },
    take: limit,
  });

  for (const item of vaultItems) {
    context.push(`[Vault: ${item.key}]\n${item.value.slice(0, 200)}`);
  }

  // Search memories
  const memories = await prisma.memory.findMany({
    where: {
      OR: keywords.map(kw => ({ content: { contains: kw } })),
    },
    include: { occasion: true },
    take: limit,
  });

  for (const memory of memories) {
    context.push(`[Memory from ${memory.occasion.title}]\n${memory.content.slice(0, 300)}`);
  }

  return context;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, apiKey, provider = "openai", model } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ 
        error: "API key required",
        message: "Please set your API key in Settings to use AI Chat." 
      }, { status: 400 });
    }

    // Get the last user message for context search
    const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
    const contextQuery = lastUserMessage?.content || "";

    // Get relevant context from notes/vault/memories
    const relevantContext = await getRelevantContext(contextQuery);

    // Build system prompt with context
    const systemPrompt = `You are a helpful AI assistant integrated into Mothership, a personal notes and memories app. You have access to the user's notes, vault items, and memories to help answer their questions.

${relevantContext.length > 0 ? `Here is relevant context from the user's data:

${relevantContext.join("\n\n")}

Use this context to provide helpful, accurate responses. If referencing their notes or memories, mention where the information comes from.` : "No specific relevant context found for this query. Answer based on the conversation."}

Be helpful, concise, and friendly. Use British English spelling.`;

    // Prepare API request based on provider
    let apiUrl: string;
    let apiHeaders: Record<string, string>;
    let apiBody: object;

    if (provider === "anthropic") {
      apiUrl = "https://api.anthropic.com/v1/messages";
      apiHeaders = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
      apiBody = {
        model: model || "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      };
    } else {
      // Default to OpenAI
      apiUrl = "https://api.openai.com/v1/chat/completions";
      apiHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      };
      apiBody = {
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        max_tokens: 1024,
      };
    }

    // Make API request
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: apiHeaders,
      body: JSON.stringify(apiBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("AI API error:", error);
      return NextResponse.json({ 
        error: "AI request failed",
        message: `API error: ${response.status}` 
      }, { status: response.status });
    }

    const data = await response.json();

    // Extract response based on provider
    let assistantMessage: string;
    if (provider === "anthropic") {
      assistantMessage = data.content?.[0]?.text || "No response";
    } else {
      assistantMessage = data.choices?.[0]?.message?.content || "No response";
    }

    return NextResponse.json({
      message: assistantMessage,
      contextUsed: relevantContext.length,
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json({ 
      error: "Failed to process chat",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
