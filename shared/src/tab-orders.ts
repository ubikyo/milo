// L'ordre des vues dans le sélecteur du bas, propre à chaque compte. Celui
// des tableaux d'une vue se range avec eux (routes/boards.ts).

export const TAB_ORDER_MODES = ["views"] as const;

export type TabOrderMode = (typeof TAB_ORDER_MODES)[number];

/**
 * L'ordre rangé de chaque rangée : les valeurs des onglets, dans l'ordre
 * voulu. Vide tant que le compte ne l'a pas changé.
 */
export type TabOrders = Record<TabOrderMode, string[]>;

export const isTabOrderMode = (value: unknown): value is TabOrderMode =>
  TAB_ORDER_MODES.some((m) => m === value);

export const emptyTabOrders = (): TabOrders =>
  Object.fromEntries(TAB_ORDER_MODES.map((m) => [m, []])) as unknown as TabOrders;

/**
 * Les onglets dans l'ordre rangé. Ceux que l'ordre ne cite pas — un onglet
 * ajouté depuis — gardent leur rang par défaut, à la suite des autres ; ceux
 * qu'il cite et qui n'existent plus sont ignorés.
 */
export const ordonnerOnglets = <T extends { value: string }>(onglets: T[], ordre: string[]): T[] => {
  const rang = new Map(ordre.map((v, i) => [v, i]));
  return [...onglets].sort(
    (a, b) => (rang.get(a.value) ?? Infinity) - (rang.get(b.value) ?? Infinity),
  );
};
