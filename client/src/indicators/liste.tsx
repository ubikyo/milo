import { IconList } from "@tabler/icons-react";
import ChampsColonnes from "../components/ui/ChampsColonnes";
import SupportRequestsList, { COLONNES_SUPPORT } from "../components/support/SupportRequestsList";
import type { SupportIndicatorWidget } from "./types";

// La liste des demandes, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration ne dit que les colonnes qu'elle montre. Ce
// qu'elle liste — l'onglet ouvert, trié, filtré — vient de la page
// (SupportListeContext).

export const listeIndicator: SupportIndicatorWidget = {
  type: "list",
  kind: "helpdesk",
  label: "Liste des tickets",
  icon: IconList,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <SupportRequestsList config={config} />,
  Config: (props) => <ChampsColonnes colonnes={COLONNES_SUPPORT} {...props} />,
};
