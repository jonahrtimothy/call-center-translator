"use client";

import { useState, useEffect, useRef } from "react";

interface TranslationEntry {
  id: number;
  original: string;
  translation: string;
  detectedLanguage: string;
  timestamp: string;
}

interface LiveModeProps {
  targetLanguage: string;
  sourceLanguage: string;
}

type AudioSource = "mic" | "tab" | null;

const langMap: Record<string, string> = {
  "Spanish": "es-ES",
  "French": "fr-FR",
  "Portuguese": "pt-BR",
  "Mandarin": "zh-CN",
  "Hindi": "hi-IN",
  "Arabic": "ar-SA",
  "Japanese": "ja-JP",
  "Korean": "ko-KR",
  "English": "en-US",
};

const CHUNK_INTERVAL = 2500;

export default function LiveMode({ targetLanguage, sourceLanguage }: LiveModeProps) {
  const [activeSource, setActiveSource] = useState<AudioSource>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [subtitles, setSubtitles] = useState<TranslationEntry[]>([]);
  const [error, setError] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [processingCount, setProcessingCount] = useState(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subtitleEndRef = useRef<HTMLDivElement>(null);
  const entryIdRef = useRef(0);
  const targetLangRef = useRef(targetLanguage);
  const sourceLangRef = useRef(sourceLanguage);

  // Keep refs in sync so async callbacks always use latest values
  useEffect(() => { targetLangRef.current = targetLanguage; }, [targetLanguage]);
  useEffect(() => { sourceLangRef.current = sourceLanguage; }, [sourceLanguage]);

  useEffect(() => {
    subtitleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [subtitles]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    };
  }, []);

  // Fire-and-forget translate — never blocks the caller
  const translateAsync = async (text: string) => {
    setProcessingCount((c) => c + 1);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          targetLanguage: targetLangRef.current,
          sourceLanguage: sourceLangRef.current,
        }),
      });
      const data = await res.json();
      if (data.error) return;
      const entry: TranslationEntry = {
        id: entryIdRef.current++,
        original: data.original,
        translation: data.translation,
        detectedLanguage: data.detectedLanguage,
        timestamp: new Date().toLocaleTimeString(),
      };
      setSubtitles((prev) => [...prev, entry]);
    } catch {
      // silent fail
    } finally {
      setProcessingCount((c) => c - 1);
    }
  };

  const startRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      sourceLangRef.current === "Auto-detect"
        ? ""
        : langMap[sourceLangRef.current] || "";

    let lastInterim = "";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      setInterimText(interim);
      lastInterim = interim;

      if (final.trim()) {
        setInterimText("");
        lastInterim = "";
        translateAsync(final.trim()); // fire and forget
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow access and try again.");
        stopAll();
      }
      // ignore no-speech
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        try { recognition.start(); } catch { /* already starting */ }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setError("");
  };

  const startMic = async () => {
    setActiveSource("mic");
    setSourceLabel("Microphone");
    setError("");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      startRecognition();
    } catch {
      setError("Microphone access denied.");
      setActiveSource(null);
    }
  };

  const startTabAudio = async () => {
    setActiveSource("tab");
    setSourceLabel("Tab / screen audio");
    setError("");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setError("No audio detected. Check 'Share tab audio' when prompted.");
        stream.getTracks().forEach((t) => t.stop());
        setActiveSource(null);
        return;
      }

      stream.getVideoTracks().forEach((t) => t.stop());
      streamRef.current = stream;

      const audioStream = new MediaStream(audioTracks);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg;codecs=opus";

      const startNewRecorder = () => {
        const recorder = new MediaRecorder(audioStream, { mimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          if (chunks.length === 0) return;
          const blob = new Blob(chunks, { type: mimeType });

          // Fire and forget — parallel processing
          (async () => {
            setProcessingCount((c) => c + 1);
            try {
              const formData = new FormData();
              formData.append("file", blob, "chunk.webm");
              const res = await fetch("/api/transcribe", {
                method: "POST",
                body: formData,
              });
              const data = await res.json();
              if (data.transcript?.trim()) {
                await translateAsync(data.transcript.trim());
              }
            } catch {
              // silent fail
            } finally {
              setProcessingCount((c) => c - 1);
            }
          })();
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
      };

      startNewRecorder();
      setIsListening(true);

      // Rotate recorder every 2.5s — parallel, not sequential
      chunkIntervalRef.current = setInterval(() => {
        const current = mediaRecorderRef.current;
        if (current && current.state === "recording") {
          current.stop(); // triggers onstop → async processing
          startNewRecorder(); // immediately starts next chunk
        }
      }, CHUNK_INTERVAL);

      stream.getAudioTracks()[0].onended = () => stopAll();

    } catch {
      setError("Screen sharing cancelled or not supported.");
      setActiveSource(null);
    }
  };

  const stopAll = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsListening(false);
    setActiveSource(null);
    setInterimText("");
    setSourceLabel("");
  };

  const clearSubtitles = () => {
    setSubtitles([]);
    setInterimText("");
  };

  const exportTranscript = () => {
    if (subtitles.length === 0) return;
    const lines = subtitles.map(
      (e) =>
        `[${e.timestamp}] (${e.detectedLanguage})\nOriginal:    ${e.original}\nTranslation: ${e.translation}\n`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translation-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Source buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {!isListening ? (
          <>
            <button onClick={startMic} style={sourceBtn("#6366f1")}>
              🎙 Microphone
            </button>
            <button onClick={startTabAudio} style={sourceBtn("#0891b2")}>
              🖥 Tab / Screen audio
            </button>
          </>
        ) : (
          <button onClick={stopAll} style={sourceBtn("#dc2626")}>
            <span style={pulseDot} /> Stop — {sourceLabel}
          </button>
        )}

        {subtitles.length > 0 && !isListening && (
          <>
            <button onClick={clearSubtitles} style={ghostBtn}>Clear</button>
            <button onClick={exportTranscript} style={ghostBtn}>Export .txt</button>
          </>
        )}

        {isListening && (
          <span style={{ fontSize: 12, color: activeSource === "tab" ? "#0891b2" : "#6366f1" }}>
            {activeSource === "tab"
              ? processingCount > 0
                ? `Translating ${processingCount} chunk${processingCount > 1 ? "s" : ""}...`
                : "Capturing audio..."
              : "Listening..."}
          </span>
        )}
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {/* Subtitle feed */}
      <div style={feedBox}>
        {subtitles.length === 0 && !interimText && (
          <div style={emptyState}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎙</div>
            <div style={{ fontSize: 13 }}>
              {isListening
                ? activeSource === "tab"
                  ? "Processing audio..."
                  : "Waiting for speech..."
                : "Choose an audio source above to begin"}
            </div>
          </div>
        )}

        {subtitles.map((entry) => (
          <div key={entry.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={langBadge}>{entry.detectedLanguage}</span>
              <span style={{ fontSize: 10, color: "#444" }}>{entry.timestamp}</span>
            </div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 4, fontStyle: "italic" }}>
              {entry.original}
            </div>
            <div style={translationCard}>{entry.translation}</div>
          </div>
        ))}

        {interimText && (
          <div style={{ marginBottom: 8 }}>
            <div style={interimCard}>{interimText}</div>
          </div>
        )}

        <div ref={subtitleEndRef} />
      </div>

      <p style={{ fontSize: 11, color: "#444", marginTop: 8 }}>
        Mic: real-time via Web Speech API (Chrome only) •
        Tab audio: {CHUNK_INTERVAL / 1000}s chunks via Whisper — parallel processing
      </p>
    </div>
  );
}

const sourceBtn = (bg: string): React.CSSProperties => ({
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
});

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "#888",
  border: "1px solid #2e3050",
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 13,
  cursor: "pointer",
};

const pulseDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#fff",
  display: "inline-block",
  animation: "pulse 1.2s infinite",
};

const errorBox: React.CSSProperties = {
  background: "#2d1b1b",
  border: "1px solid #5a2d2d",
  borderRadius: 8,
  padding: "12px 16px",
  color: "#ff6b6b",
  fontSize: 14,
  marginBottom: 16,
};

const feedBox: React.CSSProperties = {
  background: "#0a0c14",
  border: "1px solid #2e3050",
  borderRadius: 12,
  minHeight: 320,
  maxHeight: 440,
  overflowY: "auto",
  padding: "16px",
  position: "relative",
};

const emptyState: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  textAlign: "center",
  color: "#333",
};

const langBadge: React.CSSProperties = {
  fontSize: 10,
  color: "#6366f1",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const translationCard: React.CSSProperties = {
  fontSize: 15,
  color: "#e8e8e8",
  lineHeight: 1.5,
  background: "#1e2030",
  borderRadius: 8,
  padding: "10px 14px",
  borderLeft: "3px solid #6366f1",
};

const interimCard: React.CSSProperties = {
  fontSize: 15,
  color: "#555",
  fontStyle: "italic",
  background: "#12141f",
  borderRadius: 8,
  padding: "10px 14px",
  borderLeft: "3px solid #333",
};