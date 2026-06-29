"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { SITE_NAME, SITE_NAME_AR } from "@/lib/site";

// Same code-split pattern as the hero CTA — the auth popup (AuthForm + Convex
// auth client + Radix Dialog) only loads when a visitor signals intent to sign
// in, keeping the landing's initial JS small.
const AuthModal = dynamic(
  () => import("@/components/auth/auth-modal").then((m) => m.AuthModal),
  { ssr: false }
);

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#faq", label: "FAQ" },
];

/**
 * Sticky marketing top-nav for the landing page. Logo + section anchors +
 * auth-aware actions. Signed-out visitors get "Sign in" (ghost) and "Get
 * started" (primary), both opening the in-place auth popup; signed-in visitors
 * get a single "Open recorder". The bar is transparent at the top of the page
 * and gains a frosted background + border once scrolled, so it never fights the
 * hero on load.
 */
export function MarketingNav() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();

  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp">("signUp");
  // Bumped on each open so the modal remounts with the freshly-chosen mode
  // (AuthModal only reads initialMode on mount). The prior closed instance has
  // already animated out, so this doesn't interrupt any transition.
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mounting AuthModal triggers its dynamic import; preload on hover/focus so
  // the first open is instant.
  const preload = () => setMounted(true);

  const openAuth = (next: "signIn" | "signUp") => {
    if (isAuthenticated) {
      router.push("/record");
      return;
    }
    setMode(next);
    setSeq((s) => s + 1);
    setMounted(true);
    setOpen(true);
  };

  return (
    <header
      className="sticky top-0 z-50 transition-colors duration-300"
      style={{
        background: scrolled ? "rgba(6,11,24,0.72)" : "transparent",
        backdropFilter: scrolled ? "blur(16px) saturate(160%)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(16px) saturate(160%)" : "none",
        borderBottom: `1px solid ${
          scrolled ? "var(--color-border-light)" : "transparent"
        }`,
      }}
    >
      <nav className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="w-9 h-9 rounded-xl bg-[var(--color-accent)] grid place-items-center shadow-[0_0_24px_rgba(46,204,113,0.4)] transition-transform group-hover:scale-105">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0A0F1C"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0014 0" />
              <line x1="12" y1="20" x2="12" y2="24" />
            </svg>
          </span>
          <span className="font-bold text-[var(--color-text-1)]">
            {SITE_NAME}
          </span>
          <span
            className="hidden sm:inline text-[var(--color-text-3)]"
            lang="ar"
            dir="rtl"
          >
            {SITE_NAME_AR}
          </span>
        </Link>

        {/* Section anchors — desktop only */}
        <div className="hidden md:flex items-center gap-7 text-sm text-[var(--color-text-2)]">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hover:text-[var(--color-text-1)] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => router.push("/record")}
              className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-transform active:scale-95 bg-[var(--color-accent)] text-[#0A0F1C] hover:brightness-105 shadow-[0_0_20px_rgba(46,204,113,0.3)]"
            >
              Open recorder
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openAuth("signIn")}
                onPointerEnter={preload}
                onFocus={preload}
                className="hidden sm:inline-block px-3 py-2 rounded-xl text-sm font-semibold text-[var(--color-text-2)] hover:text-[var(--color-text-1)] cursor-pointer transition-colors"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => openAuth("signUp")}
                onPointerEnter={preload}
                onFocus={preload}
                className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-transform active:scale-95 bg-[var(--color-accent)] text-[#0A0F1C] hover:brightness-105 shadow-[0_0_20px_rgba(46,204,113,0.3)]"
              >
                Get started
              </button>
            </>
          )}
        </div>
      </nav>

      {mounted && (
        <AuthModal key={seq} open={open} onOpenChange={setOpen} initialMode={mode} />
      )}
    </header>
  );
}
