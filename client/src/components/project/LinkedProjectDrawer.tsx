// "Créer un projet", from a ticket (lib/creations.ts): a new project's
// drawer, in the Projets widget its Tickets widget names — on any board. Its
// categories, milestone types and labels are that widget's, read here; the
// project starts from the ticket's name, its description carries the link
// back to it.

import { useEffect, useState } from "react";
import type { Category, MilestoneType, ProjectBoard, ProjectLabel, PublicUser, SourceWidget } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { descriptionOf } from "../board/TaskDestination";
import type { SourceTask } from "../board/TaskDestination";
import ProjectDrawer from "./ProjectDrawer";

/** The project to create: in which widget, from which ticket. */
export interface ProjectCreation {
  target: SourceWidget;
  source: SourceTask;
}

interface Lookups {
  categories: Category[];
  milestoneTypes: MilestoneType[];
  labels: ProjectLabel[];
}

export default function LinkedProjectDrawer({
  creation,
  onClose,
  users,
  currentUser,
  boards,
}: {
  creation: ProjectCreation | null;
  onClose: () => void;
  users: PublicUser[];
  currentUser: PublicUser | null;
  boards: ProjectBoard[];
}) {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const target = creation?.target ?? null;
  const ref = target ? { board: target.board_id, list: target.key } : null;

  const read = async () => {
    if (!ref) return setLookups(null);
    const [categories, milestoneTypes, labels] = await Promise.all([
      api.getCategories(ref),
      api.getMilestoneTypes(ref),
      api.getProjectLabels(ref),
    ]);
    setLookups({ categories, milestoneTypes, labels });
  };

  // The drawer opens once they are read: a new project takes its first
  // category and its default milestone type from them.
  useEffect(() => {
    setLookups(null);
    read().catch((e) => {
      notifyError(errorMessage(e));
      onClose();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.board_id, target?.key]);

  return (
    <ProjectDrawer
      opened={creation !== null && lookups !== null}
      onClose={onClose}
      projectId={null}
      boardId={target ? String(target.board_id) : null}
      categories={lookups?.categories ?? []}
      context={null}
      listKey={target?.key}
      defaultName={creation?.source.title}
      defaultDescription={creation ? descriptionOf(creation.source, "Créé") : undefined}
      milestoneTypes={lookups?.milestoneTypes ?? []}
      users={users}
      labels={lookups?.labels ?? []}
      boards={boards}
      currentUser={currentUser}
      onLabelsChanged={() => read().catch((e) => notifyError(errorMessage(e)))}
      onCategoriesChanged={() => read().catch((e) => notifyError(errorMessage(e)))}
      onSaved={onClose}
      onDeleted={onClose}
      following={false}
      onToggleFollow={() => {}}
    />
  );
}
