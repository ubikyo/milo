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

/** L'action qui attend sa confirmation. */
type ToConfirm = "merge" | "close" | "delete" | null;

interface SupportActionsProps {
  /** Les demandes cochées, dans l'ordre de la liste. */
  selected: SupportRequest[];
  users: PublicUser[];
  /** « Modifier » : la demande cochée s'ouvre dans son tiroir. */
  onEdit: (request: SupportRequest) => void;
  /** « Créer une tâche », au clic droit sur une demande. */
  onCreateTask?: (request: SupportRequest) => void;
  /** Une action a abouti : la liste se relit, les cases se décochent. */
  onDone: () => void | Promise<void>;
  /** La liste se relit, les cases restent cochées. */
  onRefresh: () => void | Promise<void>;
  /**
   * Le clic droit sur une ligne : son menu s'ouvre au point cliqué, et ses
   * gestes ne portent que sur cette demande, cochée ou non.
   */
  context?: { request: SupportRequest; position: PointMenuPosition } | null;
  onContextClose?: () => void;
  /** Les demandes que la personne suit, pour la coche de « Suivre ». */
  followedIds?: number[];
  onToggleFollow?: (request: SupportRequest) => void;
}

/** « HLP-3, HLP-5 et HLP-8 » : les tickets visés, tels qu'on les cite. */
const quote = (requests: SupportRequest[]): string => {
  const refs = requests.map((d) => supportTicketRef(d.number));
  return refs.length < 2
    ? (refs[0] ?? "")
    : `${refs.slice(0, -1).join(", ")} et ${refs.at(-1)}`;
};

/**
 * Le menu « Actions » du mode Support, posé à gauche de la liste des
 * sociétés. Il ne paraît qu'une fois une demande cochée, et porte sur elles : fusionner, fermer et supprimer
 * demandent confirmation ; « Assigner à » ouvre le choix des acteurs, qui
 * sont prévenus à l'écran et par e-mail.
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
  /** La gestion des étiquettes : communes à tout le support. */
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
   * La demande visée par le clic droit, le temps que sa confirmation ou son
   * assignation aboutisse : elle remplace alors les demandes cochées.
   */
  const [targets, setTargets] = useState<SupportRequest[] | null>(null);
  const targetedItems = targets ?? selected;
  const ids = targetedItems.map((d) => d.id);
  const n = targetedItems.length;
  // La fusion garde la plus récente : c'est elle qu'on annonce.
  const keptByKey = [...targetedItems].sort((a, b) =>
    a.created_at === b.created_at
      ? b.id - a.id
      : a.created_at < b.created_at
        ? 1
        : -1,
  )[0];
  const others = targetedItems.filter((d) => d !== keptByKey);

  // Les gestes suivent les droits du compte sur le support.
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
      {/* Seul le menu s'efface : les confirmations et les boîtes restent
          montées, elles se referment encore après que les cases se sont
          décochées. */}
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
            {/* Modifier ne vaut que pour une demande à la fois : c'est son tiroir
              qui s'ouvre. */}
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
            {/* Les étiquettes sont communes à tout le support, pas propres aux
              demandes cochées : ce geste n'en demande aucune. */}
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

      {/* Le clic droit sur une ligne : ses gestes, pour elle seule. */}
      {context && (
        <PointMenu
          position={context.position}
          onClose={() => onContextClose?.()}
        >
          {/* Suivre vient en tête, comme dans le tiroir de la demande. Le
              menu ne se referme pas, pour qu'on voie la coche changer. */}
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
          {/* Sans le droit de modifier, la demande s'ouvre encore d'un clic
              sur sa ligne, pour être lue. */}
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
          {/* Chaque geste sur une étiquette part aussitôt au serveur :
              « Enregistrer » referme et fait relire la liste, pour que les
              demandes montrent les étiquettes telles qu'on vient de les
              laisser. « Fermer » referme simplement. */}
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
        // La liste des acteurs sort de la fenêtre, comme tout menu : le contenu
        // ne la rogne pas. L'en-tête garde alors seul les coins arrondis.
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
