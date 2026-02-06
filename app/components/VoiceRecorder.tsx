"use client";

import { useState, useRef, useEffect } from "react";

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

type RecordingState = "idle" | "recording" | "processing";

export function VoiceRecorder({ onTranscription, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Whisper prefers 16kHz
        } 
      });
      
      streamRef.current = stream;
      chunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
          ? "audio/webm;codecs=opus" 
          : "audio/webm"
      });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        if (chunksRef.current.length === 0) {
          setError("No audio recorded");
          setState("idle");
          return;
        }
        
        setState("processing");
        
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");
          
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          
          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Transcription failed");
          }
          
          const { text } = await response.json();
          
          if (text && text.trim()) {
            onTranscription(text.trim());
          } else {
            setError("No speech detected");
          }
        } catch (err) {
          console.error("Transcription error:", err);
          setError(err instanceof Error ? err.message : "Transcription failed");
        }
        
        setState("idle");
        setDuration(0);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      setState("recording");
      setDuration(0);
      
      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
      
    } catch (err) {
      console.error("Microphone error:", err);
      setError("Could not access microphone");
      setState("idle");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Main record button */}
      <button
        onClick={state === "recording" ? stopRecording : startRecording}
        disabled={disabled || state === "processing"}
        className={`
          relative w-20 h-20 rounded-full flex items-center justify-center transition-all
          ${state === "recording" 
            ? "bg-red-500 hover:bg-red-600 animate-pulse" 
            : state === "processing"
            ? "bg-[#4f4f4f] cursor-wait"
            : "bg-[#3f3f3f] hover:bg-[#4f4f4f]"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        {state === "recording" ? (
          // Stop icon
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : state === "processing" ? (
          // Spinner
          <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          // Mic icon
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      {/* Status text */}
      <div className="text-center">
        {state === "recording" && (
          <div className="text-red-400 text-sm font-medium">
            Recording... {formatDuration(duration)}
          </div>
        )}
        {state === "processing" && (
          <div className="text-[#9b9b9b] text-sm">
            Transcribing...
          </div>
        )}
        {state === "idle" && !error && (
          <div className="text-[#6b6b6b] text-sm">
            Tap to record
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
