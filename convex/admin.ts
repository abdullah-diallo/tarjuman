import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Operator-only support helpers. Run these from the Convex dashboard's
 * "Functions" runner — they are NOT part of the public API.
 *
 * ⚠️ Every function here is an `internalQuery` on purpose. They look up and
 * return *any* user's data, bypassing the per-user ownership checks that the
 * public `sessions`/`users` functions enforce. If these were registered as
 * public `query`s, anyone could call `api.admin.getUserByEmail` from the
 * browser console and enumerate every account + transcript. `internalQuery`
 * keeps them off the public client API while still letting an operator run
 * them from the dashboard (which has admin access).
 *
 * Support flow these cover:
 *   1. getUserByEmail   — "a user emailed support, find their account"
 *   2. getUserSessions  — "list what they've recorded"
 *   3. getSessionDetail — "inspect one session's transcript / summary"
 *
 * Read-only by design. A write action (e.g. resend-summary) is a separate,
 * deliberately-guarded mutation — add it when a real support task needs it.
 */

// A single user has a bounded-but-unknown number of sessions. Cap the count
// scan so this never degrades into a full-table read if some account somehow
// accumulates a huge history. Counts above the cap report as "N+".
const SESSION_COUNT_CAP = 200;

// Upper bound on rows getUserSessions will return in one call, so the helper
// always returns a bounded collection even if a large limit is passed.
const MAX_SESSION_PAGE = 200;
const DEFAULT_SESSION_PAGE = 50;

function summarizeSession(s: Doc<"sessions">) {
  return {
    _id: s._id,
    title: s.title ?? null,
    status: s.status,
    sourceLanguage: s.sourceLanguage,
    targetLanguage: s.targetLanguage,
    durationSeconds: s.duration,
    segmentCount: s.segments.length,
    hasSummary: Boolean(s.summary),
    summaryLanguage: s.summaryLanguage ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/**
 * Find account(s) by email and return a support-friendly profile for each:
 * identity, which sign-in providers are linked (password vs. Google — the
 * usual "why can't I reset my password" question), and a bounded session
 * count.
 *
 * Returns an array because the auth `users` table does not enforce email
 * uniqueness; in practice you'll almost always get 0 or 1. The lookup is
 * case-insensitive-tolerant: it checks the email as typed and its lowercase
 * form (auth stores most emails lowercase).
 */
export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = email.trim();
    const variants = Array.from(
      new Set([normalized, normalized.toLowerCase()].filter(Boolean))
    );

    const seen = new Set<Id<"users">>();
    const users: Doc<"users">[] = [];
    for (const value of variants) {
      const matches = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", value))
        .take(10);
      for (const u of matches) {
        if (!seen.has(u._id)) {
          seen.add(u._id);
          users.push(u);
        }
      }
    }

    const results = [];
    for (const user of users) {
      const accounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
        .take(20);
      const providers = accounts.map((a) => a.provider);

      const sessionSample = await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(SESSION_COUNT_CAP + 1);
      const capped = sessionSample.length > SESSION_COUNT_CAP;

      results.push({
        _id: user._id,
        email: user.email ?? null,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: user.emailVerificationTime != null,
        createdAt: user._creationTime,
        providers,
        hasPassword: providers.includes("password"),
        hasGoogle: providers.includes("google"),
        sessionCount: capped ? SESSION_COUNT_CAP : sessionSample.length,
        sessionCountCapped: capped,
      });
    }

    return results;
  },
});

/**
 * List a user's sessions, most recent first, as lightweight summaries (no
 * transcript bodies — use getSessionDetail for that). Pass the `_id` from
 * getUserByEmail. `limit` defaults to 50 and is clamped to 200.
 */
export const getUserSessions = internalQuery({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const take = Math.min(
      Math.max(1, Math.floor(limit ?? DEFAULT_SESSION_PAGE)),
      MAX_SESSION_PAGE
    );
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(take);
    return sessions.map(summarizeSession);
  },
});

/**
 * Full detail for a single session — transcript segments, summary, timing.
 * For content-support questions ("my summary looks wrong"). Pass a session
 * `_id` from getUserSessions. Returns null if the id doesn't exist.
 */
export const getSessionDetail = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    return {
      ...summarizeSession(session),
      userId: session.userId ?? null,
      summary: session.summary ?? null,
      segments: session.segments,
    };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Test-data cleanup
//
// Automated test / deploy-verification runs create sessions titled
// "<prefix>-<unix-ms>" (e.g. "lt-verify-1780498...", "nav-test-...",
// "lens-...", "fluid-..."). Real user sessions never look like this — their
// title is derived from the transcript. These helpers find and (on explicit
// confirmation) delete that junk. Run from the dashboard Functions runner.
// ───────────────────────────────────────────────────────────────────────────

const TEST_TITLE_PREFIXES = ["lt-verify", "nav-test", "lens", "fluid"];

/**
 * True only for "<prefix>-<digits…>" titles — i.e. the programmatic test
 * pattern. Requiring the trailing digit run means a genuine session that
 * merely starts with one of these words can never match.
 */
function isTestTitle(
  title: string | undefined,
  prefixes: readonly string[]
): boolean {
  if (!title) return false;
  for (const p of prefixes) {
    const pre = `${p}-`;
    if (title.startsWith(pre) && /^\d/.test(title.slice(pre.length))) {
      return true;
    }
  }
  return false;
}

/**
 * DRY RUN — list the test sessions that {@link deleteTestSessions} would
 * remove, so you can eyeball them before deleting. Pass `prefixes` to override
 * the defaults. Read-only.
 */
export const listTestSessions = internalQuery({
  args: { prefixes: v.optional(v.array(v.string())) },
  handler: async (ctx, { prefixes }) => {
    const pres = prefixes?.length ? prefixes : TEST_TITLE_PREFIXES;
    const all = await ctx.db.query("sessions").collect();
    const matched = all.filter((s) => isTestTitle(s.title, pres));
    return {
      prefixes: pres,
      totalSessions: all.length,
      matched: matched.length,
      sample: matched.slice(0, 100).map((s) => ({
        _id: s._id,
        title: s.title ?? null,
        status: s.status,
        segmentCount: s.segments.length,
        createdAt: s.createdAt,
      })),
    };
  },
});

/**
 * Delete the test sessions matched by their `prefix-<digits>` title.
 *
 * SAFETY: defaults to a DRY RUN — it only reports what it WOULD delete. Pass
 * `confirm: true` to actually delete. Never touches a session whose title
 * isn't a `prefix-<digits>` test title.
 */
export const deleteTestSessions = internalMutation({
  args: {
    prefixes: v.optional(v.array(v.string())),
    confirm: v.optional(v.boolean()),
  },
  handler: async (ctx, { prefixes, confirm }) => {
    const pres = prefixes?.length ? prefixes : TEST_TITLE_PREFIXES;
    const all = await ctx.db.query("sessions").collect();
    const matched = all.filter((s) => isTestTitle(s.title, pres));
    if (!confirm) {
      return {
        dryRun: true as const,
        wouldDelete: matched.length,
        sampleTitles: matched.slice(0, 100).map((s) => s.title ?? null),
      };
    }
    for (const s of matched) await ctx.db.delete(s._id);
    return { dryRun: false as const, deleted: matched.length };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Test-USER cleanup
//
// Automated test / deploy-verification runs create fake accounts with emails
// like "lens-<ms>@example.com", "fluid-…", "nav-test-…", "lt-verify-…". Real
// users never use the reserved @example.com domain, so these are safe to
// remove. Deleting a user also cascades their owned rows (sessions, prefs, and
// auth records) so nothing is left orphaned. Run from the dashboard.
// ───────────────────────────────────────────────────────────────────────────

const TEST_USER_PREFIXES = ["lens", "fluid", "nav-test", "lt-verify"];

/** True for "<prefix>-<digits>@example.com" — the automated-test account shape. */
function isTestEmail(
  email: string | undefined,
  prefixes: readonly string[]
): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (!lower.endsWith("@example.com")) return false;
  return prefixes.some(
    (p) => lower.startsWith(`${p}-`) && /^\d/.test(lower.slice(p.length + 1))
  );
}

/** DRY RUN — list the test users {@link deleteTestUsers} would remove. Read-only. */
export const listTestUsers = internalQuery({
  args: { prefixes: v.optional(v.array(v.string())) },
  handler: async (ctx, { prefixes }) => {
    const pres = prefixes?.length ? prefixes : TEST_USER_PREFIXES;
    const all = await ctx.db.query("users").collect();
    const matched = all.filter((u) => isTestEmail(u.email, pres));
    return {
      prefixes: pres,
      totalUsers: all.length,
      matched: matched.length,
      sampleEmails: matched.slice(0, 100).map((u) => u.email ?? null),
    };
  },
});

/**
 * Delete the test users (and cascade their sessions, preferences, auth accounts,
 * auth sessions, and refresh tokens).
 *
 * SAFETY: defaults to a DRY RUN — pass `confirm: true` to actually delete. Only
 * ever matches "<prefix>-<digits>@example.com", so it cannot touch a real
 * account (which never uses the @example.com domain).
 */
export const deleteTestUsers = internalMutation({
  args: {
    prefixes: v.optional(v.array(v.string())),
    confirm: v.optional(v.boolean()),
  },
  handler: async (ctx, { prefixes, confirm }) => {
    const pres = prefixes?.length ? prefixes : TEST_USER_PREFIXES;
    const testUsers = (await ctx.db.query("users").collect()).filter((u) =>
      isTestEmail(u.email, pres)
    );

    if (!confirm) {
      return {
        dryRun: true as const,
        wouldDelete: testUsers.length,
        sampleEmails: testUsers.slice(0, 100).map((u) => u.email ?? null),
      };
    }

    const uidSet = new Set(testUsers.map((u) => u._id));
    let sessions = 0;
    let prefs = 0;
    let authAccounts = 0;
    let authSessions = 0;
    let refreshTokens = 0;

    // Per-user indexed deletes for the rows we own (sessions, prefs, accounts).
    for (const u of testUsers) {
      for (const s of await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect()) {
        await ctx.db.delete(s._id);
        sessions++;
      }
      for (const p of await ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect()) {
        await ctx.db.delete(p._id);
        prefs++;
      }
      for (const a of await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", u._id))
        .collect()) {
        await ctx.db.delete(a._id);
        authAccounts++;
      }
    }

    // Auth sessions + their refresh tokens — scanned (no assumed index) since
    // these tables are small and this is an occasional operator cleanup.
    const killedAuthSessionIds = new Set<Id<"authSessions">>();
    for (const as of await ctx.db.query("authSessions").collect()) {
      if (uidSet.has(as.userId)) {
        killedAuthSessionIds.add(as._id);
        await ctx.db.delete(as._id);
        authSessions++;
      }
    }
    for (const rt of await ctx.db.query("authRefreshTokens").collect()) {
      if (killedAuthSessionIds.has(rt.sessionId)) {
        await ctx.db.delete(rt._id);
        refreshTokens++;
      }
    }

    for (const u of testUsers) await ctx.db.delete(u._id);

    return {
      dryRun: false as const,
      deletedUsers: testUsers.length,
      cascade: { sessions, prefs, authAccounts, authSessions, refreshTokens },
    };
  },
});

// ─── Orphaned auth-row cleanup ───────────────────────────────────────────
// When a `users` row is deleted directly (e.g. from the Convex dashboard,
// bypassing users.ts:deleteAccount), its `authAccounts` / `authSessions`
// links survive and dangle. A dangling Google `authAccounts` row is FATAL:
// the next OAuth sign-in finds it, tries to UPDATE the now-missing user, and
// @convex-dev/auth throws "Update on nonexistent document ID" — silently
// bouncing the user back to the sign-in screen on every attempt. This sweeps
// any auth row whose `userId` no longer resolves to a user document.
// Dry-run by default; pass { confirm: true } to actually delete.
export const cleanupOrphanedAuth = internalMutation({
  args: { confirm: v.optional(v.boolean()) },
  handler: async (ctx, { confirm }) => {
    const orphanAccounts = [];
    for (const a of await ctx.db.query("authAccounts").collect()) {
      if ((await ctx.db.get(a.userId)) === null) orphanAccounts.push(a);
    }
    const orphanSessions = [];
    for (const s of await ctx.db.query("authSessions").collect()) {
      if ((await ctx.db.get(s.userId)) === null) orphanSessions.push(s);
    }

    if (!confirm) {
      return {
        dryRun: true as const,
        orphanedAccounts: orphanAccounts.length,
        orphanedSessions: orphanSessions.length,
        accountProviders: orphanAccounts.map((a) => a.provider),
      };
    }

    let refreshTokens = 0;
    const killedSessionIds = new Set<Id<"authSessions">>();
    for (const s of orphanSessions) {
      killedSessionIds.add(s._id);
      await ctx.db.delete(s._id);
    }
    for (const rt of await ctx.db.query("authRefreshTokens").collect()) {
      if (killedSessionIds.has(rt.sessionId)) {
        await ctx.db.delete(rt._id);
        refreshTokens++;
      }
    }
    for (const a of orphanAccounts) await ctx.db.delete(a._id);

    return {
      dryRun: false as const,
      deletedAccounts: orphanAccounts.length,
      deletedSessions: orphanSessions.length,
      deletedRefreshTokens: refreshTokens,
    };
  },
});
