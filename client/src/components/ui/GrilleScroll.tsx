import { ScrollArea } from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import classes from "../../assets/styles/GrilleScroll.module.css";

/**
 * La zone qui fait défiler une grille de côté, quand sa section est plus
 * étroite qu'elle : la barre fine de l'application plutôt que celle du
 * navigateur, couchée sur le filet sous l'entête plutôt qu'au bas de la
 * grille.
 *
 * Le contenu de la zone passe en bloc : en « table », comme le veut Mantine,
 * il épouserait la grille et ses « 100 % » ne vaudraient plus la largeur de
 * la section (useColonnesRedimensionnables).
 */
export default function GrilleScroll({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // Le bas de la ligne d'entête, depuis le haut de la zone : le filet en
  // occupe le dernier pixel.
  const [filet, setFilet] = useState<number | null>(null);

  // L'entête change de hauteur avec ses libellés, et la grille elle-même peut
  // être remplacée : on la retrouve à chaque rendu, et on la suit tant
  // qu'elle est là.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const entete = viewport?.querySelector("thead");
    if (!viewport || !entete) {
      setFilet(null);
      return;
    }
    const mesurer = () =>
      setFilet(entete.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(entete);
    return () => observateur.disconnect();
  });

  return (
    <ScrollArea
      type="auto"
      scrollbars="x"
      viewportRef={viewportRef}
      classNames={{ scrollbar: classes.scrollbar, thumb: classes.thumb }}
      styles={{ content: { display: "block" } }}
      style={filet === null ? undefined : ({ "--grille-filet": `${filet}px` } as CSSProperties)}
    >
      {children}
    </ScrollArea>
  );
}
