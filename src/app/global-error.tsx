"use client";

import { useEffect } from "react";
import { Sentry } from "@/lib/sentry";

/**
 * Root-level error boundary. App Router's per-segment error.tsx (e.g.
 * src/app/(app)/error.tsx) only catches errors INSIDE that segment — a crash in
 * the ROOT layout itself escapes them and otherwise renders Next's default,
 * unstyled white error page AND is never reported to Sentry.
 *
 * global-error.tsx replaces the entire document when that happens, so it must
 * render its own <html>/<body> and can't rely on the root layout's providers or
 * fonts — hence the self-contained inline styles (system font, dark theme).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global (root) error boundary caught:", error);
    // No-ops when NEXT_PUBLIC_SENTRY_DSN isn't configured.
    Sentry.captureException(error, {
      tags: { boundary: "global-root" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "0 32px",
          textAlign: "center",
          background: "#0A0F1C",
          color: "#F5F7FA",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            display: "grid",
            placeItems: "center",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            fontSize: 28,
            lineHeight: 1,
          }}
          aria-hidden
        >
          ⚠️
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "#A9B2C3" }}>
            Tarjuman hit an unexpected error. Reloading usually fixes it.
          </div>
          {error.digest && (
            <div
              style={{
                fontSize: 11,
                marginTop: 8,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#5C6678",
              }}
            >
              ref: {error.digest}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 8,
            padding: "12px 20px",
            borderRadius: 12,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            background: "#2ECC71",
            color: "#0A0F1C",
            boxShadow: "0 0 24px rgba(46,204,113,0.35)",
          }}
        >
          Reload Tarjuman
        </button>
      </body>
    </html>
  );
}
