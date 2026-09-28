import {
  Button,
  Drawer,
  Group,
  Input,
  Menu,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import {
  IconChevronDown,
  IconMessage,
  IconSettings,
  IconTags,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { NEUTRAL_HOVER, RED } from "../../themes/colors";
import { tabStyle } from "../../themes/tabs";
import { ACTOR_GAP, PersonAvatar } from "../ui/ActorAvatars";
import ChipPicker from "../ui/ChipPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import LabelsManager from "../board/LabelsManager";
import LabelPicker, { SUPPORT_LABELS_API } from "../ui/LabelPicker";
import CommentThread from "../project/CommentThread";
import classes from "../../assets/styles/CardDrawer.module.css";
import { messageErreur } from "../../lib/errors";
import { DEFAULT_SUPPORT_STATUS, SUPPORT_STATUSES } from "@milo/shared";
import type { CSSProperties } from "react";
import type { FilItem } from "../project/CommentThread";
import type {
  PublicUser,
  SupportLabel,
  SupportRequest,
  SupportRequestInput,
  SupportStatus,
} from "@milo/shared";

// Les deux volets du tiroir, comme pour une carte ou un projet : la fiche,
// puis les échanges.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

const DRAWER_PADDING = 40;

// Deux fois la largeur des autres tiroirs (560) : une demande tient ses
// acteurs, ses étiquettes et ses échanges côte à côte, et son fil se lit sans
// que chaque commentaire retombe à la ligne.
const DRAWER_WIDTH = 1120;

// Hauteur des étiquettes et du « + » qui les suit, comme sur la fiche d'une
// carte.
const CHIP_HEIGHT = 30;

/**
 * La fiche d'une demande de support. Elle s'ouvre au clic sur une ligne, ou
 * vide depuis « Nouvelle demande de support », et se referme en enregistrant.
 *
 * Ses acteurs et ses étiquettes se posent comme les membres et les étiquettes
 * d'une carte : on en choisit autant qu'il faut, dans la même liste à cocher.
 */
interface SupportRequestDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** « null » à la création, la demande visée sinon. */
  request: SupportRequest | null;
  /** La société de la liste déroulante : c'est elle qui porte la demande. */
  companyId: string;
  /** Le statut de l'onglet ouvert : celui que prend une demande créée là. */
  defaultStatus: SupportStatus;
  users: PublicUser[];
  labels: SupportLabel[];
  onLabelsChanged: (patch?: { id: number; data: Partial<SupportLabel> }) => void | Promise<void>;
  currentUser: PublicUser;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

export default function SupportRequestDrawer({
  opened,
  onClose,
  request,
  companyId,
  defaultStatus,
  users,
  labels,
  onLabelsChanged,
  currentUser,
  onSaved,
  onDeleted,
}: SupportRequestDrawerProps) {
  const [status, setStatus] = useState<SupportStatus>(DEFAULT_SUPPORT_STATUS);
  /** Les acteurs retenus, en chaînes : ceux qui s'occupent de la demande. */
  const [actorIds, setActorIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  /**
   * Vrai quand la gestion des étiquettes est dépliée. Elle s'ouvre par le menu
   * « Actions » : ce n'est pas un volet de plus, mais un bloc posé sous la
   * fiche, comme les checklists d'une carte.
   */
  const [gereLesEtiquettes, setGereLesEtiquettes] = useState(false);
  /** L'échéance, en ISO ; vide quand la demande n'en a pas. */
  const [echeance, setEcheance] = useState("");
  const [comments, setComments] = useState<FilItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("settings");
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  useEffect(() => {
    if (!opened) return;
    // Un tiroir rouvert repart des paramètres, quel que soit l'onglet quitté.
    setActiveTab("settings");
    setError(null);

    setGereLesEtiquettes(false);

    if (!request) {
      // Une demande ouverte depuis un onglet y reste : elle en prend le statut.
      setStatus(defaultStatus);
      setActorIds([]);
      setLabelIds([]);
      setEcheance("");
      setComments([]);
      return;
    }

    setStatus(request.status);
    setActorIds(request.actors.map((a) => String(a.id)));
    setLabelIds(request.labels.map((l) => String(l.id)));
    setEcheance(request.due_date || "");
    api
      .getSupportRequest(request.id)
      .then((fiche) => setComments(fiche.comments))
      .catch((e) => setError(messageErreur(e)));
  }, [opened, request, defaultStatus]);

  const refreshComments = async () => {
    if (!request) return;
    const fiche = await api.getSupportRequest(request.id);
    setComments(fiche.comments);
  };

  /**
   * Ce que la demande porte. Rien de tout cela n'est obligatoire : une demande
   * n'a pas encore d'intitulé, c'est son fil qui la dit.
   */
  const saisie = (): SupportRequestInput => ({
    status,
    actor_ids: actorIds.map(Number),
    due_date: echeance,
    label_ids: labelIds.map(Number),
  });

  /** Vrai dès que la demande dit quelque chose : de quoi valoir d'être créée. */
  const remplie = Boolean(
    actorIds.length || labelIds.length || echeance || comments.length,
  );

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que la fiche part au serveur. Une demande
  // ouverte puis refermée sans rien dire n'est pas créée : elle ne laisse rien
  // derrière elle. Si le serveur refuse, le tiroir reste ouvert avec le
  // message plutôt que d'emporter la saisie.
  const fermer = async () => {
    if (!request && !remplie) return onClose();
    setError(null);
    try {
      if (request) {
        await api.updateSupportRequest(request.id, saisie());
      } else {
        const creee = await api.createSupportRequest({
          company_id: Number(companyId),
          ...saisie(),
        });
        // Les échanges tenus avant la création partent à sa suite.
        for (const comment of comments) {
          await api.addSupportComment(creee.id, comment.text);
        }
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const supprimer = async () => {
    setConfirmDeleteOpened(false);
    if (!request) return;
    try {
      await api.deleteSupportRequest(request.id);
      await onDeleted();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  // Avant création, les commentaires vivent en local et partent au serveur une
  // fois la demande enregistrée — comme ceux d'un projet qu'on ouvre.
  const ajouterCommentaire = async (texte: string) => {
    if (!request) {
      const instant = new Date().toISOString();
      setComments((fil) => [
        ...fil,
        {
          id: `draft-${instant}-${fil.length}`,
          text: texte,
          author: currentUser,
          created_at: instant,
          updated_at: instant,
        },
      ]);
      return;
    }
    await api.addSupportComment(request.id, texte);
    await refreshComments();
  };

  const modifierCommentaire = async (id: number | string, texte: string) => {
    if (!request || typeof id !== "number") {
      setComments((fil) =>
        fil.map((c) =>
          c.id === id ? { ...c, text: texte, updated_at: new Date().toISOString() } : c,
        ),
      );
      return;
    }
    await api.updateSupportComment(id, texte);
    await refreshComments();
  };

  const supprimerCommentaire = async (id: number | string) => {
    if (!request || typeof id !== "number") {
      setComments((fil) => fil.filter((c) => c.id !== id));
      return;
    }
    await api.deleteSupportComment(id);
    await refreshComments();
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={fermer}
        position="right"
        size={DRAWER_WIDTH}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        styles={{
          content: {
            display: "flex",
            flexDirection: "column",
            // Lue par la barre de défilement des panneaux (assets/styles/CardDrawer.module.css).
            "--milo-drawer-padding": `${DRAWER_PADDING}px`,
          } as CSSProperties,
          body: {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        }}
      >
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          styles={{ panel: { paddingTop: 20 } }}
        >
          <Tabs.List mb="md">
            {TABS.map(({ value, label, icon: Icon }) => (
              <Tabs.Tab
                key={value}
                value={value}
                leftSection={<Icon size={16} />}
                style={tabStyle(activeTab === value)}
              >
                {label}
              </Tabs.Tab>
            ))}

            {/* Ce qui s'ajoute à la fiche se choisit ici, au bout de la rangée
                d'onglets, comme sur celle d'une carte : ce ne sont pas des
                volets à ouvrir, mais des blocs à poser. */}
            <Menu position="bottom-end" withinPortal shadow="md">
              <Menu.Target>
                <Button
                  variant="subtle"
                  color="gray"
                  rightSection={<IconChevronDown size={14} />}
                  ml="auto"
                  mb={4}
                  // Le même gris neutre que les autres menus « Actions » :
                  // celui de Mantine tire sur le bleu au survol.
                  style={{ alignSelf: "center", "--button-hover": NEUTRAL_HOVER } as CSSProperties}
                >
                  Actions
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {/* Les étiquettes appartiennent à la société, pas à la demande
                    ni à l'onglet ouvert : les gérer ici les change partout. */}
                <Menu.Item
                  leftSection={<IconTags size={16} />}
                  onClick={() => setGereLesEtiquettes(true)}
                >
                  Étiquettes
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Tabs.List>

          <Tabs.Panel
            value="settings"
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <ScrollArea
              type="scroll"
              scrollbars="y"
              classNames={{ scrollbar: classes.scrollbar, thumb: classes.thumb }}
              style={{ flex: 1, minHeight: 0 }}
            >
              <Stack gap="xl">
                {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

                {/* Comme sur la fiche d'une carte : les deux colonnes s'ouvrent
                    chacune sur leur propre liste à cocher. Les bulles des
                    acteurs tiennent en peu de place, les étiquettes portent du
                    texte : la largeur se partage en 30 / 70. */}
                <Group align="flex-start" gap="md" wrap="nowrap">
                  <div style={{ flex: "3 1 0", minWidth: 0 }}>
                    <ChipPicker
                      chipHeight={CHIP_HEIGHT}
                      chipGap={ACTOR_GAP}
                      label="Acteurs"
                      options={users}
                      value={actorIds}
                      onChange={setActorIds}
                      emptyText="Aucun compte à proposer"
                      // Dans la liste, la bulle et le nom : il faut pouvoir
                      // choisir quelqu'un. Une fois retenu, la bulle suffit.
                      render={(u) => (
                        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                          <PersonAvatar person={u} size={CHIP_HEIGHT} />
                          <Text size="xs" truncate>
                            {u.name}
                          </Text>
                        </Group>
                      )}
                      renderChip={(u) => (
                        <span style={{ display: "inline-flex" }} aria-label={u.name}>
                          <PersonAvatar person={u} size={CHIP_HEIGHT} />
                        </span>
                      )}
                    />
                  </div>
                  <div style={{ flex: "7 1 0", minWidth: 0 }}>
                    {/* Les étiquettes appartiennent à la société : les renommer
                        ou les supprimer touche toutes ses demandes, quel que
                        soit leur statut. */}
                    <LabelPicker
                      chipHeight={CHIP_HEIGHT}
                      labels={labels}
                      value={labelIds}
                      onChange={setLabelIds}
                      boardId={companyId}
                      onLabelsChanged={onLabelsChanged}
                      labelsApi={SUPPORT_LABELS_API}
                      emptyText="Aucune étiquette pour cette société"
                    />
                  </div>
                </Group>

                <DateTimePicker
                  label="Échéance"
                  placeholder="Choisir une date et une heure"
                  value={echeance || null}
                  // Choisir un jour ne suffit pas : il reste l'heure à régler.
                  // C'est la fermeture du calendrier qui rend la main.
                  onChange={(valeur) => {
                    const date = valeur ? new Date(valeur) : null;
                    setEcheance(date && !Number.isNaN(date.getTime()) ? date.toISOString() : "");
                  }}
                  withSeconds={false}
                  clearable
                  popoverProps={{ withinPortal: true }}
                />

                {/* Le statut est ce que disent les onglets : le changer ici
                    fait passer la demande de l'un à l'autre. */}
                <Select
                  label="Statut"
                  data={SUPPORT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                  value={status}
                  onChange={(value) => value && setStatus(value as SupportStatus)}
                  allowDeselect={false}
                />

                {/* Demandée par le menu « Actions ». Les étiquettes sont celles
                    de la société : elles valent pour tous les onglets, et
                    chaque geste part au serveur aussitôt, sans attendre que la
                    demande soit enregistrée. */}
                {gereLesEtiquettes && (
                  <Input.Wrapper label="Gestion des étiquettes">
                    <Stack gap="sm" mt={4}>
                      <LabelsManager
                        labels={labels}
                        emptyText="Aucune étiquette pour cette société"
                        porteurs="des demandes qui la portent"
                        onCreate={async (nom, couleur) => {
                          await api.createSupportLabel(Number(companyId), nom, couleur);
                          await onLabelsChanged();
                        }}
                        onUpdate={async (id, data) => {
                          await api.updateSupportLabel(id, data);
                          await onLabelsChanged();
                        }}
                        onDelete={async (id) => {
                          await api.deleteSupportLabel(id);
                          // L'étiquette quitte la fiche ouverte : sans cela,
                          // l'enregistrement la reposerait sur la demande alors
                          // que le serveur ne la connaît plus.
                          setLabelIds((deja) => deja.filter((v) => v !== String(id)));
                          await onLabelsChanged();
                        }}
                      />
                    </Stack>
                  </Input.Wrapper>
                )}
              </Stack>
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel
            value="comments"
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <ScrollArea
              type="scroll"
              scrollbars="y"
              classNames={{
                scrollbar: classes.scrollbar,
                thumb: classes.thumb,
                viewport: classes.viewport,
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                <CommentThread
                  comments={comments}
                  onAdd={ajouterCommentaire}
                  onUpdate={modifierCommentaire}
                  onDelete={supprimerCommentaire}
                />
                {/* Avant création, le fil ne part au serveur qu'avec la
                    demande : on le dit plutôt que de le laisser croire enregistré. */}
                {!request && comments.length > 0 && (
                  <Text size="xs" c="dimmed">
                    {comments.length} commentaire{comments.length > 1 ? "s" : ""} seront
                    enregistrés avec la demande.
                  </Text>
                )}
              </Stack>
            </ScrollArea>
          </Tabs.Panel>
        </Tabs>

        {/* Ne reste en bas que la suppression : le reste s'enregistre en
            refermant. */}
        {request && (
          <Stack gap="sm" mt="auto" pt={40}>
            <Group wrap="nowrap">
              <Button
                color={RED}
                variant="subtle"
                leftSection={<IconTrash size={16} />}
                onClick={() => setConfirmDeleteOpened(true)}
              >
                Supprimer
              </Button>
            </Group>
          </Stack>
        )}
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={supprimer}
        title="Supprimer la demande"
        message={
          <>
            Voulez-vous vraiment supprimer cette demande ? Ses échanges seront supprimés. Cette
            action est irréversible.
          </>
        }
      />
    </>
  );
}
