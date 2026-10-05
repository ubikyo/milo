import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconCalendarDue } from "@tabler/icons-react";
import { dueState } from "../../lib/due";
import { CHART_COLORS, donutChartProps, donutChartRows, partRows, colorOf, type ChartPart } from "../chart-colors";
import { ongoing, NAME, Nothing, IndicatorTitle } from "./common";
import type { SupportIndicatorWidget } from "./types";

// Where the due dates of open requests stand: those that are past,
// those approaching, those with time, and those without any.
// The "soon" rule is that of cards (lib/due).

const LABEL = "Échéances";

/** The ring's shares, each with its color: "key" is where it is stored. Task mode shares them. */
const DUE_PARTS: (ChartPart & { label: string; matches: (due: string) => boolean })[] = [
  {
    key: "colorLate",
    name: "En retard",
    label: "En retard",
    what: "des échéances en retard",
    defaultColor: CHART_COLORS.red,
    matches: (due) => dueState(due) === "late",
  },
  {
    key: "colorSoon",
    name: "Bientôt",
    label: "Bientôt",
    what: "des échéances proches",
    defaultColor: CHART_COLORS.orange,
    matches: (due) => dueState(due) === "soon",
  },
  {
    key: "colorLater",
    name: "À venir",
    label: "À venir",
    what: "des échéances à venir",
    defaultColor: CHART_COLORS.green,
    matches: (due) => Boolean(due) && dueState(due) === "none",
  },
  {
    key: "colorNone",
    name: "Aucune",
    label: "Sans échéance",
    what: "de l'absence d'échéance",
    defaultColor: CHART_COLORS.gray5,
    matches: (due) => !due,
  },
];

/** The ring's shares that hold something, in their colors; "account" counts those a rule matches. */
export const dueParts = (config: unknown, account: (matches: (due: string) => boolean) => number) =>
  DUE_PARTS.map((p) => ({ name: p.label, value: account(p.matches), color: colorOf(config, p.key, p.defaultColor) })).filter(
    (part) => part.value > 0,
  );

/** The "Apparence du graphique" rows of a due dates ring. */
export const dueAppearance = (config: unknown, onChange: (config: Record<string, unknown>) => void) => [
  ...partRows(config, onChange, DUE_PARTS),
  ...donutChartRows(config, onChange, { withLabel: true }),
];

export const duesIndicator: SupportIndicatorWidget = {
  type: "due",
  kind: "helpdesk",
  label: LABEL,
  icon: IconCalendarDue,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, requests }) => {
    const ongoingRequests = requests.filter(ongoing);
    const account = (filter: (due: string) => boolean) =>
      ongoingRequests.filter((d) => filter(d.due_date)).length;
    const data = dueParts(config, account);

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <IndicatorTitle config={config} defaultValue={`${LABEL} des tickets en cours`} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Nothing>Aucun ticket en cours</Nothing>
          </div>
        ) : (
          <DonutChart
            data={data}
            size={150}
            thickness={22}
            chartLabel={ongoingRequests.length}
            withTooltip
            withLegend
            pieProps={{ isAnimationActive: false }}
            {...donutChartProps(config)}
          />
        )}
      </Stack>
    );
  },

  chartAppearance: dueAppearance,
};
