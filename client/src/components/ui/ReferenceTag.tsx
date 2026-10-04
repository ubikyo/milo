import { Badge, CopyButton, UnstyledButton } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";

// L'étiquette verte d'une référence (« PRJ-12 », « TSK-12 »).

// Hauteur du tag, comme celui du numéro de ticket au support.
const TAG_HEIGHT = 20;
// Le retrait de part et d'autre de la référence, plus serré que celui de Mantine.
const TAG_PADDING_X = 2;
// L'écart de part et d'autre du séparateur, quand l'étiquette se copie.
const SEPARATOR_GAP = 4;

interface ReferenceTagProps {
  /** La référence affichée. */
  reference: string;
  /**
   * La référence la plus longue qu'on attend : toutes les étiquettes d'une
   * liste en prennent la largeur.
   */
  template: string;
  /**
   * Vrai pour ajouter, au bout de l'étiquette et derrière un trait, un
   * bouton qui copie la référence.
   */
  copyable?: boolean;
}

export function ReferenceTag({ reference, template, copyable }: ReferenceTagProps) {
  return (
    <Badge color="green" variant="filled" radius="sm" h={TAG_HEIGHT} px={TAG_PADDING_X}>
      <span style={{ display: "inline-flex", alignItems: "center", height: "100%" }}>
        {/* La référence et son gabarit, invisible, se superposent dans la même
            case : l'étiquette prend la largeur du plus long. */}
        <span style={{ display: "inline-grid", justifyItems: "center" }}>
          <span style={{ gridArea: "1 / 1" }}>{reference}</span>
          <span style={{ gridArea: "1 / 1", visibility: "hidden" }} aria-hidden>
            {template}
          </span>
        </span>
        {copyable && (
          <>
            <span
              aria-hidden
              // Toute la hauteur de l'étiquette, de bord à bord.
              style={{
                width: 1,
                height: TAG_HEIGHT,
                marginInline: SEPARATOR_GAP,
                // Un blanc très transparent : le trait se voit sans
                // concurrencer la référence.
                backgroundColor: "rgba(255, 255, 255, 0.3)",
              }}
            />
            <CopyButton value={reference}>
              {({ copied, copy }) => (
                <UnstyledButton
                  onClick={copy}
                  aria-label={`Copier ${reference}`}
                  style={{ display: "inline-flex", color: "white" }}
                >
                  {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                </UnstyledButton>
              )}
            </CopyButton>
          </>
        )}
      </span>
    </Badge>
  );
}
