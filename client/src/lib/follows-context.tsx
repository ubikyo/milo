import { createContext, useContext } from "react";
import type { FollowKind, Follows, Id } from "@milo/shared";

// What the person follows, and how to follow or stop, for the widgets the
// application does not hand them to as props — an order's list: the
// application holds the list (App.tsx), they read it here.

export interface FollowsValue {
  follows: Follows;
  toggle: (kind: FollowKind, id: Id) => void;
}

export const FollowsContext = createContext<FollowsValue | null>(null);

/** What the person follows; null outside the application's frame. */
export const useFollows = (): FollowsValue | null => useContext(FollowsContext);
