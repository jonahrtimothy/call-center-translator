"use client";

import { useState } from "react";
import LiveMode from "./components/LiveMode";
import TranscriptMode from "./components/TranscriptMode";

const TARGET_LANGUAGES = [
  "English", "Spanish", "French", "Portuguese",
  "Mandarin", "Hindi", "Arabic", "Japanese", "Korean",
];

const SOURCE_LANGUAGES = [
  "Auto-detect", "Spanish", "French", "Portuguese",
  "Mandarin", "Hindi", "Arabic", "Japanese", "Korean", "English",
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"live" | "transcript">("live");
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [sourceLanguage, setSourceLanguage] = useState("Auto-detect");

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
          Call Center Translator
        </h1>
        <p style={{ fontSize: 14, color: "#888" }}>
          Real-time translation for call center agents
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["live", "transcript"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              background: activeTab === tab ? "#6366f1" : "#1e2030",
              color: activeTab === tab ? "#fff" : "#888",
              transition: "all 0.2s",
            }}
          >
            {tab === "live" ? "🎙 Live Mode" : "📄 Transcript Mode"}
          </button>
        ))}
      </div>

      {/* Language selectors */}
      <div style={{
        display: "flex",
        gap: 20,
        marginBottom: 28,
        padding: "14px 16px",
        background: "#1e2030",
        borderRadius: 10,
        border: "1px solid #2e3050",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#888" }}>From:</label>
          <select
            value={sourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
            style={selectStyle}
          >
            {SOURCE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#888" }}>To:</label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            style={selectStyle}
          >
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
        {sourceLanguage === "Auto-detect" && (
          <span style={{ fontSize: 11, color: "#555", alignSelf: "center" }}>
            Claude will detect the language automatically
          </span>
        )}
      </div>

      {/* Tab content */}
      {activeTab === "live" ? (
        <LiveMode targetLanguage={targetLanguage} sourceLanguage={sourceLanguage} />
      ) : (
        <TranscriptMode targetLanguage={targetLanguage} sourceLanguage={sourceLanguage} />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </main>
  );
}

const selectStyle: React.CSSProperties = {
  background: "#161824",
  color: "#e8e8e8",
  border: "1px solid #2e3050",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 13,
};