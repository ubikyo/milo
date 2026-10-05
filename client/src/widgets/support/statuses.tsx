import { RadarChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconChartRadar } from "@tabler/icons-react";
import { SUPPORT_STATUSES } from "@milo/shared";
import { insertRow, type SettingRow } from "../../components/ui/SettingRows";
import { text } from "../types";
import { NAME, IndicatorTitle } from "./common";
import type { SupportIndicatorWidget } from "./types";
import { themeColor } from "../../lib/themeColors";

// The breakdown of the requests of the company being viewed by status, as a radar:
// one branch per status, and its length says how many requests it holds.

const LABEL = "Statuts";

/** The radar's height: enough so the five labels do not overlap. */
const RADAR_HEIGHT = 220;

const COLOR = "color";
const STROKE_COLOR = "strokeColor";
const LEGEND_COLOR = "legendColor";
const GRID_COLOR = "gridColor";

/**
 * The radar's colors while none is chosen, in hexadecimal so the picker shows
 * them: the application's green (Mantine's teal 6) for the outline, and the
 * same at 20 % for the fill.
 */
const defaultColor = () => themeColor("chart-status-fill");
const defaultStroke = () => themeColor("chart-status-stroke");


/**
 * Mantine's own legend and grid colors (@mantine/charts), in the current
 * scheme: the dimmed text, and a translucent gray. While none is chosen, the
 * chart is given none, and keeps following the scheme.
 */
const defaultLegend = () => themeColor("widget-dimmed");
const defaultGrid = () => themeColor("chart-grid");

export const statusesIndicator: SupportIndicatorWidget = {
  type: "status",
  kind: "helpdesk",
  label: LABEL,
  icon: IconChartRadar,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, requests }) => {
    const data = SUPPORT_STATUSES.map(({ value, label }) => ({
      status: label,
      tickets: requests.filter((d) => d.status === value).length,
    }));
    const stroke = text(config, STROKE_COLOR) || defaultStroke();
    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={LABEL} />
        <RadarChart
          h={RADAR_HEIGHT}
          data={data}
          dataKey="status"
          // The fill carries its own transparency: the chart adds none. The
          // dots take the outline's color — the fill's would fade them.
          series={[
            {
              name: "tickets",
              label: "Tickets",
              color: text(config, COLOR) || defaultColor(),
              strokeColor: stroke,
              opacity: 1,
            },
          ]}
          dotProps={{ fill: stroke, stroke }}
          textColor={text(config, LEGEND_COLOR) || undefined}
          gridColor={text(config, GRID_COLOR) || undefined}
          withPolarRadiusAxis={false}
          withTooltip
          withDots
        />
      </Stack>
    );
  },

  // Each color shows its default; brought back to it, it is no longer stored.
  chartAppearance: (config, onChange) => {
    const colorRow = (
      name: string,
      what: string,
      key: string,
      defaultColor: string,
      alpha = false,
    ): SettingRow => {
      const color = text(config, key);
      return {
        name,
        what,
        color: {
          value: color || defaultColor,
          onChange: (v) => onChange(insertRow(config, { [key]: v === defaultColor ? "" : v })),
          alpha,
        },
        modified: color !== "" && color !== defaultColor,
        reset: () => onChange(insertRow(config, { [key]: "" })),
      };
    };
    return [
      colorRow("Surface", "de la surface du graphique", COLOR, defaultColor(), true),
      colorRow("Trait", "du trait du graphique", STROKE_COLOR, defaultStroke()),
      colorRow("Légendes", "des légendes", LEGEND_COLOR, defaultLegend()),
      colorRow("Grille", "de la grille", GRID_COLOR, defaultGrid(), true),
    ];
  },
};
