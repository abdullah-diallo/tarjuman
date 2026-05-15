"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/shared/icon";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/**
 * Compact circular avatar in the top-right of the idle record screen.
 * Tap → opens a popover with email + Sign out.
 *
 * Kept minimal on purpose: full account settings (change password, delete
 * account, etc.) can come later. For MVP, just identity + sign-out.
 */
export function AccountMenu() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Two-step delete-account flow uses sequential confirm modals.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [finalDeleteOpen, setFinalDeleteOpen] = useState(false);
  const [deleteErrorOpen, setDeleteErrorOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  // OAuth profile images (Google, etc.) sometimes fail to load — expired
  // tokens, hotlink blocks, or offline. Without this, the browser renders
  // its default broken-image landscape icon, which looks awful in a 32px
  // circular avatar. On error we fall back to the initial.
  const [imageBroken, setImageBroken] = useState(false);

  if (me === undefined) {
    // Loading — don't render so the header doesn't visibly shift.
    return null;
  }
  if (me === null) {
    // Defensive: layout should redirect unauthed users before we ever render
    // here. If we somehow get null, no-op.
    return null;
  }

  const initial = (me.name?.[0] ?? me.email?.[0] ?? "?").toUpperCase();

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    router.replace("/login");
  };

  const startDeleteFlow = () => {
    setOpen(false);
    setConfirmDeleteOpen(true);
  };

  // Step 1 → step 2: user confirmed the first dialog, escalate.
  const escalateDeleteFlow = () => {
    setConfirmDeleteOpen(false);
    setFinalDeleteOpen(true);
  };

  // Step 2 → actually delete.
  const performDelete = async () => {
    setFinalDeleteOpen(false);
    setDeleting(true);
    try {
      await deleteAccount({});
      await signOut();
      router.replace("/login");
    } catch (e) {
      setDeleting(false);
      setDeleteErrorMessage(
        `Couldn't delete your account: ${
          e instanceof Error ? e.message : String(e)
        }. Please try again or contact support.`
      );
      setDeleteErrorOpen(true);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold cursor-pointer transition-transform active:scale-95 overflow-hidden"
        style={{
          background:
            me.image && !imageBroken ? "transparent" : COLORS.accentSoft,
          border: `1px solid ${COLORS.accent}40`,
          color: COLORS.accent,
        }}
      >
        {me.image && !imageBroken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.image}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImageBroken(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          initial
        )}
      </button>

      {open && (
        <>
          {/* Click-outside backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-10 z-50 w-56 rounded-xl overflow-hidden"
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.borderLight}`,
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="px-4 py-3"
              style={{ borderBottom: `1px solid ${COLORS.border}` }}
            >
              {me.name && (
                <div
                  className="text-[13px] font-semibold truncate"
                  style={{ color: COLORS.w }}
                >
                  {me.name}
                </div>
              )}
              <div
                className="text-[12px] truncate"
                style={{ color: COLORS.t3 }}
              >
                {me.email ?? "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full px-4 py-3 flex items-center gap-2 text-left text-[13px] font-semibold cursor-pointer hover:bg-black/20 transition-colors"
              style={{ color: COLORS.t2 }}
            >
              <Icon name="close" size={14} color={COLORS.t3} />
              Sign out
            </button>
            <div
              style={{ borderTop: `1px solid ${COLORS.border}` }}
            />
            <button
              type="button"
              onClick={startDeleteFlow}
              disabled={deleting}
              className="w-full px-4 py-3 flex items-center gap-2 text-left text-[13px] font-semibold cursor-pointer hover:bg-black/20 transition-colors disabled:opacity-50"
              style={{ color: COLORS.red }}
            >
              <Icon name="trash" size={14} color={COLORS.red} />
              {deleting ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete your account?"
        message="All your sessions, transcripts, and summaries will be permanently removed. This cannot be undone."
        confirmLabel="Continue"
        destructive
        onConfirm={escalateDeleteFlow}
      />
      <ConfirmDialog
        open={finalDeleteOpen}
        onOpenChange={setFinalDeleteOpen}
        title="Last chance"
        message="Tap Delete to permanently erase your account and everything in it. There is no undo."
        confirmLabel="Delete forever"
        destructive
        onConfirm={performDelete}
      />
      <ConfirmDialog
        open={deleteErrorOpen}
        onOpenChange={setDeleteErrorOpen}
        title="Couldn't delete account"
        message={deleteErrorMessage}
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={() => setDeleteErrorOpen(false)}
      />
    </div>
  );
}
