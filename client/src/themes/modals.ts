import { DARK_HEADER } from "./colors";

// Entête commun aux fenêtres modales et aux tiroirs — Mantine les construit
// sur la même base : un bandeau gris foncé et un titre blanc, identiques dans
// les deux thèmes.
//
// « padding » est le retrait de la fenêtre : il rétablit celui du haut du
// corps, que Mantine supprime dès qu'il y a un entête, et le bandeau en prend
// la moitié pour rester mince. Le retrait de fin est repris explicitement,
// sinon Mantine le calcule sur le retrait de la fenêtre et les deux côtés du
// bandeau seraient inégaux.
//
// Le titre est en graisse normale, et fait deux hausses d'un cinquième par
// rapport à la taille de Mantine (1,2 × 1,2 = 1,44). Même titre pour toutes
// les fenêtres.
// Retrait des petites fenêtres — confirmation, saisie rapide : le double du
// « md » de Mantine.
export const MODAL_PADDING = 32;

export const modalHeaderStyles = (padding) => ({
  title: {
    fontWeight: 400,
    color: "#FFFFFF",
    fontSize: "calc(var(--mantine-font-size-md) * 1.44)",
  },
  header: {
    backgroundColor: DARK_HEADER,
    padding: padding / 2,
    paddingInlineEnd: padding / 2,
  },
  body: { paddingTop: padding },
});
