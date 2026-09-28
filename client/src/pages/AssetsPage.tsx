import { Stack } from "@mantine/core";
import { IconLibraryPhoto } from "@tabler/icons-react";
import EmptyPanel from "../components/ui/EmptyPanel";

/**
 * Le mode Assets : la place est prise, ce qu'elle porte reste à écrire. Comme
 * le mode Projet, il suit la société de la liste déroulante de l'entête —
 * « toutes » y compris.
 *
 * Tant qu'il n'y a ni assets ni geste pour en ajouter, l'écran vide n'a pas
 * d'action à proposer : un bouton qui ne mène nulle part vaut moins que pas de
 * bouton du tout.
 */
export default function AssetsPage() {
  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <EmptyPanel icon={IconLibraryPhoto} message="Aucun asset" />
    </Stack>
  );
}
