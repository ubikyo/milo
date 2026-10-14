import { Button, Menu, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowMerge,
  IconCheck,
  IconChevronDown,
  IconCircleX,
  IconEye,
  IconPencil,
  IconSquarePlus,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import { useRights } from "../../lib/rights";
import { useImperativeHandle, useState, type Ref } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { PLUS_SIZE } from "../../themes/plus";
import AddButton from "../ui/AddButton";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, { type PointMenuPosition } from "../ui/PointMenu";
import { supportTicketRef } from "@milo/shared";
import type { PublicUser, SupportRequest } from "@milo/shared";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import { themeWindow } from "../../lib/themeWindow";

/** The action awaiting its confirmation. */
type ToConfirm = "merge" | "close" | "delete" | null;

interface SupportActionsProps {
  /** The checked requests, in list order. */
  selected: SupportRequest[];
  users: PublicUser[];
  /** "Modifier", on right-click: the request opens in its drawer. */
  onEdit: (request: SupportRequest) => void;
  /** "Créer une tâche", on right-click of a request. */
  onCreateTask?: (request: SupportRequest) => void;
  /** An action succeeded: the list is re-read, the checkboxes are unchecked. */
  onDone: () => void | Promise<void>;
  /** What "Actions multiples", under the list, runs on the checked requests. */
  bulkRef?: Ref<(action: BulkAction) => void>;
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

/** What "Actions multiples" does with the checked requests. */
export type BulkAction = "assign" | "merge" | "close" | "delete";

/**
 * "Actions multiples", under the requests list's "Ajouter un ticket": it only
 * appears once a request is checked, and applies to them. The action itself
 * runs in "SupportActions", where its confirmations live.
 */
export function SupportBulkMenu({
  selected,
  onAction,
  height,
}: {
  selected: SupportRequest[];
  onAction: (action: BulkAction) => void;
  /** That of "Ajouter un ticket", above it. */
  height?: number;
}) {
  const can = useRights();
  const n = selected.length;
  if (n === 0) return null;
  const canEdit = can("support", "update");
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        {/* The look of "Ajouter un ticket", right above it; the chevron takes
            the place of its "+". */}
        <AddButton
          label={`Actions multiples (${n})`}
          leftSection={<IconChevronDown size={PLUS_SIZE} />}
          onClick={() => {}}
          h={height}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconUserPlus size={16} />}
          disabled={!canEdit}
          onClick={() => onAction("assign")}
        >
          Assigner à
        </Menu.Item>
        <Menu.Item
          leftSection={<IconArrowMerge size={16} />}
          disabled={n < 2 || !canEdit}
          onClick={() => onAction("merge")}
        >
          Fusionner
        </Menu.Item>
        <Menu.Item
          leftSection={<IconCircleX size={16} />}
          disabled={!canEdit}
          onClick={() => onAction("close")}
        >
          Fermer
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color={RED}
          leftSection={<IconTrash size={16} />}
          disabled={!can("support", "delete")}
          onClick={() => onAction("delete")}
        >
          Supprimer
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * The Support mode's request actions: the right-click menu of a row, and the
 * confirmations and actor choice of "Actions multiples" (SupportBulkMenu).
 * Merge, close and delete ask for confirmation; "Assigner à" opens the
 * actor choice, and those actors are notified on screen and by e-mail.
 */
export default function SupportActions({
  selected,
  users,
  onEdit,
  onCreateTask,
  onDone,
  bulkRef,
  context = null,
  onContextClose,
  followedIds = [],
  onToggleFollow,
}: SupportActionsProps) {
  const [toConfirm, setToConfirm] = useState<ToConfirm>(null);
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

  // "Actions multiples", under the list: on the checked requests.
  useImperativeHandle(
    bulkRef,
    () => (action: BulkAction) => {
      setTargets(null);
      if (action === "assign") {
        setActors([]);
        setAssignment(true);
      } else {
        setToConfirm(action);
      }
    },
    [],
  );

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
        attributes={themeWindow("support-assign")}
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
            kind="helpdesk"
            label="Acteurs"
            users={users}
            value={actors}
            onChange={setActors}
          />
          <Footer parentGap="var(--mantine-spacing-md)">
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
          </Footer>
        </Stack>
      </Modal>
    </>
  );
}
