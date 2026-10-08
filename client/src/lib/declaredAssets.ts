import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import type { DeclaredAsset, DeclaredAssetKind, Id } from "@milo/shared";

// The declared assets of the open board, kind by kind (shared,
// declared-assets.ts): unlike the other data, the page does not read them —
// each widget of the kind reads its own, and re-reads when the server says
// they changed (App.tsx).

/** The event a kind's widgets re-read on. */
const eventOf = (kind: DeclaredAssetKind): string => `milo:declared-assets-${kind}`;

/** The server signalled a change of this kind's assets: its widgets re-read. */
export const announceDeclaredAssets = (kind: DeclaredAssetKind): void => {
  window.dispatchEvent(new Event(eventOf(kind)));
};

/**
 * The board's assets of a kind: "null" while they are read. "reload" reads
 * them again — after a write from this page, without waiting for the server's
 * signal.
 */
export function useDeclaredAssets(kind: DeclaredAssetKind, boardId: Id | undefined) {
  const [assets, setAssets] = useState<DeclaredAsset[] | null>(null);

  const reload = useCallback(async () => {
    if (boardId === undefined) return;
    try {
      setAssets(await api.getDeclaredAssets(kind, boardId));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [kind, boardId]);

  useEffect(() => {
    void reload();
    const listener = () => void reload();
    window.addEventListener(eventOf(kind), listener);
    return () => window.removeEventListener(eventOf(kind), listener);
  }, [kind, reload]);

  return { assets, reload };
}
