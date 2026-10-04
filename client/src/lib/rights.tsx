// Les droits du compte, société par société, tels que l'interface les lit.
//
// Le serveur les vérifie à chaque requête (server, lib/droits.ts) : ici, il
// s'agit seulement de ne pas proposer ce qui serait refusé — un bouton
// « Ajouter » chez une société où l'on ne fait que lire, une société dont on
// ne voit rien dans la liste déroulante.

import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { can, widgetRightsEverywhere } from "@milo/shared";
import type {
  Area,
  CompanyRights,
  Right,
  WidgetAccess,
  WidgetKind,
  WidgetRights,
} from "@milo/shared";

export type Can = (area: Area, right: Right) => boolean;

/** Le droit demandé : il vaut partout. */
export const canFrom =
  (rights: CompanyRights): Can =>
  (area, right) =>
    can(rights, area, right);

const RightsContext = createContext<Can>(() => false);
const WidgetsContext = createContext<WidgetRights>(widgetRightsEverywhere(""));
const SettingsAccessContext = createContext(false);

export function RightsProvider({
  rights,
  widgets,
  canEditSettings,
  children,
}: {
  rights: CompanyRights;
  /** Ses permissions par type de widget (shared, widget-kinds.ts). */
  widgets: WidgetRights;
  /** Le droit de modifier le Paramétrage — les types de jalons, entre autres. */
  canEditSettings: boolean;
  children: ReactNode;
}) {
  return (
    <RightsContext.Provider value={canFrom(rights)}>
      <WidgetsContext.Provider value={widgets}>
        <SettingsAccessContext.Provider value={canEditSettings}>{children}</SettingsAccessContext.Provider>
      </WidgetsContext.Provider>
    </RightsContext.Provider>
  );
}

/** `peut(area, right)`, pour le compte connecté. */
export const useRights = (): Can => useContext(RightsContext);

/** Vrai quand le compte connecté peut modifier le Paramétrage. */
export const useSettingsMode = (): boolean => useContext(SettingsAccessContext);

/**
 * La permission du compte connecté sur un type de widget : « » (aucune), le
 * widget ne paraît pas ; « view », il se lit sans se modifier ; « update »,
 * il se pose, se range, se règle.
 */
export const useWidgetAccess = (): ((kind: WidgetKind) => WidgetAccess) => {
  const widgets = useContext(WidgetsContext);
  return (kind) => widgets[kind];
};

/**
 * Un « fieldset » sans bordure ni marge : désactivé, il éteint d'un coup tous
 * les champs d'une fiche qu'on ne peut que lire.
 */
export const BARE_FIELDSET: CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0 };
