import { Stack } from "@mantine/core";
import { IconList } from "@tabler/icons-react";
import { COLONNES_PROJETS, ProjetsListeWidget } from "../components/project/ProjectTable";
import ActionsCopierColler from "../components/ui/ActionsCopierColler";
import ChampsColonnes, { LISTE_COLONNES } from "../components/ui/ChampsColonnes";
import ChampsListeDuTableau from "../components/ui/ChampsListeDuTableau";
import { useParametrage } from "../lib/droits";
import type { WidgetConfigProps } from "../widgets/types";
import type { ProjectIndicatorWidget } from "./types";

// La liste des projets, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration dit ce qu'elle affiche — ses colonnes. Les
// projets du tableau ouvert, ses filtres et ce qu'on en ouvre viennent de la
// page (ProjetsListeContext). Le menu « Actions » de son tiroir copie et
// colle les étiquettes et les catégories du tableau.

export const listeProjetsIndicator: ProjectIndicatorWidget = {
  type: "list",
  kind: "project",
  label: "Projets",
  icon: IconList,
  // Posé, le widget montre ces colonnes ; les autres s'ajoutent depuis son
  // tiroir.
  defaultConfig: {
    [LISTE_COLONNES]: [
      "number",
      "name",
      "category_name",
      "actors",
      "created_at",
      "labels",
      "status",
    ].map((key) => ({ key })),
  },
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <ProjetsListeWidget config={config} />,
  Config: Reglages,
};

function Reglages(props: WidgetConfigProps) {
  // Les types de jalons relèvent du Paramétrage.
  const parametrage = useParametrage();
  return (
    <>
      <ActionsCopierColler univers="projects" choses={["labels", "categories"]} />
      <Stack gap="xl">
        <ChampsColonnes colonnes={COLONNES_PROJETS} {...props} />
        {/* Les catégories, les étiquettes du tableau et les types de jalons,
            sous ses colonnes : ils partent à la sauvegarde, avec la
            configuration. */}
        <ChampsListeDuTableau sorte="categories" />
        <ChampsListeDuTableau sorte="project-labels" />
        {parametrage && <ChampsListeDuTableau sorte="milestone-types" />}
      </Stack>
    </>
  );
}
