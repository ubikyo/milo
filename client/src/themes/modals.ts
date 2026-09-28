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
// Le titre est dans la graisse la plus fine de la police, et fait une hausse
// d'un cinquième par rapport à la taille de Mantine (16 × 1,2 ≈ 19 px). Même
// titre pour toutes les fenêtres et tous les tiroirs.
//
// Toutes les polices n'ont pas de graisse 100 : le navigateur prend alors la
// plus fine dont elle dispose, souvent la normale. Le titre ne repose donc
// sur rien d'autre que sa taille et son bandeau pour se distinguer.

// Retrait des petites fenêtres — confirmation, saisie rapide : le double du
// « md » de Mantine.
export const MODAL_PADDING = 32;

export const modalHeaderStyles = (padding: number) => ({
  title: {
    fontWeight: 100,
    color: "#FFFFFF",
    fontSize: "calc(var(--mantine-font-size-md) * 1.2)",
  },
  header: {
    backgroundColor: DARK_HEADER,
    padding: padding / 2,
    paddingInlineEnd: padding / 2,
  },
  body: { paddingTop: padding },
});
