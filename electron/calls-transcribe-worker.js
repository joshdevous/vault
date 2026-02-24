let transcriber = null;

function workerLog(message, data) {
  const stamp = new Date().toISOString();
  const text = data ? `${message} ${JSON.stringify(data)}` : message;
  console.log(`[CALLS-WORKER ${stamp}] ${text}`);
}

function parseWav(buffer) {
  const view = new DataView(buffer);
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataOffset = 44;
  const dataSize = view.getUint32(40, true);

  const numSamples = dataSize / (bitsPerSample / 8) / numChannels;
  const audioData = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i += 1) {
    const sampleIndex = dataOffset + i * numChannels * (bitsPerSample / 8);
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

async function getTranscriber() {
  if (!transcriber) {
    const { pipeline } = await import("@xenova/transformers");
    workerLog("Loading Whisper model...");
    transcriber = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small",
      { progress_callback: undefined }
    );
    workerLog("Whisper model loaded");
  }

  return transcriber;
}

async function transcribe(base64Wav) {
  const nodeBuffer = Buffer.from(base64Wav, "base64");
  const arrayBuffer = nodeBuffer.buffer.slice(
    nodeBuffer.byteOffset,
    nodeBuffer.byteOffset + nodeBuffer.byteLength
  );

  const { audioData, sampleRate } = parseWav(arrayBuffer);
  const pipe = await getTranscriber();

  const result = await pipe(audioData, {
    chunk_length_s: 30,
    stride_length_s: 5,
    language: "english",
    task: "transcribe",
    sampling_rate: sampleRate,
  });

  const text = typeof result === "object" && "text" in result
    ? result.text
    : String(result);

  return (text || "").trim();
}

process.on("message", async (message) => {
  const requestId = typeof message?.requestId === "number" ? message.requestId : -1;
  if (message?.type !== "transcribe" || requestId < 0) {
    return;
  }

  try {
    const wavBase64 = typeof message?.wavBase64 === "string" ? message.wavBase64 : "";
    if (!wavBase64) {
      throw new Error("Missing wavBase64 payload");
    }

    workerLog("Transcribing chunk", { requestId, payloadBytes: wavBase64.length });
    const text = await transcribe(wavBase64);
    workerLog("Chunk transcribed", { requestId, textLength: text.length });

    process.send?.({
      type: "result",
      requestId,
      text,
    });
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    workerLog("Transcription failed", { requestId, error: errorText });

    process.send?.({
      type: "error",
      requestId,
      error: errorText,
    });
  }
});
