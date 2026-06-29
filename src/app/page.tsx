import { MarketingNav } from "@/components/landing/marketing-nav";
import { LiveDemo } from "@/components/landing/live-demo";
import { Features } from "@/components/landing/features";
import { TryItFree } from "@/components/landing/try-it-free";
import { UseCases } from "@/components/landing/use-cases";
import { EarlyNote } from "@/components/landing/early-note";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Reveal } from "@/components/landing/reveal";
import { JsonLd } from "@/components/seo/json-ld";

// Hero left-column items center on mobile, left-align from lg up (beside the
// demo) — mirrors the column's own alignment so Reveal doesn't shift layout.
const HERO_ITEM = "w-full flex flex-col items-center lg:items-start";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col">
      <JsonLd />
      <MarketingNav />

      {/* Hero — pitch + CTA beside the live demo on desktop; stacked on mobile */}
      <section className="relative overflow-hidden px-6 pt-10 pb-16 sm:pt-14 sm:pb-24">
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(46,204,113,0.16), rgba(46,204,113,0) 70%)",
          }}
        />

        <div className="mx-auto max-w-6xl grid lg:grid-cols-2 items-center gap-14 lg:gap-10 lg:min-h-[78vh]">
          {/* Left — the pitch */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-6">
            <Reveal delay={0} className={HERO_ITEM} fade={false}>
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-accent)]/30">
                ✦ Real-time khutbah translation
              </span>
            </Reveal>

            <Reveal delay={90} className={HERO_ITEM} fade={false}>
              <h1 className="text-3xl sm:text-5xl font-bold max-w-xl leading-[1.1]">
                Understand every khutbah, as it&apos;s spoken
              </h1>
            </Reveal>

            <Reveal delay={180} className={HERO_ITEM} fade={false}>
              <p className="max-w-md text-[var(--color-text-2)] text-base sm:text-lg leading-relaxed">
                Tarjuman turns Arabic speech into on-screen English the moment
                it&apos;s said — preserving Islamic terms — and writes your
                summary when the lecture ends.
              </p>
            </Reveal>

            <Reveal delay={270} className={HERO_ITEM} fade={false}>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <TryItFree />
                <a
                  href="#features"
                  className="px-5 py-3 rounded-xl font-semibold text-[var(--color-text-2)] border border-[var(--color-border-light)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-1)] transition-colors"
                >
                  See how it works
                </a>
              </div>
            </Reveal>

            <Reveal delay={350} className={HERO_ITEM} fade={false}>
              <p className="text-xs text-[var(--color-text-4)]">
                Free to start · Arabic → English &amp; 30+ languages · No card
                required
              </p>
            </Reveal>
          </div>

          {/* Right — the live demo */}
          <Reveal
            delay={220}
            className="w-full flex justify-center lg:justify-end"
          >
            <LiveDemo />
          </Reveal>
        </div>
      </section>

      {/* Sections self-animate (heading first, then items stagger in) */}
      <Features />
      <UseCases />
      <EarlyNote />
      <Faq />
      <Footer />
    </main>
  );
}
