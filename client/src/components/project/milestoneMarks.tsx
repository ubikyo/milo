import type { Milestone } from "@milo/shared";

// Le retrait du rail dans le curseur de Mantine (« padding-inline » de sa
// racine, qui vaut la taille « md » du curseur) : les libellés s'alignent sur
// le rail, pas sur la boîte.
const RAIL_INSET = 8;

// Hauteur de la rangée des libellés, et leur taille.
const LABELS_HEIGHT = 16;
const LABEL_SIZE = 10;

/**
 * Les marques d'un curseur d'avancement, tirées des jalons : les points
 * seulement. Les libellés s'écrivent à part (MilestoneLabels), Mantine ne
 * sachant que les centrer sur leur marque.
 */
export const milestoneMarks = (milestones: Milestone[]) =>
  milestones.filter((j) => j.label).map((j) => ({ value: j.value }));

/**
 * Les libellés des jalons, sous le curseur. Chacun part de sa marque vers la
 * droite ; quand le texte est trop long pour tenir avant le bout du rail, il
 * recule juste assez pour s'y arrêter.
 *
 * Rien ne se mesure : chaque libellé vit dans une boîte qui va de sa marque au
 * bout du rail, rangée de droite à gauche (« row-reverse ») et tassée vers sa
 * fin (« flex-end », soit la gauche). Tant que le texte tient, il se cale donc
 * à gauche, sur la marque. Dès qu'il déborde, « safe » renonce à cet
 * alignement pour celui du début de la rangée — la droite : le texte finit au
 * bout du rail et dépasse vers la gauche.
 */
export function MilestoneLabels({ milestones }: { milestones: Milestone[] }) {
  const written = milestones.filter((j) => j.label);
  if (written.length === 0) return null;

  return (
    <div
      style={{
        position: "relative",
        height: LABELS_HEIGHT,
        marginInline: RAIL_INSET,
        marginTop: 4,
      }}
    >
      {written.map((j) => (
        <div
          key={j.value}
          style={{
            position: "absolute",
            top: 0,
            left: `${j.value}%`,
            right: 0,
            display: "flex",
            flexDirection: "row-reverse",
            justifyContent: "safe flex-end",
          }}
        >
          <span
            style={{
              flexShrink: 0,
              whiteSpace: "nowrap",
              fontSize: LABEL_SIZE,
              lineHeight: `${LABELS_HEIGHT}px`,
              color: "var(--mantine-color-dimmed)",
            }}
          >
            {j.label}
          </span>
        </div>
      ))}
    </div>
  );
}
