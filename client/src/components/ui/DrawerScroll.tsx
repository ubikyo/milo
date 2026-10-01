import { ScrollArea } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import classes from "../../assets/styles/CardDrawer.module.css";

/** Le retrait des tiroirs, que la barre de défilement doit aussi connaître. */
export const DRAWER_PADDING = 40;

/**
 * Les styles d'un tiroir dont seul le panneau de l'onglet ouvert défile : les
 * onglets et les boutons du bas restent en place, quelle que soit la hauteur
 * de la fenêtre, et le contenu s'arrête toujours au-dessus des boutons.
 *
 * Le tiroir est le repère de la barre de défilement, qui court sur toute sa
 * hauteur le long de son bord droit (assets/styles/CardDrawer.module.css) :
 * tout ce qui les sépare reste en « static ».
 */
export const DRAWER_STYLES = {
  content: {
    display: "flex",
    flexDirection: "column",
    position: "relative",
    "--milo-drawer-padding": `${DRAWER_PADDING}px`,
  } as CSSProperties,
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "static",
  } as CSSProperties,
};

/**
 * Les styles des onglets du tiroir : le retrait sous la barre d'onglets, posé
 * une fois pour que les panneaux démarrent tous à la même hauteur, et les
 * panneaux en « static » pour laisser la barre se placer sur le tiroir.
 */
export const DRAWER_TABS_STYLES = {
  panel: { paddingTop: 20, position: "static" as const },
};

/** Un panneau d'onglet qui prend toute la hauteur libre du tiroir. */
export const DRAWER_PANEL_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

interface DrawerScrollAreaProps {
  children: ReactNode;
  /**
   * Le contenu occupe au moins toute la hauteur de la zone : un fil de
   * commentaires vide y centre son invite.
   */
  fill?: boolean;
}

/**
 * La zone qui défile dans un panneau de tiroir. Sa barre se montre dès que le
 * contenu dépasse, couchée sur le bord droit du tiroir.
 */
export default function DrawerScrollArea({
  children,
  fill = false,
}: DrawerScrollAreaProps) {
  return (
    <ScrollArea
      type="auto"
      scrollbars="y"
      classNames={{
        root: classes.root,
        scrollbar: `${classes.scrollbar} ${classes.scrollbarRight}`,
        thumb: classes.thumb,
        ...(fill ? { viewport: classes.viewport } : {}),
      }}
      style={{ flex: 1, minHeight: 0 }}
    >
      {children}
    </ScrollArea>
  );
}
