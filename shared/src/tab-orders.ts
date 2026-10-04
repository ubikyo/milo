// The order of the views in the bottom selector, specific to each account.
// That of a view's boards is stored with them (routes/boards.ts).

export const TAB_ORDER_MODES = ["views"] as const;

export type TabOrderMode = (typeof TAB_ORDER_MODES)[number];

/**
 * The stored order of each row: the tab values, in the
 * wanted order. Empty until the account has changed it.
 */
export type TabOrders = Record<TabOrderMode, string[]>;

export const isTabOrderMode = (value: unknown): value is TabOrderMode =>
  TAB_ORDER_MODES.some((m) => m === value);

export const emptyTabOrders = (): TabOrders =>
  Object.fromEntries(TAB_ORDER_MODES.map((m) => [m, []])) as unknown as TabOrders;

/**
 * The tabs in the stored order. Those the order does not mention — a tab
 * added since — keep their default rank, after the others; those
 * it mentions that no longer exist are ignored.
 */
export const orderTabs = <T extends { value: string }>(tabs: T[], order: string[]): T[] => {
  const rank = new Map(order.map((v, i) => [v, i]));
  return [...tabs].sort(
    (a, b) => (rank.get(a.value) ?? Infinity) - (rank.get(b.value) ?? Infinity),
  );
};
