import { describe, it, expect } from "vitest";
import { isOffLanguageScript } from "./script";

// The off-language script gate must FAIL-OPEN: it may only flag text that is
// genuinely off-language (mostly non-source script). Valid source-language
// speech — including segments dominated by numbers (Hijri years, ayah/hadith
// numbers, counts) that smart_format renders as digits — must never be flagged,
// because a flag means the segment is dropped from the live + saved transcript.

describe("isOffLanguageScript — fail-open on valid Arabic", () => {
  it("keeps Arabic text containing a Western-digit number (Hijri year)", () => {
    // "سنة 1445" used to compute 3/7 = 0.43 < 0.5 and was wrongly dropped.
    expect(isOffLanguageScript("سنة 1445", "ar")).toBe(false);
    expect(isOffLanguageScript("عام 1445", "ar")).toBe(false);
    expect(isOffLanguageScript("رقم 1445", "ar")).toBe(false);
  });

  it("keeps Arabic text with Arabic-Indic digits", () => {
    expect(isOffLanguageScript("سنة ١٤٤٥", "ar")).toBe(false);
  });

  it("keeps normal Arabic speech", () => {
    expect(isOffLanguageScript("الحمد لله رب العالمين", "ar")).toBe(false);
  });

  it("keeps two-word dhikr", () => {
    expect(isOffLanguageScript("الله أكبر", "ar")).toBe(false);
    expect(isOffLanguageScript("سبحان الله", "ar")).toBe(false);
  });
});

describe("isOffLanguageScript — still flags genuine off-language bleed", () => {
  it("flags English transcribed in an Arabic session", () => {
    expect(isOffLanguageScript("the year was a good one", "ar")).toBe(true);
  });

  it("flags an English phrase even with a trailing number", () => {
    expect(isOffLanguageScript("the year was 2024", "ar")).toBe(true);
  });
});

describe("isOffLanguageScript — non-RTL sources are never gated", () => {
  it("returns false for English source regardless of content", () => {
    expect(isOffLanguageScript("مرحبا", "en")).toBe(false);
    expect(isOffLanguageScript("hello world", "en")).toBe(false);
  });

  it("returns false for empty/letterless text (caller handles those)", () => {
    expect(isOffLanguageScript("12345", "ar")).toBe(false);
    expect(isOffLanguageScript("   ", "ar")).toBe(false);
  });
});
