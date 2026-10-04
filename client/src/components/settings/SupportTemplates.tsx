import { Box, Group, Input, Select, Stack } from "@mantine/core";
import { IconTemplate } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { Id, SupportVariableGroup } from "@milo/shared";
import { errorMessage } from "../../lib/errors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  ROUNDING,
  RowButton,
  RowField,
  RowCheckbox,
  RowCheckboxSpace,
  ListFooter,
  useRowSelection,
  EmptyList,
  ROW_INSET,
  NAME_INSET,
  INPUT_STYLE,
  pluralize,
  rowStyle,
} from "../ui/DrawerRows";
import SupportReplyModal from "./SupportReplyModal";
import type { ComponentType, ReactNode } from "react";

// A list of Support templates, in Settings ("Paramétrage"): the automatic
// notifications, the default contents. It looks like the drawer lists
// (ColumnFields): one row per template, its title inline in the
// row, the event that uses it — only one per template, and only one template
// per event —, then the "Modèle" button that opens its HTML. Checked
// templates are deleted together; "Ajouter" adds an empty row, created as
// soon as it has a title.


/** Wide enough to read "Demande prise en charge". */
const EVENT_WIDTH = 190;

interface Template<E extends string> {
  id: Id;
  name: string;
  html: string;
  event: E | null;
}

interface EventChoiceProps<E extends string> {
  events: readonly { value: E; label: string }[];
  value: E | null;
  onChange: (event: E | null) => void;
  /** The events already carried by the other templates: grayed out. */
  taken: E[];
  disabled?: boolean;
}

/** A template's event: an "xs" field of the row. */
function EventChoice<E extends string>({
  events,
  value,
  onChange,
  taken,
  disabled,
}: EventChoiceProps<E>) {
  const [entered, setEntered] = useState(false);
  return (
    <Select
      data={events.map((e) => ({
        value: e.value,
        label: e.label,
        disabled: taken.includes(e.value),
      }))}
      value={value}
      onChange={(v) => onChange(events.find((e) => e.value === v)?.value ?? null)}
      placeholder="Aucun évènement"
      allowDeselect
      size="xs"
      radius={ROUNDING}
      w={EVENT_WIDTH}
      style={{ flexShrink: 0 }}
      comboboxProps={{ withinPortal: true }}
      onFocus={() => setEntered(true)}
      onBlur={() => setEntered(false)}
      styles={entered ? { input: INPUT_STYLE } : undefined}
      disabled={disabled}
      aria-label="Évènement"
    />
  );
}

interface SupportTemplatesProps<E extends string> {
  label: string;
  events: readonly { value: E; label: string }[];
  load: () => Promise<Template<E>[]>;
  create: (name: string, event: E | null) => Promise<unknown>;
  updateStatement: (id: Id, data: { name?: string; html?: string; event?: E | null }) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
  /**
   * The add button, and what is being deleted: "la réponse" — its noun, in
   * the plural, names several: "3 réponses".
   */
  addTitle: string;
  entityLabel: string;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText: string;
  canEdit: boolean;
  onError: (message: string) => void;
  /** The variable sources its templates may cite. */
  variableGroups?: readonly SupportVariableGroup[];
}

export default function SupportTemplates<E extends string>({
  label,
  events,
  load,
  create,
  updateStatement,
  remove,
  addTitle,
  entityLabel,
  emptyIcon,
  emptyText,
  canEdit,
  onError,
  variableGroups,
}: SupportTemplatesProps<E>) {
  // The templates, and the one whose modal is open.
  const [templates, setTemplates] = useState<Template<E>[]>([]);
  const [templateOf, setTemplateOf] = useState<Id | null>(null);
  // The added row, waiting for its title.
  const [adding, setAdding] = useState(false);
  // The checked templates, and those awaiting confirmation of their deletion.
  const selection = useRowSelection(templates.map((m) => m.id));
  const [toDelete, setToDelete] = useState<Template<E>[]>([]);

  const reload = useCallback(async () => {
    try {
      setTemplates(await load());
    } catch (e) {
      onError(errorMessage(e));
    }
  }, [load, onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** An API call, followed by re-reading the templates. */
  const write = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError(errorMessage(e));
    }
    await reload();
  };

  /** The events already taken, except the given template's. */
  const takenEvents = (except?: Id): E[] =>
    templates.flatMap((m) => (m.id !== except && m.event ? [m.event] : []));

  const total = templates.length + (adding ? 1 : 0);

  /** "la réponse" → "3 réponses". */
  const several = (n: number) => pluralize(n, entityLabel.replace(/^(la |le |l')/, ""));

  /**
   * A row's name field: with a checkbox in front (canEdit), it moves back to
   * align with it, as in the drawer lists.
   */
  const nameSlot = (field: ReactNode) =>
    canEdit ? (
      <Box style={{ flex: 1, minWidth: 0, display: "flex", marginLeft: -NAME_INSET }}>{field}</Box>
    ) : (
      field
    );

  /** A row's style: the default inset with a checkbox, ROW_INSET without. */
  const templateRowStyle = (rank: number) => ({
    ...rowStyle(rank, total, false),
    ...(canEdit ? null : { paddingLeft: ROW_INSET }),
  });

  return (
    <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <Input.Wrapper label={label}>
        {total === 0 ? (
          <EmptyList icon={emptyIcon} message={emptyText} />
        ) : (
          <Stack gap={1}>
            {templates.map((m, rank) => (
              <Group
                key={m.id}
                gap="sm"
                wrap="nowrap"
                style={templateRowStyle(rank)}
              >
                {canEdit && (
                  <RowCheckbox
                    label={`Sélectionner ${m.name}`}
                    checked={selection.isChecked(m.id)}
                    onChange={(on) => selection.toggle(m.id, on)}
                  />
                )}
                {nameSlot(
                  <RowField
                    name={m.name}
                    placeholder="Intitulé"
                    label={`Intitulé de ${m.name}`}
                    onValidate={(name) => {
                      if (name && name !== m.name) void write(() => updateStatement(m.id, { name: name }));
                    }}
                  />,
                )}
                <EventChoice
                  events={events}
                  value={m.event}
                  onChange={(event) => void write(() => updateStatement(m.id, { event }))}
                  taken={takenEvents(m.id)}
                  disabled={!canEdit}
                />
                <RowButton
                  icon={IconTemplate}
                  onClick={() => setTemplateOf(m.id)}
                  // 5 px from the end of the row, padding included.
                  rightMargin={5 - ROW_INSET}
                >
                  Modèle
                </RowButton>
              </Group>
            ))}
            {adding && (
              <Group
                gap="sm"
                wrap="nowrap"
                style={templateRowStyle(total - 1)}
              >
                {/* Not created yet: nothing to delete, an empty space in place
                    of the checkbox. */}
                {canEdit && <RowCheckboxSpace />}
                {nameSlot(
                  <RowField
                    name=""
                    placeholder="Intitulé"
                    label={`Intitulé de ${entityLabel}`}
                    autoFocus
                    // Left without a title, the row disappears; named, it is
                    // created, with no event: it is chosen afterwards on its
                    // row.
                    onValidate={(name) => {
                      setAdding(false);
                      if (name) void write(() => create(name, null));
                    }}
                  />,
                )}
              </Group>
            )}
          </Stack>
        )}
        {/* As close as possible to the list it extends. */}
        {canEdit && (
          <ListFooter
            addLabel={addTitle}
            onAdd={() => setAdding(true)}
            checkedCount={selection.checked.length}
            onDeleteChecked={() =>
              setToDelete(templates.filter((m) => selection.isChecked(m.id)))
            }
          />
        )}
      </Input.Wrapper>

      <DeleteConfirmModal
        opened={toDelete.length > 0}
        onClose={() => setToDelete([])}
        onConfirm={async () => {
          const list = toDelete;
          setToDelete([]);
          selection.reset();
          await write(() => Promise.all(list.map((m) => remove(m.id))));
        }}
        title={
          toDelete.length > 1 ? `Supprimer ${several(toDelete.length)}` : `Supprimer ${entityLabel}`
        }
        message={
          toDelete.length > 1 ? (
            <>
              Voulez-vous vraiment supprimer ces {several(toDelete.length)} ? Cette action est
              irréversible.
            </>
          ) : (
            <>
              Voulez-vous vraiment supprimer « {toDelete[0]?.name} » ? Cette action est
              irréversible.
            </>
          )
        }
      />

      <SupportReplyModal
        reply={templates.find((m) => m.id === templateOf) ?? null}
        onClose={() => setTemplateOf(null)}
        onSave={async (template: { html: string }) => {
          if (templateOf !== null) await updateStatement(templateOf, template);
          await reload();
        }}
        canEdit={canEdit}
        groups={variableGroups}
      />
    </fieldset>
  );
}
