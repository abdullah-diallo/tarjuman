import { NextRequest, NextResponse } from "next/server";
import { requireAuthFromHeader, checkRateLimit } from "@/lib/api-auth";

/**
 * OpenAI text-to-speech proxy.
 *
 * Streams audio bytes (audio/mpeg) back to the browser so the client can
 * pipe them into an <audio> element with minimal first-byte latency. Used
 * by `useOpenaiTts` to read the Claude-translated transcript aloud in a
 * natural voice — the current Web Speech API fallback works but sounds
 * robotic.
 *
 * Default model is `tts-1-hd` (higher quality, ~$0.15/khutbah). Voice
 * defaults to `onyx` (deep, authoritative male) since the app's policy
 * is male voice for all read-aloud.
 *
 * Requires OPENAI_API_KEY on the server. When unset, returns 503 so the
 * client can gracefully fall back to the browser's Web Speech API.
 */

interface TtsRequest {
  text: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  model?: "tts-1" | "tts-1-hd";
}

const MALE_VOICES = new Set(["echo", "fable", "onyx"]);
const DEFAULT_VOICE = "onyx";
const DEFAULT_MODEL = "tts-1-hd";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Client uses 503 as the signal to fall back to Web Speech API.
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server" },
      { status: 503 }
    );
  }

  const auth = await requireAuthFromHeader(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Sign in to use TTS." },
      { status: 401 }
    );
  }

  const limit = checkRateLimit(auth.userId, "tts");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `TTS rate limit hit. Try again in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text || text.length > 4000) {
    return NextResponse.json(
      {
        error: !text
          ? "Missing or invalid `text`"
          : "`text` exceeds 4000 character limit",
      },
      { status: 400 }
    );
  }

  // Voice + model with safe defaults. Enforce the male-voice-only policy.
  let voice = body.voice ?? DEFAULT_VOICE;
  if (!MALE_VOICES.has(voice)) voice = DEFAULT_VOICE;
  const model =
    body.model === "tts-1" || body.model === "tts-1-hd"
      ? body.model
      : DEFAULT_MODEL;

  // 30s timeout. OpenAI's TTS streams quickly; anything beyond 30s means
  // something is wrong upstream and we'd rather fall back than hang the
  // user's audio output.
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: "mp3",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timed out|abort/i.test(msg)) {
      return NextResponse.json(
        { error: "TTS timed out." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: `TTS failed: ${msg}` },
      { status: 502 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `TTS upstream returned ${upstream.status}: ${detail.slice(0, 200)}` },
      { status: 502 }
    );
  }

  // Stream the audio bytes through to the client. Setting Content-Type
  // lets the client decode without sniffing.
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
