import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI();

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            "File too large. Maximum is 25MB. Try trimming the recording or splitting it into parts.",
        },
        { status: 400 }
      );
    }

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "text",
    });

    return NextResponse.json({ transcript: transcription });
  } catch (error: unknown) {
    console.error("Transcription error:", error);
    const message =
      error instanceof Error ? error.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}