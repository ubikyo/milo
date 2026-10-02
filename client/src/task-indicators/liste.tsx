import { IconLayoutKanban } from "@tabler/icons-react";
import { TableauDesTachesWidget } from "../components/board/TaskBoard";
import type { TaskIndicatorWidget } from "./types";

// Les listes du tableau ouvert et leurs cartes, en widget : elles se posent
// dans une section comme un indicateur. Ce qu'elles montrent, et ce qu'on en
// fait, vient de la page (TableauDesTachesContext). Les numéros des cartes et
// le verrou des listes restent des réglages du tableau, dans son tiroir.

export const listeTachesIndicator: TaskIndicatorWidget = {
  type: "list",
  kind: "task",
  label: "Listes des tâches",
  icon: IconLayoutKanban,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: () => <TableauDesTachesWidget />,
};
