import type { Milestone } from "@milo/shared";

// The rail's inset in Mantine's slider ("padding-inline" of its
// root, equal to the slider's "md" size): labels align with the
// rail, not with the box.
const RAIL_INSET = 8;

// Height of the labels row, and their size.
const LABELS_HEIGHT = 16;
const LABEL_SIZE = 10;

/**
 * The marks of a progress slider, drawn from the milestones: the dots
 * only. The labels are written separately (MilestoneLabels), Mantine
 * only knowing how to center them on their mark.
 */
export const milestoneMarks = (milestones: Milestone[]) =>
  milestones.filter((j) => j.label).map((j) => ({ value: j.value }));

/**
 * The milestone labels, under the slider. Each starts from its mark toward the
 * right; when the text is too long to fit before the end of the rail, it
 * moves back just enough to stop there.
 *
 * Nothing is measured: each label lives in a box that goes from its mark to the
 * end of the rail, laid out right to left ("row-reverse") and packed toward its
 * end ("flex-end", i.e. the left). As long as the text fits, it therefore sits
 * on the left, on the mark. As soon as it overflows, "safe" gives up that
 * alignment for that of the row's start — the right: the text ends at the
 * end of the rail and extends toward the left.
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
