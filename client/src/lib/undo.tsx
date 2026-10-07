import { Anchor, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";

// Undoing a deletion — a widget, a section, a board, a view — with ⌘Z (Ctrl+Z
// elsewhere than on a Mac), or the "Annuler" of the notification that
// announces it. The server returns a token with each of these deletions, and
// puts back what it carried away when it is handed back (server, lib/undo.ts).
//
// The deletions stack up: each ⌘Z undoes the last one still standing. In a
// text field, ⌘Z stays the field's own.

interface Deletion {
  token: string;
  /** Re-reads what came back, without waiting for the server's broadcast. */
  reload?: () => unknown;
}

/** Beyond that, the oldest deletions are no longer undone. */
const MAX_DELETIONS = 20;

const deletions: Deletion[] = [];

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The shortcut, as the person's keyboard writes it. */
export const UNDO_SHORTCUT = isMac ? "⌘Z" : "Ctrl+Z";

/** The token a deletion route returned, if it returned one. */
const tokenOf = (result: unknown): string | null => {
  const token = (result as { undo?: unknown } | null)?.undo;
  return typeof token === "string" ? token : null;
};

/** Undoes the last deletion still standing. False when there is none. */
export const undoLastDeletion = async (): Promise<boolean> => {
  const last = deletions.pop();
  if (!last) return false;
  notifications.hide(last.token);
  try {
    await api.undoDeletion(last.token);
    notifications.show({ color: "teal", message: "Suppression annulée" });
    await last.reload?.();
  } catch (e) {
    notifyError(errorMessage(e));
  }
  return true;
};

/**
 * Keeps a deletion the server made undoable, and announces it — "label", with
 * its "Annuler" — unless the gesture already says so itself ("silent": a cut).
 */
export const rememberDeletion = (
  result: unknown,
  label: string,
  { reload, silent = false }: { reload?: () => unknown; silent?: boolean } = {},
): void => {
  const token = tokenOf(result);
  if (!token) return;
  deletions.push({ token, reload });
  if (deletions.length > MAX_DELETIONS) deletions.shift();
  if (silent) return;
  notifications.show({
    id: token,
    color: "gray",
    message: (
      <Group gap="xs" wrap="nowrap" justify="space-between">
        <Text size="sm">{label}</Text>
        <Anchor
          size="sm"
          fw={500}
          component="button"
          onClick={() => {
            // This deletion, wherever it is in the stack.
            const rank = deletions.findIndex((d) => d.token === token);
            if (rank < 0) return;
            const [deletion] = deletions.splice(rank, 1);
            deletions.push(deletion!);
            void undoLastDeletion();
          }}
        >
          Annuler ({UNDO_SHORTCUT})
        </Anchor>
      </Group>
    ),
  });
};

/** ⌘Z — Ctrl+Z elsewhere — anywhere in the page but in a text field. */
export function useUndoShortcut() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // "key" rather than "code": on an AZERTY keyboard, the Z is where
      // QWERTY puts the W.
      if (event.key.toLowerCase() !== "z" || event.shiftKey || event.altKey) return;
      if (!(isMac ? event.metaKey : event.ctrlKey)) return;
      const el = document.activeElement as HTMLElement | null;
      const textInput =
        el &&
        (el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          (el.tagName === "INPUT" && !(el as HTMLInputElement).readOnly));
      if (textInput || deletions.length === 0) return;
      event.preventDefault();
      void undoLastDeletion();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
