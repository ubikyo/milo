import { Group, Input, Menu, Select, Stack } from "@mantine/core";
import { IconTemplate, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { Id, SupportVariableGroup } from "@milo/shared";
import { errorMessage } from "../../lib/errors";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  ROUNDING,
  RowButton,
  RowField,
  EmptyList,
  ROW_INSET,
  INPUT_STYLE,
  rowStyle,
} from "../ui/LignesDuTiroir";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import SupportReplyModal from "./SupportReplyModal";
import type { ComponentType } from "react";

// Une liste de modèles du Support, au Paramétrage : les notifications
// automatiques, les contenus par défaut. Elle se présente comme les listes
// des tiroirs (ChampsColonnes) : une ligne par modèle, son intitulé à même la
// ligne, l'évènement qui s'en sert — un seul par modèle, et un seul modèle
// par évènement —, puis le bouton « Modèle » qui ouvre son HTML. Le clic
// droit le supprime ; « Ajouter » pose une ligne vide, créée dès qu'elle a
// un intitulé.

/** De quoi lire « Demande prise en charge ». */
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
  /** Les évènements que portent déjà les autres modèles : grisés. */
  taken: E[];
  disabled?: boolean;
}

/** L'évènement d'un modèle : un champ « xs » de la ligne. */
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
  /** Le bouton d'ajout, et ce qu'on supprime : « la réponse ». */
  addTitle: string;
  entityLabel: string;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText: string;
  canEdit: boolean;
  onError: (message: string) => void;
  /** Les provenances de variables que ses modèles peuvent citer. */
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
  // Les modèles, et celui dont la fenêtre est ouverte.
  const [templates, setTemplates] = useState<Template<E>[]>([]);
  const [templateOf, setTemplateOf] = useState<Id | null>(null);
  // La ligne ajoutée, en attente de son intitulé.
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{ template: Template<E>; position: PointMenuPosition } | null>(
    null,
  );
  const [toDelete, setToDelete] = useState<Template<E> | null>(null);

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

  /** Un appel à l'API, suivi de la relecture des modèles. */
  const write = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError(errorMessage(e));
    }
    await reload();
  };

  /** Les évènements déjà pris, sauf celui du modèle donné. */
  const takenEvents = (except?: Id): E[] =>
    templates.flatMap((m) => (m.id !== except && m.event ? [m.event] : []));

  const total = templates.length + (adding ? 1 : 0);

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
                onContextMenu={(e) => {
                  if (!canEdit) return;
                  setMenu({ template: m, position: menuPosition(e) });
                }}
                style={{ ...rowStyle(rank, total, false), paddingLeft: ROW_INSET }}
              >
                <RowField
                  name={m.name}
                  placeholder="Intitulé"
                  label={`Intitulé de ${m.name}`}
                  onValidate={(name) => {
                    if (name && name !== m.name) void write(() => updateStatement(m.id, { name: name }));
                  }}
                />
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
                  // À 5 px du bout de la ligne, retrait compris.
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
                style={{ ...rowStyle(total - 1, total, false), paddingLeft: ROW_INSET }}
              >
                <RowField
                  name=""
                  placeholder="Intitulé"
                  label={`Intitulé de ${entityLabel}`}
                  autoFocus
                  // Quittée sans intitulé, la ligne s'efface ; nommée, elle est
                  // créée, sans évènement : il se choisit ensuite sur sa ligne.
                  onValidate={(name) => {
                    setAdding(false);
                    if (name) void write(() => create(name, null));
                  }}
                />
              </Group>
            )}
          </Stack>
        )}
        {/* Au plus près de la liste qu'il allonge. */}
        {canEdit && <AddButton label={addTitle} onClick={() => setAdding(true)} mt={4} />}
      </Input.Wrapper>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              setToDelete(menu.template);
              setMenu(null);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          const m = toDelete;
          setToDelete(null);
          if (m) await write(() => remove(m.id));
        }}
        title={`Supprimer ${entityLabel}`}
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Cette action est
            irréversible.
          </>
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
