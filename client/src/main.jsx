import "@mantine/core/styles.css";
// Feuille de l'éditeur de texte enrichi, posée après celle du cœur.
import "@mantine/tiptap/styles.css";
// Feuille des sélecteurs de date (échéance d'un élément de checklist).
import "@mantine/dates/styles.css";
// Posée après celles de Mantine : elle en reprend l'anneau de focus.
import "./assets/styles/focus.css";

import { ColorSchemeScript, MantineProvider, createTheme } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import "dayjs/locale/fr";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { FOCUS_BORDER } from "./themes/colors";
import Favicon from "./components/ui/Favicon.jsx";

// Tous les champs de saisie de Mantine : chacun lit « --input-bd-focus » pour
// la bordure qu'il prend au focus, et chacun la tire de la couleur primaire —
// donc du bleu. On la remplace par notre gris, composant par composant, parce
// que c'est là que Mantine la pose. Passer par le thème plutôt que par une
// feuille de style évite de viser des classes compilées, dont le nom change
// d'une version à l'autre.
const CHAMPS = [
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

const champsSansBleu = Object.fromEntries(
  CHAMPS.map((nom) => [
    nom,
    { styles: { input: { "--input-bd-focus": FOCUS_BORDER } } },
  ]),
);

const theme = createTheme({
  primaryColor: "blue",
  // Seuil à partir duquel Mantine juge un fond « clair » et pose du texte
  // noir dessus (« autoContrast »). Le sien, 0.3, bascule au noir dès le vert
  // et l'orange, alors qu'on les veut en blanc ; à 0.45, seuls le jaune, le
  // gris clair et le blanc restent assez lumineux pour l'exiger.
  luminanceThreshold: 0.45,
  components: {
    ...champsSansBleu,
    // Tous les liens en vert.
    Anchor: { defaultProps: { c: "teal" } },
    // Une case cochée prend le vert des actions de l'application, comme les
    // interrupteurs et les boutons « Ajouter ».
    Checkbox: { defaultProps: { color: "teal" } },
    // Onglets encadrés type dossier partout ; l'accent de l'onglet actif est
    // posé par tabStyle (tabs.js).
    Tabs: {
      defaultProps: { variant: "outline" },
      // Mantine centre le libellé dans l'onglet (« flex: 1 » et
      // « text-align: center » sur le libellé) : on le remet à gauche, contre
      // son icône. Les onglets sont taillés sur leur texte, sauf les onglets
      // verticaux des réglages, où le centrage se voyait.
      styles: { tabLabel: { textAlign: "left" } },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    {/* "auto" suit le thème du système ; le choix de l'utilisateur est mémorisé
        par Mantine dans le localStorage du navigateur. */}
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {/* Les calendriers parlent français et ouvrent la semaine le lundi. */}
      <DatesProvider settings={{ locale: "fr", firstDayOfWeek: 1 }}>
        <Favicon />
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
);
