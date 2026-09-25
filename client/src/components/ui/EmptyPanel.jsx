import { Button, EmptyState } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { PLUS_SIZE } from "../../themes/plus";

// Écran d'invite, quand il n'y a encore rien à montrer : projets, tableaux,
// listes, commentaires.
//
// C'est l'EmptyState de Mantine, avec les choix de l'application : une pastille
// neutre derrière l'icône, l'occupation de toute la zone de contenu, et le
// bouton d'ajout quand l'écran a une action à proposer. « fill » à faux pour
// les invites logées dans un cadre, qui se règlent sur leur contenu.
export default function EmptyPanel({
  icon: Icon,
  message,
  actionLabel,
  onAction,
  size = "lg",
  fill = true,
}) {
  return (
    <EmptyState
      size={size}
      withIndicatorBackground
      icon={<Icon size={size === "lg" ? 22 : 16} />}
      // Le titre de Mantine est en demi-gras (600) : ici le message se lit
      // comme une phrase, pas comme un titre.
      styles={{ title: { fontWeight: 400 } }}
      // Centrée verticalement dans la hauteur qu'elle occupe.
      style={fill ? { flex: 1, minHeight: 0, justifyContent: "center" } : undefined}
    >
      {/* Certains écrans n'ont rien à proposer ici : sans action, pas de bouton. */}
      {actionLabel && onAction && (
        <EmptyState.Actions>
          <Button color="teal" leftSection={<IconPlus size={PLUS_SIZE} />} onClick={onAction}>
            {actionLabel}
          </Button>
        </EmptyState.Actions>
      )}
    </EmptyState>
  );
}
