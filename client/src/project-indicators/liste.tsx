import { IconList } from "@tabler/icons-react";
import { COLONNES_PROJETS, ProjetsListeWidget } from "../components/project/ProjectTable";
import ChampsColonnes from "../components/ui/ChampsColonnes";
import type { ProjectIndicatorWidget } from "./types";

// La liste des projets, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration dit ce qu'elle affiche — ses colonnes. Les
// projets du tableau ouvert, ses filtres et ce qu'on en ouvre viennent de la
// page (ProjetsListeContext).

export const listeProjetsIndicator: ProjectIndicatorWidget = {
  type: "list",
  label: "Liste des projets",
  icon: IconList,
  defaultConfig: {},
  ownClicks: true,
  Display: ({ config }) => <ProjetsListeWidget config={config} />,
  Config: (props) => <ChampsColonnes colonnes={COLONNES_PROJETS} {...props} />,
};
