"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useTts, type UseTtsOptions, type TtsItem } from "./use-tts";

/**
 * High-quality TTS via OpenAI's `/v1/audio/speech` endpoint, with automatic
 * fallback to the browser's Web Speech API.
 *
 * Why this exists: Web Speech voices vary wildly by OS and sound robotic on
 * many platforms. OpenAI's tts-1-hd produces natural-sounding output for
 * ~$0.15 per khutbah, which sits comfortably inside the user's budget.
 *
 * Failure modes that trigger the Web Speech fallback (per-item, not session-wide):
 *   - Server returns 503 (OPENAI_API_KEY not configured)
 *   - Network failure / timeout
 *   - The browser blocks autoplay (rare since the user already gestured to record)
 *
 * The fallback fires by handing the affected items to `useTts` so the same
 * items still get spoken via SpeechSynthesis. Nothing is lost.
 *
 * Behavior matches `useTts`:
 *   - Watches `items` for new ids (tracked in a ref so re-renders don't replay)
 *   - Queues OpenAI fetches in arrival order; plays them one after the next
 *   - On `paused`: any in-flight or playing audio pauses; queue preserved
 *   - On `enabled=false` or unmount: cancel queue + stop playback
 */
export function useOpenaiTts({
  enabled,
  paused,
  language,
  items,
  rate = 1.05,
}: UseTtsOptions): void {
  const playedIdsRef = useRef<Set<string>>(new Set());
  const fallbackIdsRef = useRef<Set<string>>(new Set());
  const [fallbackItems, setFallbackItems] = useState<TtsItem[]>([]);
  const queueRef = useRef<Array<{ id: string; text: string }>>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isProcessingRef = useRef(false);
  const authToken = useAuthToken();

  // useTts consumes whatever ids we marked as fallback. It's gated by the
  // same enabled/paused props so its lifecycle matches. State (not a ref)
  // so each markFallback re-renders and useTts observes the new item.
  useTts({
    enabled,
    paused,
    language,
    items: fallbackItems,
    rate,
  });

  // Stop / cancel state on disable + unmount.
  useEffect(() => {
    if (enabled) return;
    queueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }
  }, [enabled]);
  useEffect(() => {
    return () => {
      queueRef.current = [];
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = "";
        currentAudioRef.current = null;
      }
    };
  }, []);

  // Pause/resume the currently-playing audio.
  useEffect(() => {
    if (!enabled) return;
    const a = currentAudioRef.current;
    if (!a) return;
    if (paused) a.pause();
    else void a.play().catch(() => {});
  }, [paused, enabled]);

  // Watch items for new ones to speak.
  useEffect(() => {
    if (!enabled) return;
    const played = playedIdsRef.current;
    const fallbacks = fallbackIdsRef.current;
    for (const item of items) {
      if (played.has(item.id) || fallbacks.has(item.id)) continue;
      if (!item.text || !item.text.trim()) {
        played.add(item.id);
        continue;
      }
      played.add(item.id);
      queueRef.current.push({ id: item.id, text: item.text });
    }
    void drainQueue();
    // We intentionally don't depend on authToken — token changes shouldn't
    // re-process the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled]);

  const drainQueue = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        if (!enabled) {
          queueRef.current = [];
          return;
        }
        const next = queueRef.current.shift()!;
        const ok = await playOne(next.id, next.text);
        if (!ok) markFallback(next.id, next.text);
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  const playOne = async (id: string, text: string): Promise<boolean> => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        if (res.status === 503) {
          // OPENAI_API_KEY not set — silent fallback, don't spam errors.
        } else {
          console.warn(
            `[openai-tts] /api/tts ${res.status} — falling back to Web Speech for "${text.slice(0, 40)}…"`
          );
        }
        return false;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = rate;
      currentAudioRef.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
          resolve();
        };
        // If paused, wait — the pause/resume effect drives play().
        if (!paused) {
          void audio.play().catch(() => {
            URL.revokeObjectURL(url);
            if (currentAudioRef.current === audio) currentAudioRef.current = null;
            resolve();
          });
        }
      });
      void id;
      return true;
    } catch (e) {
      console.warn(
        `[openai-tts] fetch threw: ${e instanceof Error ? e.message : String(e)} — falling back to Web Speech`
      );
      return false;
    }
  };

  const markFallback = (id: string, text: string) => {
    if (fallbackIdsRef.current.has(id)) return;
    fallbackIdsRef.current.add(id);
    setFallbackItems((prev) => [...prev, { id, text }]);
  };
}
