import { useEffect, useState } from "react";
import { locationPaths } from "@milo/shared";
import type { DeclaredAssetLocation, Resource, SourceWidget } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import { onResources } from "../../lib/sources";

// The category trees of the list widgets an indicator reads — a declared
// asset's, a product's —: each widget has its own, which its items name by
// id. Read once per widget, again when its data changes — a renamed category
// announces it too.

/** "board\nkey": what tells the widgets apart. */
export const widgetKey = (board: number, key: string) => `${board}\n${key}`;

/**
 * The paths of each widget's tree: widget → node id → "Écran > Moniteur".
 * "read" gives a widget's tree; "resource" announces its change.
 */
export function useTreePaths(
  sources: SourceWidget[],
  read: (source: SourceWidget) => Promise<DeclaredAssetLocation[]>,
  resource: Resource,
): Map<string, Map<string, string>> {
  const [paths, setPaths] = useState<Map<string, Map<string, string>>>(new Map());
  const key = sources.map((s) => widgetKey(s.board_id, s.key)).join("|");
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all(
        sources.map(async (s) => [widgetKey(s.board_id, s.key), locationPaths(await read(s))] as const),
      )
        .then((all) => alive && setPaths(new Map(all)))
        .catch((e) => notifyError(errorMessage(e)));
    void load();
    const stop = onResources([resource], () => void load());
    return () => {
      alive = false;
      stop();
    };
    // "read" is rebuilt at each render: what it depends on is in the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resource]);
  return paths;
}
