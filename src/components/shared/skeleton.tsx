import type { CSSProperties } from "react";
import { COLORS } from "@/lib/constants";

/**
 * Loading-skeleton primitive. A muted, gently-pulsing block used to outline a
 * page's real layout while its data resolves — so content fades into place
 * instead of a bare spinner popping. Restrained on purpose (a soft opacity
 * pulse, not a flashy gradient sweep): "slow is smooth."
 */
export function Skeleton({
  className = "",
  style,
  rounded = 10,
}: {
  className?: string;
  style?: CSSProperties;
  rounded?: number;
}) {
  return (
    <div
      aria-hidden
      className={`animate-pulse ${className}`}
      style={{ background: COLORS.surfaceLight, borderRadius: rounded, ...style }}
    />
  );
}

/** A header row (back-button square + title/subtitle bars) used by detail pages. */
export function HeaderSkeleton() {
  return (
    <div
      className="px-5 py-4 flex items-center gap-3"
      style={{ borderBottom: `1px solid ${COLORS.border}` }}
    >
      <Skeleton style={{ width: 36, height: 36 }} rounded={8} />
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton style={{ width: "55%", height: 14 }} />
        <Skeleton style={{ width: 60, height: 10 }} />
      </div>
    </div>
  );
}

/** A stacked source-card + translation-card pair, matching a transcript segment. */
export function SegmentSkeleton({ widths = ["90%", "70%"] }: { widths?: [string, string] }) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <Skeleton style={{ width: widths[0], height: 52 }} rounded={16} />
      <Skeleton style={{ width: widths[1], height: 44 }} rounded={16} />
    </div>
  );
}
