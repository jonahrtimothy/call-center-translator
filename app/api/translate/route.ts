import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Truncate very long texts to avoid token limits
    const truncated = text.length > 3000 ? text.slice(0, 3000) + "..." : text;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Detect the language of this text and translate it to ${targetLanguage || "English"}.

Respond with ONLY a raw JSON object. No markdown, no code blocks, no explanation.
Use exactly this format:
{"detectedLanguage":"Spanish","translation":"translated text here","original":"original text here"}

Text:
${truncated}`,
        },
        {
          role: "assistant",
          content: "{",
        },
      ],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Reconstruct since we prefilled with "{"
    const reconstructed = "{" + raw;

    // Strip any accidental markdown
    const clean = reconstructed
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // Extract JSON object robustly
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}