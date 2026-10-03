import "@mantine/core/styles.css";
// Feuille de l'éditeur de texte enrichi, posée après celle du cœur.
import "@mantine/tiptap/styles.css";
// Feuille des sélecteurs de date (échéance d'un élément de checklist).
import "@mantine/dates/styles.css";
// Feuille des notifications de suivi, en bas à droite.
import "@mantine/notifications/styles.css";
// Feuille des graphiques : ceux des indicateurs.
import "@mantine/charts/styles.css";
// Posée après celles de Mantine : elle en reprend l'anneau de focus.
// Le curseur gris de toutes les barres de défilement.
import "./assets/styles/scrollbars.css";
// Le survol des lignes des grilles, un cran plus sombre.
import "./assets/styles/tables.css";
// Ni sélection ni menu du navigateur, hors Debug.
import "./assets/styles/no-select.css";
import "./assets/styles/no-borders.css"; // ESSAI TEMPORAIRE : champs sans bordure

import { ColorSchemeScript, MantineProvider, createTheme } from "@mantine/core";
import type { MantineColorsTuple } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import "dayjs/locale/fr";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BLEU, FOCUS_BORDER, ORANGE, ROUGE, VERT } from "./themes/colors";
import Favicon from "./components/ui/Favicon";

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

// Sauf pour une saisie sur place — renommer une catégorie, une étiquette, une
// carte. Ces champs n'ont pas de cadre (« variant unstyled ») et Mantine met
// leur « --input-bd-focus » à transparent : ils ne doivent pas s'encadrer au
// clic, sans quoi la ligne changerait d'aspect à la moindre saisie. Notre gris
// le rétablissait pour tout le monde.
const champsSansBleu = Object.fromEntries(
  CHAMPS.map((nom) => [
    nom,
    {
      styles: (_theme: unknown, props: { variant?: string }) =>
        props.variant === "unstyled"
          ? {}
          : { input: { "--input-bd-focus": FOCUS_BORDER } },
    },
  ]),
);

/** Une palette Mantine dont les dix nuances sont la même couleur. */
const uneSeuleNuance = (couleur: string): MantineColorsTuple =>
  Array.from({ length: 10 }, () => couleur) as unknown as MantineColorsTuple;

const theme = createTheme({
  primaryColor: "blue",
  // Un seul rouge, un seul orange, un seul vert, un seul bleu
  // (themes/colors.ts). Le teal, qui est le vert des actions et des liens,
  // prend le même que « green ».
  colors: {
    blue: uneSeuleNuance(BLEU),
    red: uneSeuleNuance(ROUGE),
    orange: uneSeuleNuance(ORANGE),
    green: uneSeuleNuance(VERT),
    teal: uneSeuleNuance(VERT),
  },
  // Seuil à partir duquel Mantine juge un fond « clair » et pose du texte
  // noir dessus (« autoContrast »). Le sien, 0.3, bascule au noir dès le vert
  // et l'orange, alors qu'on les veut en blanc ; à 0.45, seuls le jaune, le
  // gris clair et le blanc restent assez lumineux pour l'exiger.
  luminanceThreshold: 0.45,
  // Aucun anneau de focus sur les boutons, les onglets ni les tuiles : un
  // tiroir ou une boîte qui s'ouvre donne le focus à son premier bouton, et
  // l'entourait de bleu sans que personne n'ait navigué au clavier.
  focusRing: "never",
  components: {
    ...champsSansBleu,
    // Tous les liens en vert.
    Anchor: { defaultProps: { c: "teal" } },
    // Les lignes entre les rangées de toutes les grilles, deux tons plus foncés
    // que ceux de Mantine (gray-3 / dark-4) : elles séparaient à peine les
    // lignes. Les grilles sans filets (withRowBorders={false}) n'en ont pas.
    Table: {
      vars: () => ({
        table: {
          "--table-border-color":
            "light-dark(var(--mantine-color-gray-5), var(--mantine-color-dark-6))",
        },
      }),
      // Le filet sous les entêtes garde la couleur de Mantine : il sépare les
      // libellés des données, pas une ligne de la suivante.
      styles: {
        thead: {
          "--table-border-color":
            "light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
        } as React.CSSProperties,
      },
    },
    // Une case cochée prend le vert des actions de l'application, comme les
    // interrupteurs et les boutons « Ajouter ».
    Checkbox: { defaultProps: { color: "teal" } },
    // Des menus aux angles plus vifs que le reste (« xs » au lieu du « sm »
    // par défaut) : le rayon vaut pour le menu et pour ses lignes au survol.
    Menu: { defaultProps: { radius: "xs" } },
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

// La racine est dans index.html : sans elle, rien à monter.
const racine = document.getElementById("root");
if (!racine) throw new Error("Élément #root introuvable");

ReactDOM.createRoot(racine).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    {/* "auto" suit le thème du système ; le choix de l'utilisateur est mémorisé
        par Mantine dans le localStorage du navigateur. */}
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {/* Les calendriers parlent français et ouvrent la semaine le lundi. */}
      <DatesProvider settings={{ locale: "fr", firstDayOfWeek: 1 }}>
        <Favicon />
        {/* Les notifications de suivi s'empilent en bas à droite, hors du
            chemin de la barre de modes qui occupe le bas à gauche. */}
        <Notifications position="bottom-right" limit={4} />
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
);
