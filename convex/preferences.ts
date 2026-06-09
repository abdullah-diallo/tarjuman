import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

/**
 * Per-user preferences (default languages + audio/voice toggles).
 *
 * Backed by Convex rather than localStorage so a user's settings follow them
 * across devices and into the planned native apps. One row per user, created
 * lazily on first write (upsert). All fields optional — readers fall back to
 * app defaults when a field is unset.
 */

/** Current user's preferences row, or null if signed-out / never set. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!prefs) return null;
    return {
      defaultSourceLanguage: prefs.defaultSourceLanguage,
      defaultTargetLanguage: prefs.defaultTargetLanguage,
      ttsEnabled: prefs.ttsEnabled,
      mainSpeakerOnly: prefs.mainSpeakerOnly,
    };
  },
});

/**
 * Upsert preferences for the signed-in user. Only the fields provided are
 * written, so callers can patch a single toggle without clobbering the rest.
 */
export const update = mutation({
  args: {
    defaultSourceLanguage: v.optional(v.string()),
    defaultTargetLanguage: v.optional(v.string()),
    ttsEnabled: v.optional(v.boolean()),
    mainSpeakerOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Drop undefined keys so a partial update never overwrites stored values
    // with undefined.
    const patch = Object.fromEntries(
      Object.entries(args).filter(([, val]) => val !== undefined)
    );

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("userPreferences", { userId, ...patch });
    }
  },
});
