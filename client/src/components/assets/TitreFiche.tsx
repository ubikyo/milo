import { Title } from "@mantine/core";
import type { ReactNode } from "react";

/** L'air entre un titre de la fiche et ce qu'il annonce : cartes ou grille. */
export const ESPACE_SOUS_TITRE = 10;

/**
 * Un titre de la fiche d'un poste — celui du Résumé, ceux des sections des
 * autres onglets —, comme une catégorie du mode Accès : blanc, en 18. Une
 * section repliée l'a comme le reste du texte : en gris, à sa taille et à sa
 * graisse.
 */
export default function TitreFiche({
  children,
  replie = false,
}: {
  children: ReactNode;
  replie?: boolean;
}) {
  return (
    <Title
      order={1}
      size={replie ? "sm" : 18}
      c={replie ? "dimmed" : "var(--mantine-color-white)"}
      fw={replie ? 400 : undefined}
    >
      {children}
    </Title>
  );
}
