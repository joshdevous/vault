let desktopStream = null;
let micStream = null;
let mixedStream = null;
let mediaRecorder = null;
let audioContext = null;
let captureRunning = false;
let segmentDurationMs = 3000;
let segmentStopTimer = null;

function trace(message, data) {
  console.log("[CALLS-RENDERER]", message, data ?? "");
  window.electronAPI?.callsTranscriberLog(message, data);
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i += 1) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function convertBlobToWavBase64(audioBlob) {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 16000 });
    trace("Created audio context", { sampleRate: audioContext.sampleRate });
  }

  const arrayBuffer = await audioBlob.arrayBuffer();
  trace("Converting blob", { byteLength: arrayBuffer.byteLength });
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const channelData = decoded.getChannelData(0);
  const wavBuffer = encodeWav(channelData, 16000);

  return arrayBufferToBase64(wavBuffer);
}

async function startCapture({ chunkMs }) {
  if (mediaRecorder || !window.electronAPI) {
    trace("Start ignored", { hasRecorder: Boolean(mediaRecorder), hasBridge: Boolean(window.electronAPI) });
    return;
  }

  try {
    trace("Requesting display media", { chunkMs });
    const systemStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });

    desktopStream = systemStream;
    trace("Display media granted", {
      audioTracks: systemStream.getAudioTracks().length,
      videoTracks: systemStream.getVideoTracks().length,
    });
    systemStream.getVideoTracks().forEach((track) => track.stop());

    let microphoneStream = null;
    try {
      trace("Requesting microphone media");
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      micStream = microphoneStream;
      trace("Microphone media granted", { audioTracks: microphoneStream.getAudioTracks().length });
    } catch {
      micStream = null;
      trace("Microphone media unavailable");
    }

    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 16000 });
    }

    const destination = audioContext.createMediaStreamDestination();
    const systemSource = audioContext.createMediaStreamSource(systemStream);
    systemSource.connect(destination);
    trace("Connected system source to destination");

    if (microphoneStream) {
      const micSource = audioContext.createMediaStreamSource(microphoneStream);
      micSource.connect(destination);
      trace("Connected mic source to destination");
    }

    mixedStream = destination.stream;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    captureRunning = true;
    segmentDurationMs = Math.max(1000, chunkMs || 3000);

    const startNextSegment = () => {
      if (!captureRunning || !mixedStream) {
        return;
      }

      const recorder = new MediaRecorder(mixedStream, { mimeType });
      mediaRecorder = recorder;
      trace("MediaRecorder segment created", { mimeType, segmentDurationMs });

      let segmentBlob = null;

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) {
          trace("Dropped empty segment chunk");
          return;
        }

        segmentBlob = event.data;
        trace("Segment chunk received", { size: event.data.size });
      };

      recorder.onerror = (event) => {
        const message = event?.error?.message || "MediaRecorder error";
        trace("MediaRecorder error", { message });
        window.electronAPI.callsTranscriberReportError(message);
      };

      recorder.onstop = () => {
        const blobToProcess = segmentBlob;

        if (blobToProcess) {
          void (async () => {
            try {
              const wavBase64 = await convertBlobToWavBase64(blobToProcess);
              trace("Sending wav segment", { base64Length: wavBase64.length });
              window.electronAPI.callsTranscriberSendChunk(wavBase64);
            } catch {
              trace("Segment conversion/send failed");
            }
          })();
        }

        mediaRecorder = null;

        if (captureRunning) {
          startNextSegment();
        }
      };

      recorder.start();
      trace("MediaRecorder segment started", { segmentDurationMs });

      if (segmentStopTimer) {
        clearTimeout(segmentStopTimer);
      }

      segmentStopTimer = setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, segmentDurationMs);
    };

    startNextSegment();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start call capture";
    trace("Start capture failed", { message });
    window.electronAPI.callsTranscriberReportError(message);
  }
}

function stopCapture() {
  trace("Stopping capture");

  captureRunning = false;

  if (segmentStopTimer) {
    clearTimeout(segmentStopTimer);
    segmentStopTimer = null;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    trace("MediaRecorder stopped");
  }

  mediaRecorder = null;

  if (desktopStream) {
    desktopStream.getTracks().forEach((track) => track.stop());
    desktopStream = null;
  }

  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  if (mixedStream) {
    mixedStream.getTracks().forEach((track) => track.stop());
    mixedStream = null;
  }
}

window.electronAPI?.onCallsTranscriberStart((payload) => {
  trace("Received start event", payload);
  void startCapture(payload || {});
});

window.electronAPI?.onCallsTranscriberStop(() => {
  trace("Received stop event");
  stopCapture();
});

window.addEventListener("beforeunload", () => {
  stopCapture();
  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
});
