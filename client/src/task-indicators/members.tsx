import { Stack } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { ActorRings } from "../indicators/actors";
import { NAME, IndicatorTitle, tasksOf } from "./common";
import type { TaskIndicatorWidget } from "./types";

// Each member's share in the open board's cards, as radial
// bars, like Support's actors.

const LABEL = "Acteurs";

export const membersIndicator: TaskIndicatorWidget = {
  type: "members",
  kind: "task",
  label: LABEL,
  icon: IconUsers,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, lists }) => (
    <Stack gap={4} style={{ flex: 1 }}>
      <IndicatorTitle config={config} defaultValue={LABEL} />
      <ActorRings actors={tasksOf(lists).map((c) => c.members)} unit="cartes" />
    </Stack>
  ),
};
