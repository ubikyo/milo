// Follow, client side: what opens from an address, and what
// shows when a followed item changes.
//
// The application has no router: a single screen, drawers, and the state
// in React. The address is therefore not used to navigate — it serves to be able to
// designate an item from outside, from an e-mail or a message. It is
// kept up to date so that the reloaded page finds what was open.

import type { Id, LinkTargetKind } from "@milo/shared";
import { LEGACY_QUERY_PARAMS, QUERY_PARAMS, itemLink } from "@milo/shared";

export interface Target {
  /** For "access", the identifier is the board's. */
  kind: LinkTargetKind;
  id: Id;
}

/** The name of each parameter, and the item it designates — old names included. */
const NAMES = Object.fromEntries(
  [QUERY_PARAMS, LEGACY_QUERY_PARAMS].flatMap((params) =>
    Object.entries(params).map(([kind, name]) => [name, kind as LinkTargetKind]),
  ),
);

/** What the current address designates, if any. */
export const addressTarget = (): Target | null => {
  const searchParams = new URLSearchParams(window.location.search);

  for (const [name, kind] of Object.entries(NAMES)) {
    const raw = searchParams.get(name);
    if (raw === null) continue;
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) return { kind, id };
  }
  return null;
};

/**
 * Writes the open item into the address, or removes it. `replaceState` and not
 * `pushState`: opening a drawer is not a navigation, and the browser's
 * "back" arrow must not start undoing openings of
 * records.
 */
export const noteInAddress = (target: Target | null): void => {
  const address = target
    ? `${window.location.pathname}${itemLink(target.kind, target.id)}`
    : window.location.pathname;

  if (address !== window.location.pathname + window.location.search) {
    window.history.replaceState(null, "", address);
  }
};
