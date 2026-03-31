import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const truncated =
      text.length > 2000 ? text.slice(0, 2000) + "..." : text;

    // Step 1 — detect language (fast, tiny call)
    const detectMsg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: `What language is this text? Reply with ONLY the language name, nothing else.\n\n${truncated.slice(0, 200)}`,
        },
      ],
    });

    const detectedLanguage =
      detectMsg.content[0].type === "text"
        ? detectMsg.content[0].text.trim()
        : "Unknown";

    // If already in target language, skip translation
    if (
      detectedLanguage.toLowerCase() ===
      (targetLanguage || "english").toLowerCase()
    ) {
      return NextResponse.json({
        detectedLanguage,
        translation: truncated,
        original: truncated,
      });
    }

    // Step 2 — translate
    const translateMsg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Translate the following ${detectedLanguage} text to ${targetLanguage || "English"}. 
Reply with ONLY the translated text, no explanations, no labels.

${truncated}`,
        },
      ],
    });

    const translation =
      translateMsg.content[0].type === "text"
        ? translateMsg.content[0].text.trim()
        : "";

    return NextResponse.json({
      detectedLanguage,
      translation,
      original: truncated,
    });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}