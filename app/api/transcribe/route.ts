import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

// Cache the pipeline for reuse
let transcriber: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getTranscriber() {
  if (!transcriber) {
    console.log("Loading Whisper model (first time may take a minute)...");
    transcriber = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small", // Good balance of speed and accuracy
      { 
        // Disable progress callback to avoid issues
        progress_callback: undefined 
      }
    );
    console.log("Whisper model loaded!");
  }
  return transcriber;
}

// Ensure temp directory exists
async function ensureTempDir() {
  const tempDir = path.join(process.cwd(), "data", "temp");
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }
  return tempDir;
}

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;
  
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    
    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }
    
    // Save audio to temp file (Whisper needs a file path)
    const tempDir = await ensureTempDir();
    tempFilePath = path.join(tempDir, `${randomUUID()}.webm`);
    
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(tempFilePath, buffer);
    
    // Get or load the transcriber
    const pipe = await getTranscriber();
    
    // Transcribe the audio
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (pipe as any)(tempFilePath, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "english",
      task: "transcribe",
    });
    
    // Clean up temp file
    if (tempFilePath && existsSync(tempFilePath)) {
      await unlink(tempFilePath);
    }
    
    // Extract text from result
    const text = typeof result === "object" && "text" in result 
      ? (result as { text: string }).text 
      : String(result);
    
    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    console.error("Transcription error:", error);
    
    // Clean up temp file on error
    if (tempFilePath && existsSync(tempFilePath)) {
      try {
        await unlink(tempFilePath);
      } catch {}
    }
    
    return NextResponse.json(
      { error: "Transcription failed", details: String(error) }, 
      { status: 500 }
    );
  }
}
