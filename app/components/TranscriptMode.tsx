"use client";

import { useState, useRef } from "react";

interface TranslationResult {
  detectedLanguage: string;
  translation: string;
  original: string;
}

interface TranscriptModeProps {
  targetLanguage: string;
  sourceLanguage: string;
}

export default function TranscriptMode({ targetLanguage, sourceLanguage }: TranscriptModeProps) {
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const translateText = async (text: string) => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLanguage, sourceLanguage }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const transcribeAudio = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Server error — file may be too large for upload.");
    }

    if (data.error) throw new Error(data.error);
    return data.transcript as string;
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const audioTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/webm"];
      const isAudio = audioTypes.includes(file.type) || /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name);
      const isText = /\.(txt|vtt|srt)$/i.test(file.name);

      let textToTranslate = "";

      if (isAudio) {
        textToTranslate = await transcribeAudio(file);
        setInputText(textToTranslate);
      } else if (isText) {
        textToTranslate = await file.text();
        setInputText(textToTranslate);
      } else {
        throw new Error("Unsupported file type. Use .mp3, .wav, .m4a, .txt, .vtt, or .srt");
      }

      const translated = await translateText(textToTranslate);
      setResult(translated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualTranslate = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const translated = await translateText(inputText.trim());
      setResult(translated);
    } catch {
      setError("Translation failed. Check your API key and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const exportResult = () => {
    if (!result) return;
    const content = `Original (${result.detectedLanguage}):\n${result.original}\n\nTranslation (${targetLanguage}):\n${result.translation}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#6366f1" : "#2e3050"}`,
          borderRadius: 12,
          padding: "28px 20px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 16,
          background: dragOver ? "#1a1b2e" : "transparent",
          transition: "all 0.2s",
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>📁</div>
        <div style={{ fontSize: 14, color: "#888", marginBottom: 4 }}>
          {fileName ? `✓ ${fileName}` : "Drop file here or click to browse"}
        </div>
        <div style={{ fontSize: 11, color: "#555" }}>
          .mp3 .wav .m4a .txt .vtt .srt
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.ogg,.webm,.txt,.vtt,.srt"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: "#2e3050" }} />
        <span style={{ fontSize: 12, color: "#555" }}>or paste text</span>
        <div style={{ flex: 1, height: 1, background: "#2e3050" }} />
      </div>

      {/* Text input */}
      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Paste transcript or any text here..."
        rows={6}
        style={{
          width: "100%",
          background: "#1e2030",
          color: "#e8e8e8",
          border: "1px solid #2e3050",
          borderRadius: 10,
          padding: "14px 16px",
          fontSize: 15,
          resize: "vertical",
          outline: "none",
          marginBottom: 12,
        }}
      />

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <button
          onClick={handleManualTranslate}
          disabled={loading || !inputText.trim()}
          style={{
            background: loading ? "#3d3f5a" : "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 28px",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Processing..." : "Translate"}
        </button>

        {result && (
          <button onClick={exportResult} style={{
            background: "transparent",
            color: "#888",
            border: "1px solid #2e3050",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 13,
            cursor: "pointer",
          }}>
            Export .txt
          </button>
        )}
      </div>

      {error && (
        <div style={{
          background: "#2d1b1b",
          border: "1px solid #5a2d2d",
          borderRadius: 8,
          padding: "12px 16px",
          color: "#ff6b6b",
          fontSize: 14,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          background: "#1e2030",
          border: "1px solid #2e3050",
          borderRadius: 10,
          padding: "20px",
        }}>
          <div style={{
            fontSize: 11,
            color: "#6366f1",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 16,
          }}>
            Detected: {result.detectedLanguage}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Original</div>
              <div style={{
                background: "#161824",
                borderRadius: 8,
                padding: "12px 14px",
                fontSize: 14,
                lineHeight: 1.6,
                color: "#aaa",
                maxHeight: 300,
                overflowY: "auto",
              }}>
                {result.original}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                Translation ({targetLanguage})
              </div>
              <div style={{
                background: "#161824",
                borderRadius: 8,
                padding: "12px 14px",
                fontSize: 14,
                lineHeight: 1.6,
                color: "#e8e8e8",
                maxHeight: 300,
                overflowY: "auto",
              }}>
                {result.translation}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}