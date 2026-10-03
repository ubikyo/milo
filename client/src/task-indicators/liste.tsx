import { Stack, Switch } from "@mantine/core";
import { IconLayoutKanban } from "@tabler/icons-react";
import { NUMEROS, TableauDesTachesWidget, avecNumeros } from "../components/board/TaskBoard";
import ActionsCopierColler from "../components/ui/ActionsCopierColler";
import ChampsListeDuTableau from "../components/ui/ChampsListeDuTableau";
import { avec } from "../widgets/types";
import type { TaskIndicatorWidget } from "./types";

// Les listes du tableau ouvert et leurs cartes, en widget : elles se posent
// dans une section comme un indicateur. Ce qu'elles montrent, et ce qu'on en
// fait, vient de la page (TableauDesTachesContext). Le numéro des cartes est
// une option du widget, éteinte par défaut ; le verrou des listes reste un
// réglage du tableau. Le menu « Actions » de son tiroir copie et colle les
// étiquettes du tableau.

export const listeTachesIndicator: TaskIndicatorWidget = {
  type: "list",
  kind: "task",
  label: "Tâches",
  icon: IconLayoutKanban,
  defaultConfig: { [NUMEROS]: false },
  Config: ({ config, onChange }) => (
    <>
      <ActionsCopierColler univers="tasks" choses={["labels"]} />
      <Stack gap="xl">
        <Switch
          color="teal"
          label="Numéro des cartes"
          checked={avecNumeros(config)}
          onChange={(e) => onChange(avec(config, NUMEROS, e.currentTarget.checked))}
        />
        {/* Les étiquettes du tableau : elles partent à la sauvegarde. */}
        <ChampsListeDuTableau sorte="task-labels" />
      </Stack>
    </>
  ),
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <TableauDesTachesWidget config={config} />,
};
