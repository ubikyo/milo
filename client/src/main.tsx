import "@mantine/core/styles.css";
// Stylesheet of the rich text editor, placed after the core one.
import "@mantine/tiptap/styles.css";
// Stylesheet of the date pickers (due date of a checklist item).
import "@mantine/dates/styles.css";
// Stylesheet of the follow notifications, at bottom right.
import "@mantine/notifications/styles.css";
// Stylesheet of the charts: those of the indicators.
import "@mantine/charts/styles.css";
// Placed after Mantine's: it takes over its focus ring.
// The gray thumb of all scrollbars.
import "./assets/styles/scrollbars.css";
// The hover of grid rows, a notch darker.
import "./assets/styles/tables.css";
// No selection of the interface.
import "./assets/styles/no-select.css";
import "./assets/styles/no-borders.css"; // TEMPORARY TEST: borderless fields

import { ColorSchemeScript, MantineProvider, createTheme } from "@mantine/core";
import type { MantineColorsTuple } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import "dayjs/locale/fr";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BLUE, FOCUS_BORDER, ORANGE, PALETTE_RED, PALETTE_GREEN } from "./themes/colors";
import ErrorPage from "./components/ui/ErrorPage";
import Favicon from "./components/ui/Favicon";

// All of Mantine's input fields: each reads "--input-bd-focus" for the
// border it takes on focus, and each draws it from the primary color —
// hence blue. We replace it with our gray, component by component, because
// that is where Mantine sets it. Going through the theme rather than a
// stylesheet avoids targeting compiled classes, whose name changes
// from one version to the next.
const FIELDS = [
  "Input",
  "InputBase",
  "TextInput",
  "Textarea",
  "PasswordInput",
  "NumberInput",
  "Select",
  "MultiSelect",
  "Autocomplete",
  "TagsInput",
  "NativeSelect",
  "JsonInput",
  "PinInput",
  "DatePickerInput",
  "TimeInput",
];

// Except for in-place input — renaming a category, a label, a
// card. These fields have no frame ("variant unstyled") and Mantine sets
// their "--input-bd-focus" to transparent: they must not get framed on
// click, otherwise the row would change appearance on the slightest input. Our gray
// was restoring it for everyone.
const fieldsWithoutBlue = Object.fromEntries(
  FIELDS.map((name) => [
    name,
    {
      styles: (_theme: unknown, props: { variant?: string }) =>
        props.variant === "unstyled"
          ? {}
          : { input: { "--input-bd-focus": FOCUS_BORDER } },
    },
  ]),
);

/** A Mantine palette whose ten shades are the same color. */
const singleShade = (color: string): MantineColorsTuple =>
  Array.from({ length: 10 }, () => color) as unknown as MantineColorsTuple;

const theme = createTheme({
  primaryColor: "blue",
  // A single red, a single orange, a single green, a single blue
  // (themes/colors.ts). Teal, which is the green of actions and links,
  // takes the same as "green".
  colors: {
    blue: singleShade(BLUE),
    red: singleShade(PALETTE_RED),
    orange: singleShade(ORANGE),
    green: singleShade(PALETTE_GREEN),
    teal: singleShade(PALETTE_GREEN),
  },
  // Threshold from which Mantine deems a background "light" and puts black
  // text on it ("autoContrast"). Its own, 0.3, flips to black as early as green
  // and orange, whereas we want them in white; at 0.45, only yellow, light
  // gray and white remain luminous enough to require it.
  luminanceThreshold: 0.45,
  // No focus ring on buttons, tabs or tiles: a
  // drawer or dialog that opens gives focus to its first button, and
  // surrounded it with blue without anyone having navigated by keyboard.
  focusRing: "never",
  components: {
    ...fieldsWithoutBlue,
    // All links in green.
    Anchor: { defaultProps: { c: "teal" } },
    // The lines between the rows of all grids, two tones darker
    // than Mantine's (gray-3 / dark-4): they barely separated the
    // rows. Grids without rules (withRowBorders={false}) have none.
    Table: {
      vars: () => ({
        table: {
          "--table-border-color":
            "light-dark(var(--mantine-color-gray-5), var(--mantine-color-dark-6))",
        },
      }),
      // The rule under the headers keeps Mantine's color: it separates the
      // labels from the data, not one row from the next.
      styles: {
        thead: {
          "--table-border-color":
            "light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
        } as React.CSSProperties,
      },
    },
    // A checked box takes the green of the application's actions, like the
    // switches and the "Ajouter" buttons.
    Checkbox: { defaultProps: { color: "teal" } },
    // Menus with sharper corners than the rest ("xs" instead of the default
    // "sm"): the radius applies to the menu and to its rows on hover.
    Menu: { defaultProps: { radius: "xs" } },
    // Framed folder-style tabs everywhere; the active tab's accent is
    // set by tabStyle (tabs.js).
    Tabs: {
      defaultProps: { variant: "outline" },
      // Mantine centers the label in the tab ("flex: 1" and
      // "text-align: center" on the label): we put it back on the left, against
      // its icon. Tabs are cut to fit their text, except the vertical
      // settings tabs, where the centering showed.
      styles: { tabLabel: { textAlign: "left" } },
    },
  },
});

// The root is in index.html: without it, nothing to mount.
const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {/* An unknown error — uncaught — gives way to a red page that says
        where it comes from, rather than a blank page. */}
    <ErrorPage>
      <ColorSchemeScript defaultColorScheme="auto" />
      {/* "auto" follows the system theme; the user's choice is remembered
        by Mantine in the browser's localStorage. */}
      <MantineProvider theme={theme} defaultColorScheme="auto">
        {/* Calendars speak French and start the week on Monday. */}
        <DatesProvider settings={{ locale: "fr", firstDayOfWeek: 1 }}>
          <Favicon />
          {/* Follow notifications stack at bottom right, out of the
            way of the mode bar that occupies the bottom left. */}
          <Notifications position="bottom-right" limit={4} />
          <App />
        </DatesProvider>
      </MantineProvider>
    </ErrorPage>
  </React.StrictMode>,
);
