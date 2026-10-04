import { Button, Group, Menu, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowMerge,
  IconCheck,
  IconChevronDown,
  IconCircleX,
  IconEye,
  IconPencil,
  IconSquarePlus,
  IconTags,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import { useRights } from "../../lib/rights";
import { useCallback, useEffect, useState } from "react";
import LabelsManager from "../board/LabelsManager";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import {
  ACTIONS_BUTTON_STYLE,
  ROW_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, { type PointMenuPosition } from "../ui/PointMenu";
import { supportTicketRef } from "@milo/shared";
import type { PublicUser, SupportLabel, SupportRequest } from "@milo/shared";
import CloseButton from "../ui/CloseButton";

/** The action awaiting its confirmation. */
type ToConfirm = "merge" | "close" | "delete" | null;

interface SupportActionsProps {
  /** The checked requests, in list order. */
  selected: SupportRequest[];
  users: PublicUser[];
  /** "Modifier": the checked request opens in its drawer. */
  onEdit: (request: SupportRequest) => void;
  /** "Créer une tâche", on right-click of a request. */
  onCreateTask?: (request: SupportRequest) => void;
  /** An action succeeded: the list is re-read, the checkboxes are unchecked. */
  onDone: () => void | Promise<void>;
  /** The list is re-read, the checkboxes stay checked. */
  onRefresh: () => void | Promise<void>;
  /**
   * Right-click on a row: its menu opens at the clicked point, and its
   * actions apply only to that request, checked or not.
   */
  context?: { request: SupportRequest; position: PointMenuPosition } | null;
  onContextClose?: () => void;
  /** The requests the person follows, for the "Suivre" checkmark. */
  followedIds?: number[];
  onToggleFollow?: (request: SupportRequest) => void;
}

/** "HLP-3, HLP-5 et HLP-8": the targeted tickets, as they are cited. */
const quote = (requests: SupportRequest[]): string => {
  const refs = requests.map((d) => supportTicketRef(d.number));
  return refs.length < 2
    ? (refs[0] ?? "")
    : `${refs.slice(0, -1).join(", ")} et ${refs.at(-1)}`;
};

/**
 * The Support mode's "Actions" menu, placed to the left of the companies
 * list. It only appears once a request is checked, and applies to them:
 * merge, close and delete ask for confirmation; "Assigner à" opens the
 * actor choice, and those actors are notified on screen and by e-mail.
 */
export default function SupportActions({
  selected,
  users,
  onEdit,
  onCreateTask,
  onDone,
  onRefresh,
  context = null,
  onContextClose,
  followedIds = [],
  onToggleFollow,
}: SupportActionsProps) {
  const [toConfirm, setToConfirm] = useState<ToConfirm>(null);
  /** Label management: shared by all of support. */
  const [managesLabels, setManagingLabels] = useState(false);
  const [labels, setLabels] = useState<SupportLabel[]>([]);
  const openLabels = () => setManagingLabels(true);
  const reloadLabels = useCallback(async () => {
    try {
      setLabels(await api.getSupportLabels());
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    if (managesLabels) void reloadLabels();
  }, [managesLabels, reloadLabels]);
  const [assignment, setAssignment] = useState(false);
  const [actors, setActors] = useState<string[]>([]);
  const [ongoing, setInProgress] = useState(false);

  /**
   * The request targeted by the right-click, while its confirmation or its
   * assignment completes: it then replaces the checked requests.
   */
  const [targets, setTargets] = useState<SupportRequest[] | null>(null);
  const targetedItems = targets ?? selected;
  const ids = targetedItems.map((d) => d.id);
  const n = targetedItems.length;
  // The merge keeps the most recent one: it is the one announced.
  const keptByKey = [...targetedItems].sort((a, b) =>
    a.created_at === b.created_at
      ? b.id - a.id
      : a.created_at < b.created_at
        ? 1
        : -1,
  )[0];
  const others = targetedItems.filter((d) => d !== keptByKey);

  // The actions follow the account's rights on support.
  const can = useRights();
  const canForRequests = (requests: SupportRequest[], right: "update" | "delete") =>
    requests.length > 0 && can("support", right);
  const editChecked = canForRequests(selected, "update");
  const deleteChecked = canForRequests(selected, "delete");
  const targetEdit = context
    ? canForRequests([context.request], "update")
    : false;
  const deleteTargeted = context
    ? canForRequests([context.request], "delete")
    : false;

  const execute = async (action: () => Promise<unknown>, success: string) => {
    setInProgress(true);
    try {
      await action();
      notifications.show({ color: "teal", message: success });
      await onDone();
    } catch (e) {
      notifyError(errorMessage(e), "Action impossible");
    } finally {
      setInProgress(false);
      setToConfirm(null);
      setTargets(null);
    }
  };

  const confirm = () => {
    if (toConfirm === "merge") {
      void execute(
        () => api.mergeSupportRequests(ids),
        `${quote(others)} ${others.length > 1 ? "fusionnées" : "fusionnée"} dans ${quote(keptByKey ? [keptByKey] : [])}`,
      );
    } else if (toConfirm === "close") {
      void execute(
        () => api.closeSupportRequests(ids),
        n > 1 ? `${n} demandes fermées` : "Demande fermée",
      );
    } else if (toConfirm === "delete") {
      void execute(
        () => api.deleteSupportRequests(ids),
        n > 1 ? `${n} demandes supprimées` : "Demande supprimée",
      );
    }
  };

  const assign = async () => {
    if (!actors.length) return;
    await execute(
      () => api.assignSupportRequests(ids, actors.map(Number)),
      n > 1 ? `${n} demandes assignées` : "Demande assignée",
    );
    setAssignment(false);
  };

  const texts: Record<
    Exclude<ToConfirm, null>,
    { title: string; message: string; button: string; color: string }
  > = {
    merge: {
      title: "Fusionner les demandes",
      message: `${quote(others)} ${others.length > 1 ? "seront fusionnées" : "sera fusionnée"} dans ${quote(
        keptByKey ? [keptByKey] : [],
      )}, la plus récente : ses échanges, ses acteurs et ses étiquettes y seront repris, puis ${
        others.length > 1 ? "elles seront fermées" : "elle sera fermée"
      }.`,
      button: "Fusionner",
      color: "teal",
    },
    close: {
      title: n > 1 ? "Fermer les demandes" : "Fermer la demande",
      message: `${quote(targetedItems)} ${n > 1 ? "passeront" : "passera"} au statut « Fermé ».`,
      button: "Fermer",
      color: "teal",
    },
    delete: {
      title: n > 1 ? "Supprimer les demandes" : "Supprimer la demande",
      message: `${quote(targetedItems)} ${
        n > 1 ? "seront supprimées" : "sera supprimée"
      }, avec leurs échanges. Cette action est irréversible.`,
      button: "Supprimer",
      color: RED,
    },
  };
  const text = toConfirm ? texts[toConfirm] : null;

  return (
    <>
      {/* Only the menu disappears: the confirmations and the inboxes stay
          mounted, they still close after the checkboxes have been
          unchecked. */}
      {selected.length > 0 && (
        <Menu
          position="bottom-end"
          withinPortal
          offset={ROW_MENU_OFFSET}
          styles={TAB_MENU_STYLES}
        >
          <Menu.Target>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              rightSection={<IconChevronDown size={14} />}
              style={ACTIONS_BUTTON_STYLE}
            >
              Actions ({selected.length})
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {/* Edit only applies to one request at a time: it is its drawer
              that opens. */}
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              disabled={n !== 1 || !editChecked}
              onClick={() => selected[0] && onEdit(selected[0])}
            >
              Modifier
            </Menu.Item>
            <Menu.Item
              leftSection={<IconUserPlus size={16} />}
              disabled={n === 0 || !editChecked}
              onClick={() => {
                setActors([]);
                setAssignment(true);
              }}
            >
              Assigner à
            </Menu.Item>
            <Menu.Item
              leftSection={<IconArrowMerge size={16} />}
              disabled={n < 2 || !editChecked}
              onClick={() => setToConfirm("merge")}
            >
              Fusionner
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCircleX size={16} />}
              disabled={n === 0 || !editChecked}
              onClick={() => setToConfirm("close")}
            >
              Fermer
            </Menu.Item>
            <Menu.Divider />
            {/* Labels are shared by all of support, not specific to the
              checked requests: this action requires none. */}
            <Menu.Item
              leftSection={<IconTags size={16} />}
              disabled={!can("support", "update")}
              onClick={openLabels}
            >
              Étiquettes
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color={RED}
              leftSection={<IconTrash size={16} />}
              disabled={n === 0 || !deleteChecked}
              onClick={() => setToConfirm("delete")}
            >
              Supprimer
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}

      {/* Right-click on a row: its actions, for it alone. */}
      {context && (
        <PointMenu
          position={context.position}
          onClose={() => onContextClose?.()}
        >
          {/* Follow comes first, as in the request's drawer. The
              menu does not close, so the checkmark can be seen changing. */}
          {onToggleFollow && (
            <>
              <Menu.Item
                leftSection={<IconEye size={16} />}
                rightSection={
                  followedIds.includes(context.request.id) ? (
                    <IconCheck size={14} />
                  ) : null
                }
                onClick={() => onToggleFollow(context.request)}
                closeMenuOnClick={false}
              >
                Suivre
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          {/* Without the right to edit, the request still opens on a click
              on its row, to be read. */}
          {targetEdit && (
            <>
              <Menu.Item
                leftSection={<IconPencil size={16} />}
                onClick={() => onEdit(context.request)}
              >
                Modifier
              </Menu.Item>
              <Menu.Item
                leftSection={<IconUserPlus size={16} />}
                onClick={() => {
                  setTargets([context.request]);
                  setActors([]);
                  setAssignment(true);
                }}
              >
                Assigner à
              </Menu.Item>
            </>
          )}
          {onCreateTask && (
            <Menu.Item
              leftSection={<IconSquarePlus size={16} />}
              onClick={() => onCreateTask(context.request)}
            >
              Créer une tâche
            </Menu.Item>
          )}
          {deleteTargeted && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => {
                  setTargets([context.request]);
                  setToConfirm("delete");
                }}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={text !== null}
        onClose={() => {
          if (ongoing) return;
          setToConfirm(null);
          setTargets(null);
        }}
        onConfirm={confirm}
        title={text?.title}
        message={text?.message}
        confirmLabel={text?.button}
        cancelLabel="Annuler"
        confirmColor={text?.color}
      />

      <Modal
        opened={managesLabels}
        onClose={() => setManagingLabels(false)}
        title="Étiquettes"
        withCloseButton={false}
        centered
        size="lg"
        padding={MODAL_PADDING}
        styles={modalHeaderStyles(MODAL_PADDING)}
      >
        <Stack gap="md">
          <LabelsManager
            labels={labels}
            emptyText="Aucune étiquette"
            carriers="des demandes qui la portent"
            withWeight
            onCreate={async (name, color, weight) => {
              await api.createSupportLabel(name, color, weight);
              await reloadLabels();
            }}
            onUpdate={async (id, data) => {
              await api.updateSupportLabel(id, data);
              await reloadLabels();
            }}
            onReorder={async (ids) => {
              await api.reorderSupportLabels(ids);
              await reloadLabels();
            }}
            onDelete={async (id) => {
              await api.deleteSupportLabel(id);
              await reloadLabels();
            }}
          />
          {/* Each action on a label is sent to the server right away:
              "Enregistrer" closes and has the list re-read, so that the
              requests show the labels as they were just
              left. "Fermer" simply closes. */}
          <Group justify="flex-end" mt={MODAL_PADDING - 16}>
            <CloseButton onClick={() => setManagingLabels(false)} />
            <Button
              color="teal"
              onClick={async () => {
                setManagingLabels(false);
                await onRefresh();
              }}
            >
              Enregistrer
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={assignment}
        onClose={() => {
          if (ongoing) return;
          setAssignment(false);
          setTargets(null);
        }}
        title={n > 1 ? `Assigner ${n} demandes` : `Assigner ${quote(targetedItems)}`}
        centered
        padding={MODAL_PADDING}
        withCloseButton={false}
        // The actor list comes out of the modal, like any menu: the content
        // does not clip it. The header alone then keeps the rounded corners.
        styles={(() => {
          const base = modalHeaderStyles(MODAL_PADDING);
          return {
            ...base,
            content: { overflow: "visible" },
            header: {
              ...base.header,
              borderTopLeftRadius: "inherit",
              borderTopRightRadius: "inherit",
            },
          };
        })()}
      >
        <Stack gap="md">
          <Text size="xs" c="dimmed">
            Les acteurs sélectionnés ci-dessous seront ajoutés à la liste
            existante et informés aussitôt.
          </Text>
          <ActorPicker
            label="Acteurs"
            users={users}
            value={actors}
            onChange={setActors}
          />
          <Group justify="flex-end" mt={MODAL_PADDING - 16}>
            <CloseButton
              onClick={() => {
                setAssignment(false);
                setTargets(null);
              }}
              disabled={ongoing}
            />
            <Button
              color="teal"
              onClick={assign}
              loading={ongoing}
              disabled={!actors.length}
            >
              Assigner
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
