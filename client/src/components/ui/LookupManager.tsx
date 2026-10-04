import { Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ListItems from "./ListItems";
import type { RowAction } from "./ListItems";
import type { ComponentType, ReactNode } from "react";

/**
 * What a row must carry. The number of attached projects only applies to
 * companies and categories: it says what deletion would take along.
 */
export interface LookupItem {
  id: number;
  name: string;
  project_count?: number;
}
import { errorMessage, notifyError } from "../../lib/errors";

/**
 * Editable list for resources that only have a name: companies and categories.
 * The presentation comes from ListItems; this component only adds the editing
 * of a label.
 *
 * Everything happens on the row: clicking the name edits it in place (Enter
 * saves, Escape cancels, leaving the field saves). The last row is a permanent
 * add field that keeps focus: entries can be chained.
 */
interface LookupManagerProps {
  items: LookupItem[];
  addTitle: string;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: number, name: string) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText?: ReactNode;
  entityLabel: string;
  maxRows?: number;
  minRows?: number;
  /**
   * Actions specific to a resource, at the top of the row menu, before
   * "Modifier" and "Supprimer" — a milestone type's milestones, for example.
   */
  renderActions?: (item: LookupItem) => RowAction[];
  /**
   * Always-visible labels, at the right edge of the row — what a company has
   * configured, for example.
   */
  renderTags?: (item: LookupItem) => ReactNode;
  /** Without it, everything can be deleted; the administrator role, however, stays. */
  canDelete?: (item: LookupItem) => boolean;
  /**
   * What the add row carries after the name — the event of a default answer.
   * The caller keeps its value, and reads it on add.
   */
  addEnd?: ReactNode;
}

/**
 * What deletion will take along. Moved out of the list body: the plural and an
 * optional count inside a JSX attribute read poorly, and forced the "nothing to
 * delete" check to be repeated.
 */
function DeletionMessage({ item }: { item: LookupItem | null }) {
  if (!item) return null;
  const projects = item.project_count ?? 0;

  // An item that is still in use cannot be deleted: the server refuses, and
  // says by how many resources. We say so right here when we already know.
  return projects > 0 ? (
    <>
      « {item.name} » est utilisé dans{" "}
      <strong>
        {projects} projet{projects > 1 ? "s" : ""}
      </strong>{" "}
      : il ne pourra pas être supprimé tant qu'il leur est rattaché.
    </>
  ) : (
    <>Voulez-vous vraiment supprimer « {item.name} » ? Cette action est irréversible.</>
  );
}

// Height of the field that renames a row: that of the text it replaces, so
// the row does not jump.
const FIELD_HEIGHT = 22;

// The right inset of a row that carries labels: tight, so that the gap to the
// edge reads like the top one. Tuned by eye — the calculation ((row - label) /
// 2 = 8 px) still looked too wide.
const TAG_PADDING = 5;

export default function LookupManager({
  items,
  addTitle,
  onCreate,
  onUpdate,
  onDelete,
  emptyIcon,
  emptyText,
  entityLabel,
  maxRows,
  minRows,
  renderActions,
  renderTags,
  canDelete,
  addEnd,
}: LookupManagerProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LookupItem | null>(null);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (item: LookupItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    // An emptied or unchanged name: close without asking the server anything.
    const name = editingName.trim();
    const item = items.find((i) => i.id === editingId);
    if (!name || name === item?.name || editingId === null) return cancelEdit();
    if (await run(() => onUpdate(editingId, name))) cancelEdit();
  };

  // The add field keeps focus: the next entry chains on.
  const create = async () => {
    if (!newName.trim()) return;
    if (await run(() => onCreate(newName.trim()))) setNewName("");
  };

  return (
    <Stack gap="sm">

      <ListItems
        maxRows={maxRows}
        minRows={minRows}
        isEmpty={items.length === 0}
        emptyIcon={emptyIcon}
        emptyText={emptyText}
        add={{
          placeholder: addTitle,
          value: newName,
          onChange: setNewName,
          onSubmit: create,
          onCancel: () => setNewName(""),
          disabled: busy,
          end: addEnd,
        }}
      >
        {items.map((item) => (
          <ListItems.Row
            key={item.id}
            paddingRight={renderTags ? TAG_PADDING : undefined}
            actions={[
              ...(renderActions?.(item) ?? []),
              {
                label: "Modifier",
                icon: IconPencil,
                onClick: () => startEdit(item),
              },
              ...(canDelete && !canDelete(item)
                ? []
                : [
                    {
                      label: "Supprimer",
                      icon: IconTrash,
                      onClick: () => setPendingDelete(item),
                      danger: true,
                    },
                  ]),
            ]}
          >
            <>
              {editingId === item.id ? (
                <TextInput
                  value={editingName}
                  onChange={(e) => setEditingName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEdit();
                    }
                    if (e.key === "Escape") cancelEdit();
                  }}
                  onBlur={saveEdit}
                  // No frame: the row does not move when it goes into edit
                  // mode, only the cursor signals the input.
                  variant="unstyled"
                  size="sm"
                  style={{ flex: 1, minWidth: 0 }}
                  // An "sm" field is 36 px, more than the row (34): it
                  // overflowed under the last one, the list grew, and focus
                  // made it scroll to show it entirely — everything went up a
                  // notch. Brought down to the text's height, it fits in its
                  // row.
                  styles={{
                    input: {
                      height: FIELD_HEIGHT,
                      minHeight: FIELD_HEIGHT,
                      lineHeight: `${FIELD_HEIGHT}px`,
                    },
                  }}
                  disabled={busy}
                  autoFocus
                  aria-label={`Renommer ${item.name}`}
                />
              ) : (
                <UnstyledButton
                  onClick={() => startEdit(item)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Text size="sm" truncate>
                    {item.name}
                  </Text>
                </UnstyledButton>
              )}

              {editingId !== item.id && renderTags?.(item)}
            </>
          </ListItems.Row>
        ))}
      </ListItems>

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await run(() => onDelete(pendingDelete.id));
          setPendingDelete(null);
        }}
        title={`Supprimer ${entityLabel}`}
        message={<DeletionMessage item={pendingDelete} />}
      />
    </Stack>
  );
}
