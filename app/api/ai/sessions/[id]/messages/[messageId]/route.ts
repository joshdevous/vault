import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/ai/sessions/[id]/messages/[messageId] - Delete a message
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id, messageId } = await params;

    // Verify message belongs to session
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.sessionId !== id) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Delete the message
    await prisma.chatMessage.delete({
      where: { id: messageId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete message:", error);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
