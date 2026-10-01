// L'ordre des onglets fixes : les statuts du mode Support, les familles du
// mode Assets. Ces onglets ne sont pas des tableaux qu'on ajoute — leur liste
// est écrite dans le code —, mais leur ordre se range comme celui des
// tableaux, par glisser-déposer, et vaut pour tout le monde.

export const TAB_ORDER_MODES = ["support", "assets"] as const;

export type TabOrderMode = (typeof TAB_ORDER_MODES)[number];

/**
 * L'ordre rangé de chaque mode : les valeurs des onglets, dans l'ordre voulu.
 * Vide tant que personne ne l'a changé.
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
