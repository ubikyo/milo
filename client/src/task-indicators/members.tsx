import { Stack } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { ActorRings } from "../indicators/actors";
import { NAME, TitreIndicateur, tasksOf } from "./common";
import type { TaskIndicatorWidget } from "./types";

// La part de chaque membre dans les cartes du tableau ouvert, en barres
// radiales, comme les acteurs du Support.

const LABEL = "Acteurs";

export const membersIndicator: TaskIndicatorWidget = {
  type: "members",
  kind: "task",
  label: LABEL,
  icon: IconUsers,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, lists }) => (
    <Stack gap={4} style={{ flex: 1 }}>
      <TitreIndicateur config={config} defaultValue={LABEL} />
      <ActorRings actors={tasksOf(lists).map((c) => c.members)} unit="cartes" />
    </Stack>
  ),
};
