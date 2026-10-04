import { Input } from "@mantine/core";
import { useContext } from "react";
import { CopyPasteContext } from "./CopyPasteActions";
import { DrawerRegistrationsContext } from "./IndicatorDrawer";
import LabelGroupsEditor from "./LabelGroupsEditor";

// The open board's labels, in the drawer of a "Tâches" or "Projets" widget —
// or Support's, shared by all, in that of the "Tickets" widget —, gathered in
// their groups (LabelGroupsEditor). They are not widget settings
// but board data: they go with "Sauvegarder", like the categories
// (BoardListFields).

const KINDS = {
  "task-labels": {
    base: "/labels",
    scope:
      "Les étiquettes configurées ci-dessous sont communes à l'ensemble des widgets, de type tâche, du tableau actuel et uniquement pour ce tableau.",
  },
  "project-labels": {
    base: "/project-labels",
    scope:
      "Les étiquettes configurées ci-dessous sont communes à l'ensemble des widgets, de type projet, du tableau actuel et uniquement pour ce tableau.",
  },
  "support-labels": {
    base: "/support-labels",
    scope:
      "Les étiquettes configurées ci-dessous sont communes à l'ensemble du Support, tous tableaux confondus.",
  },
} as const;

export default function LabelGroupFields({ kind }: { kind: keyof typeof KINDS }) {
  const s = KINDS[kind];
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const boardId = board?.board?.id ?? null;
  // Support's labels belong to no board.
  const support = s.base === "/support-labels";

  if ((!support && boardId === null) || !register) return null;

  return (
    // These are not widget settings: say so under the label, at 20 px from
    // the list.
    <Input.Wrapper
      label="Étiquettes"
      description={s.scope}
      styles={{ description: { paddingBottom: 20 } }}
    >
      <LabelGroupsEditor
        base={s.base}
        boardId={support ? undefined : (boardId ?? undefined)}
        register={register}
        // A paste from the "Actions" menu changes the list: it is re-read.
        version={board?.pastes ?? 0}
      />
    </Input.Wrapper>
  );
}
