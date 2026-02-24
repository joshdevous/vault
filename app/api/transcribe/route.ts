import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Cache the pipeline for reuse
let transcriber: Awaited<ReturnType<typeof pipeline>> | null = null;
let transcribeRequestCount = 0;

function debugLog(message: string, payload?: unknown) {
  const stamp = new Date().toISOString();
  const details = payload === undefined ? "" : ` ${typeof payload === "string" ? payload : JSON.stringify(payload)}`;
  const line = `[TRANSCRIBE ${stamp}] ${message}${details}`;
  console.log(line);

  try {
    const baseDir = process.env.MOTHERSHIP_DATA_DIR || join(process.cwd(), "data", "temp");
    mkdirSync(baseDir, { recursive: true });
    appendFileSync(join(baseDir, "calls-debug.log"), `${line}\n`, "utf8");
  } catch {
    // Ignore file logging failures
  }
}

async function getTranscriber() {
  if (!transcriber) {
    console.log("Loading Whisper model (first time may take a minute)...");
    transcriber = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small", // Good balance of speed and accuracy
      { 
        progress_callback: undefined 
      }
    );
    console.log("Whisper model loaded!");
  }
  return transcriber;
}

// Parse WAV file and extract Float32Array audio data
function parseWav(buffer: ArrayBuffer): { audioData: Float32Array; sampleRate: number } {
  const view = new DataView(buffer);
  
  // Read WAV header
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  
  // Find data chunk
  const dataOffset = 44;
  const dataSize = view.getUint32(40, true);
  
  // Convert to Float32Array
  const numSamples = dataSize / (bitsPerSample / 8) / numChannels;
  const audioData = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const sampleIndex = dataOffset + i * numChannels * (bitsPerSample / 8);
    // Read first channel only (mono)
    if (bitsPerSample === 16) {
      const sample = view.getInt16(sampleIndex, true);
      audioData[i] = sample / 32768;
    } else if (bitsPerSample === 32) {
      const sample = view.getFloat32(sampleIndex, true);
      audioData[i] = sample;
    }
  }
  
  return { audioData, sampleRate };
}

export async function POST(request: NextRequest) {
  const requestId = ++transcribeRequestCount;
  try {
    debugLog("request received", { requestId });
    const contentType = request.headers.get("content-type") || "";
    let arrayBuffer: ArrayBuffer;

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      const wavBase64 = typeof body?.wavBase64 === "string" ? body.wavBase64 : "";

      if (!wavBase64) {
        debugLog("missing wavBase64 in JSON payload", { requestId });
        return NextResponse.json({ error: "No wavBase64 provided" }, { status: 400 });
      }

      const nodeBuffer = Buffer.from(wavBase64, "base64");
      arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
      debugLog("decoded JSON wav payload", { requestId, bytes: nodeBuffer.byteLength, source: body?.source || "unknown" });
    } else {
      const formData = await request.formData();
      const audioFile = formData.get("audio") as File;

      if (!audioFile) {
        debugLog("missing audio file", { requestId });
        return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
      }

      debugLog("audio file size", { requestId, bytes: audioFile.size });
      arrayBuffer = await audioFile.arrayBuffer();
      debugLog("read arrayBuffer", { requestId, bytes: arrayBuffer.byteLength });
    }
    
    // Parse WAV file
    const { audioData, sampleRate } = parseWav(arrayBuffer);
    
    debugLog("parsed wav", { requestId, samples: audioData.length, sampleRate });
    
    // Get or load the transcriber
    const pipe = await getTranscriber();
    
    // Transcribe the audio - pass raw audio data directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (pipe as any)(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "english",
      task: "transcribe",
      sampling_rate: sampleRate,
    });
    
    // Extract text from result
    const text = typeof result === "object" && "text" in result 
      ? (result as { text: string }).text 
      : String(result);

    debugLog("transcription result", { requestId, textLength: text.trim().length });
    
    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    debugLog("transcription error", { requestId, error: String(error) });
    
    return NextResponse.json(
      { error: "Transcription failed", details: String(error) }, 
      { status: 500 }
    );
  }
}
