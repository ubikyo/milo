// The account's rights, company by company, as the interface reads them.
//
// The server checks them on every request (server, lib/rights.ts): here, it
// is only about not offering what would be refused — an "Ajouter"
// button at a company where one can only read, a company of which
// nothing shows in the dropdown.

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

/** The right asked for: it holds everywhere. */
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
  /** Its permissions by widget type (shared, widget-kinds.ts). */
  widgets: WidgetRights;
  /** The right to edit the Paramétrage — milestone types, among others. */
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

/** `can(area, right)`, for the signed-in account. */
export const useRights = (): Can => useContext(RightsContext);

/** True when the signed-in account can edit the Paramétrage. */
export const useSettingsMode = (): boolean => useContext(SettingsAccessContext);

/**
 * The signed-in account's permission on a widget type: "" (none), the
 * widget does not appear; "view", it can be read but not edited; "update",
 * it can be placed, arranged, configured.
 */
export const useWidgetAccess = (): ((kind: WidgetKind) => WidgetAccess) => {
  const widgets = useContext(WidgetsContext);
  return (kind) => widgets[kind];
};

/**
 * A borderless, marginless "fieldset": disabled, it turns off at once all
 * the fields of a record that can only be read.
 */
export const BARE_FIELDSET: CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0 };
