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
import { useCallback, useEffect, useState } from "react";
import LabelsManager from "../board/LabelsManager";
import { api } from "../../api";
import { messageErreur } from "../../lib/errors";
import { NEUTRAL_HOVER, RED } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, { type PointMenuPosition } from "../ui/PointMenu";
import { supportTicketRef } from "@milo/shared";
import type { CSSProperties } from "react";
import type { PublicUser, SupportLabel, SupportRequest } from "@milo/shared";
import BoutonFermer from "../ui/BoutonFermer";

/** L'action qui attend sa confirmation. */
type AConfirmer = "merge" | "close" | "delete" | null;

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
  contexte?: { demande: SupportRequest; position: PointMenuPosition } | null;
  onContexteClose?: () => void;
  /** Les demandes que la personne suit, pour la coche de « Suivre ». */
  followedIds?: number[];
  onToggleFollow?: (request: SupportRequest) => void;
}

/** « HLP-3, HLP-5 et HLP-8 » : les tickets visés, tels qu'on les cite. */
const citer = (demandes: SupportRequest[]): string => {
  const refs = demandes.map((d) => supportTicketRef(d.number));
  return refs.length < 2 ? (refs[0] ?? "") : `${refs.slice(0, -1).join(", ")} et ${refs.at(-1)}`;
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
  contexte = null,
  onContexteClose,
  followedIds = [],
  onToggleFollow,
}: SupportActionsProps) {
  const [aConfirmer, setAConfirmer] = useState<AConfirmer>(null);
  /** La gestion des étiquettes : communes à tout le support. */
  const [gereEtiquettes, setGereEtiquettes] = useState(false);
  const [etiquettes, setEtiquettes] = useState<SupportLabel[]>([]);
  const ouvrirEtiquettes = () => setGereEtiquettes(true);
  const relireEtiquettes = useCallback(async () => {
    try {
      setEtiquettes(await api.getSupportLabels());
    } catch (e) {
      notifications.show({ color: RED, message: messageErreur(e) });
    }
  }, []);
  useEffect(() => {
    if (gereEtiquettes) void relireEtiquettes();
  }, [gereEtiquettes, relireEtiquettes]);
  const [assignation, setAssignation] = useState(false);
  const [acteurs, setActeurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);

  /**
   * La demande visée par le clic droit, le temps que sa confirmation ou son
   * assignation aboutisse : elle remplace alors les demandes cochées.
   */
  const [cibles, setCibles] = useState<SupportRequest[] | null>(null);
  const vises = cibles ?? selected;
  const ids = vises.map((d) => d.id);
  const n = vises.length;
  // La fusion garde la plus récente : c'est elle qu'on annonce.
  const gardee = [...vises].sort((a, b) =>
    a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1,
  )[0];
  const autres = vises.filter((d) => d !== gardee);

  const executer = async (action: () => Promise<unknown>, succes: string) => {
    setEnCours(true);
    try {
      await action();
      notifications.show({ color: "teal", message: succes });
      await onDone();
    } catch (e) {
      notifications.show({
        color: RED,
        title: "Action impossible",
        message: messageErreur(e),
      });
    } finally {
      setEnCours(false);
      setAConfirmer(null);
      setCibles(null);
    }
  };

  const confirmer = () => {
    if (aConfirmer === "merge") {
      void executer(
        () => api.mergeSupportRequests(ids),
        `${citer(autres)} ${autres.length > 1 ? "fusionnées" : "fusionnée"} dans ${citer(gardee ? [gardee] : [])}`,
      );
    } else if (aConfirmer === "close") {
      void executer(
        () => api.closeSupportRequests(ids),
        n > 1 ? `${n} demandes fermées` : "Demande fermée",
      );
    } else if (aConfirmer === "delete") {
      void executer(
        () => api.deleteSupportRequests(ids),
        n > 1 ? `${n} demandes supprimées` : "Demande supprimée",
      );
    }
  };

  const assigner = async () => {
    if (!acteurs.length) return;
    await executer(
      () => api.assignSupportRequests(ids, acteurs.map(Number)),
      n > 1 ? `${n} demandes assignées` : "Demande assignée",
    );
    setAssignation(false);
  };

  const textes: Record<
    Exclude<AConfirmer, null>,
    { titre: string; message: string; bouton: string; couleur: string }
  > = {
    merge: {
      titre: "Fusionner les demandes",
      message: `${citer(autres)} ${autres.length > 1 ? "seront fusionnées" : "sera fusionnée"} dans ${citer(
        gardee ? [gardee] : [],
      )}, la plus récente : ses échanges, ses acteurs et ses étiquettes y seront repris, puis ${
        autres.length > 1 ? "elles seront fermées" : "elle sera fermée"
      }.`,
      bouton: "Fusionner",
      couleur: "teal",
    },
    close: {
      titre: n > 1 ? "Fermer les demandes" : "Fermer la demande",
      message: `${citer(vises)} ${n > 1 ? "passeront" : "passera"} au statut « Fermé ».`,
      bouton: "Fermer",
      couleur: "teal",
    },
    delete: {
      titre: n > 1 ? "Supprimer les demandes" : "Supprimer la demande",
      message: `${citer(vises)} ${
        n > 1 ? "seront supprimées" : "sera supprimée"
      }, avec leurs échanges. Cette action est irréversible.`,
      bouton: "Supprimer",
      couleur: RED,
    },
  };
  const texte = aConfirmer ? textes[aConfirmer] : null;

  return (
    <>
      {/* Seul le menu s'efface : les confirmations et les boîtes restent
          montées, elles se referment encore après que les cases se sont
          décochées. */}
      {selected.length > 0 && (
        <Menu position="bottom-end" withinPortal offset={ROW_MENU_OFFSET} styles={TAB_MENU_STYLES}>
          <Menu.Target>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              rightSection={<IconChevronDown size={14} />}
              // Le gris de Mantine tire sur le bleu au survol : le nôtre est neutre.
              style={{ "--button-hover": NEUTRAL_HOVER } as CSSProperties}
            >
              Actions ({selected.length})
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {/* Modifier ne vaut que pour une demande à la fois : c'est son tiroir
              qui s'ouvre. */}
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              disabled={n !== 1}
              onClick={() => selected[0] && onEdit(selected[0])}
            >
              Modifier
            </Menu.Item>
            <Menu.Item
              leftSection={<IconUserPlus size={16} />}
              disabled={n === 0}
              onClick={() => {
                setActeurs([]);
                setAssignation(true);
              }}
            >
              Assigner à
            </Menu.Item>
            <Menu.Item
              leftSection={<IconArrowMerge size={16} />}
              disabled={n < 2}
              onClick={() => setAConfirmer("merge")}
            >
              Fusionner
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCircleX size={16} />}
              disabled={n === 0}
              onClick={() => setAConfirmer("close")}
            >
              Fermer
            </Menu.Item>
            <Menu.Divider />
            {/* Les étiquettes sont communes à tout le support, pas propres aux
              demandes cochées : ce geste n'en demande aucune. */}
            <Menu.Item leftSection={<IconTags size={16} />} onClick={ouvrirEtiquettes}>
              Étiquettes
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color={RED}
              leftSection={<IconTrash size={16} />}
              disabled={n === 0}
              onClick={() => setAConfirmer("delete")}
            >
              Supprimer
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}

      {/* Le clic droit sur une ligne : ses gestes, pour elle seule. */}
      {contexte && (
        <PointMenu position={contexte.position} onClose={() => onContexteClose?.()}>
          {/* Suivre vient en tête, comme dans le tiroir de la demande. Le
              menu ne se referme pas, pour qu'on voie la coche changer. */}
          {onToggleFollow && (
            <>
              <Menu.Item
                leftSection={<IconEye size={16} />}
                rightSection={
                  followedIds.includes(contexte.demande.id) ? <IconCheck size={14} /> : null
                }
                onClick={() => onToggleFollow(contexte.demande)}
                closeMenuOnClick={false}
              >
                Suivre
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          <Menu.Item
            leftSection={<IconPencil size={16} />}
            onClick={() => onEdit(contexte.demande)}
          >
            Modifier
          </Menu.Item>
          <Menu.Item
            leftSection={<IconUserPlus size={16} />}
            onClick={() => {
              setCibles([contexte.demande]);
              setActeurs([]);
              setAssignation(true);
            }}
          >
            Assigner à
          </Menu.Item>
          {onCreateTask && (
            <Menu.Item
              leftSection={<IconSquarePlus size={16} />}
              onClick={() => onCreateTask(contexte.demande)}
            >
              Créer une tâche
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              setCibles([contexte.demande]);
              setAConfirmer("delete");
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={texte !== null}
        onClose={() => {
          if (enCours) return;
          setAConfirmer(null);
          setCibles(null);
        }}
        onConfirm={confirmer}
        title={texte?.titre}
        message={texte?.message}
        confirmLabel={texte?.bouton}
        cancelLabel="Annuler"
        confirmColor={texte?.couleur}
      />

      <Modal
        opened={gereEtiquettes}
        onClose={() => setGereEtiquettes(false)}
        title="Étiquettes"
        withCloseButton={false}
        centered
        size="lg"
        padding={MODAL_PADDING}
        styles={modalHeaderStyles(MODAL_PADDING)}
      >
        <Stack gap="md">
          <LabelsManager
            labels={etiquettes}
            emptyText="Aucune étiquette"
            porteurs="des demandes qui la portent"
            avecPoids
            onCreate={async (nom, couleur, poids) => {
              await api.createSupportLabel(nom, couleur, poids);
              await relireEtiquettes();
            }}
            onUpdate={async (id, data) => {
              await api.updateSupportLabel(id, data);
              await relireEtiquettes();
            }}
            onReorder={async (ids) => {
              await api.reorderSupportLabels(ids);
              await relireEtiquettes();
            }}
            onDelete={async (id) => {
              await api.deleteSupportLabel(id);
              await relireEtiquettes();
            }}
          />
          {/* Chaque geste sur une étiquette part aussitôt au serveur :
              « Enregistrer » referme et fait relire la liste, pour que les
              demandes montrent les étiquettes telles qu'on vient de les
              laisser. « Fermer » referme simplement. */}
          <Group justify="flex-end" mt={MODAL_PADDING - 16}>
            <BoutonFermer onClick={() => setGereEtiquettes(false)} />
            <Button
              color="teal"
              onClick={async () => {
                setGereEtiquettes(false);
                await onRefresh();
              }}
            >
              Enregistrer
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={assignation}
        onClose={() => {
          if (enCours) return;
          setAssignation(false);
          setCibles(null);
        }}
        title={n > 1 ? `Assigner ${n} demandes` : `Assigner ${citer(vises)}`}
        centered
        padding={MODAL_PADDING}
        withCloseButton={false}
        styles={modalHeaderStyles(MODAL_PADDING)}
      >
        <Stack gap="md">
          <ActorPicker label="Acteurs" users={users} value={acteurs} onChange={setActeurs} />
          <Text size="xs" c="dimmed">
            Les acteurs s'ajoutent à ceux déjà désignés. Chacun est prévenu à l'écran et par e-mail.
          </Text>
          <Group justify="flex-end" mt={MODAL_PADDING - 16}>
            <BoutonFermer
              onClick={() => {
                setAssignation(false);
                setCibles(null);
              }}
              disabled={enCours}
            />
            <Button color="teal" onClick={assigner} loading={enCours} disabled={!acteurs.length}>
              Assigner
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
