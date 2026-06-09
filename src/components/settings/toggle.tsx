"use client";

import { COLORS } from "@/lib/constants";

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}

/**
 * Settings switch row. A single tappable row with a label/description on the
 * left and an iOS-style switch on the right. Matches the app's dark surface
 * styling and accent color.
 */
export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-black/10 transition-colors"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold" style={{ color: COLORS.w }}>
          {label}
        </span>
        {description && (
          <span className="block text-[12px] mt-0.5 leading-snug" style={{ color: COLORS.t3 }}>
            {description}
          </span>
        )}
      </span>
      <span
        className="relative shrink-0 rounded-full transition-colors"
        style={{
          width: 44,
          height: 24,
          background: checked ? COLORS.accent : COLORS.surfaceLight,
          border: `1px solid ${checked ? COLORS.accent : COLORS.borderLight}`,
        }}
      >
        <span
          className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all"
          style={{
            width: 18,
            height: 18,
            background: checked ? "#0A0F1C" : COLORS.t3,
            left: checked ? 23 : 3,
          }}
        />
      </span>
    </button>
  );
}
