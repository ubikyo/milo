// Les droits du compte, société par société, tels que l'interface les lit.
//
// Le serveur les vérifie à chaque requête (server, lib/droits.ts) : ici, il
// s'agit seulement de ne pas proposer ce qui serait refusé — un bouton
// « Ajouter » chez une société où l'on ne fait que lire, une société dont on
// ne voit rien dans la liste déroulante.

import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { MODES, can, widgetRightsPartout } from "@milo/shared";
import type {
  Area,
  Company,
  CompanyRights,
  Id,
  Mode,
  Right,
  WidgetAccess,
  WidgetKind,
  WidgetRights,
} from "@milo/shared";

export type Peut = (area: Area, right: Right, companyId?: Id | string | null) => boolean;

/**
 * Le droit demandé, dans cette société. Sans société — « toutes », ou un
 * élément qui n'en a pas —, il suffit qu'une société du compte l'accorde.
 */
export const peutAvec =
  (rights: CompanyRights): Peut =>
  (area, right, companyId) =>
    can(rights, area, right, companyId === "all" ? null : companyId);

const DroitsContext = createContext<Peut>(() => false);
const WidgetsContext = createContext<WidgetRights>(widgetRightsPartout(""));

export function DroitsProvider({
  rights,
  widgets,
  children,
}: {
  rights: CompanyRights;
  /** Ses permissions par type de widget (shared, widget-kinds.ts). */
  widgets: WidgetRights;
  children: ReactNode;
}) {
  return (
    <DroitsContext.Provider value={peutAvec(rights)}>
      <WidgetsContext.Provider value={widgets}>{children}</WidgetsContext.Provider>
    </DroitsContext.Provider>
  );
}

/** `peut(area, right, companyId?)`, pour le compte connecté. */
export const useDroits = (): Peut => useContext(DroitsContext);

/**
 * La permission du compte connecté sur un type de widget : « » (aucune), le
 * widget ne paraît pas ; « view », il se lit sans se modifier ; « update »,
 * il se pose, se range, se règle.
 */
export const useAccesWidget = (): ((kind: WidgetKind) => WidgetAccess) => {
  const widgets = useContext(WidgetsContext);
  return (kind) => widgets[kind];
};

/** Les modes que le compte voit, dans l'ordre du sélecteur. */
export const modesVisibles = (peut: Peut): Mode[] =>
  MODES.map((m) => m.value).filter((m) => peut(m, "view"));

/** Les sociétés dont le compte voit ce mode. */
export const societesVisibles = (companies: Company[], peut: Peut, mode: Mode): Company[] =>
  companies.filter((c) => peut(mode, "view", c.id));

/**
 * Un « fieldset » sans bordure ni marge : désactivé, il éteint d'un coup tous
 * les champs d'une fiche qu'on ne peut que lire.
 */
export const FIELDSET_NU: CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0 };
