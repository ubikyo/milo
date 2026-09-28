import {
  Button,
  Drawer,
  Group,
  Input,
  LoadingOverlay,
  Menu,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconChecklist,
  IconChevronDown,
  IconMessage,
  IconSettings,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { tabStyle } from "../../themes/tabs";
import { ACTOR_GAP, PersonAvatar } from "../ui/ActorAvatars.jsx";
import ChipPicker from "../ui/ChipPicker.jsx";
import RichTextField, { useRichEditor } from "../ui/RichText.jsx";
import CardChecklists from "./CardChecklists.jsx";
import LabelPicker from "../ui/LabelPicker.jsx";
import CommentThread from "../project/CommentThread.jsx";
import ErrorAlert from "../ui/ErrorAlert.jsx";
import classes from "../../assets/styles/CardDrawer.module.css";

// Les deux volets du tiroir, comme pour un projet : la fiche de la carte, puis
// ses échanges.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

// Retrait du tiroir. Il sert à trois choses : le retrait lui-même, l'entête
// commun, et le décalage de la barre de défilement vers la bordure gauche.
const DRAWER_PADDING = 40;


// Hauteur des bulles de membres et des étiquettes : la même pour les deux, et
// pour le « + » qui les suit, afin que les deux colonnes s'alignent.
const CHIP_HEIGHT = 30;

/**
 * La fiche d'une carte. Elle s'ouvre au clic sur la carte et se referme en
 * enregistrant. Un séparateur n'en a pas : il n'a qu'un texte, qui se modifie
 * sur le tableau.
 */
export default function CardDrawer({
  opened,
  onClose,
  card,
  labels,
  users,
  boardId,
  onLabelsChanged,
  onSaved,
}) {
  const [text, setText] = useState("");
  const [memberIds, setMemberIds] = useState([]);
  const [labelIds, setLabelIds] = useState([]);
  const [comments, setComments] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [numero, setNumero] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("settings");

  // L'éditeur de la description : il vit tant que le tiroir vit, son contenu
  // est remplacé à chaque carte ouverte.
  const editor = useRichEditor({ placeholder: "Description de la carte" });

  useEffect(() => {
    if (!opened || !card) return;
    // Un tiroir rouvert repart des paramètres, quel que soit l'onglet quitté.
    setActiveTab("settings");
    setError(null);
    setLoading(true);
    api
      .getTaskCard(card.id)
      .then((fiche) => {
        setText(fiche.text);
        setNumero(fiche.number);
        setMemberIds((fiche.members || []).map((m) => String(m.id)));
        setLabelIds((fiche.labels || []).map((l) => String(l.id)));
        setComments(fiche.comments || []);
        setChecklists(fiche.checklists || []);
        editor?.commands.setContent(fiche.description || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [opened, card, editor]);

  // Une checklist vient de changer : on relit la fiche pour ne montrer que ce
  // que le serveur a retenu. Le tableau, lui, se relira à la fermeture.
  const refreshChecklists = async () => {
    const fiche = await api.getTaskCard(card.id);
    setChecklists(fiche.checklists || []);
  };

  const ajouterChecklist = async () => {
    setError(null);
    try {
      await api.createChecklist(card.id, "Checklist");
      await refreshChecklists();
    } catch (e) {
      setError(e.message);
    }
  };

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que la fiche part au serveur. Si le
  // serveur refuse, le tiroir reste ouvert avec le message : sans bouton pour
  // réessayer, il ne faut pas que la saisie disparaisse avec lui.
  const fermer = async () => {
    if (!card || loading) return onClose();
    setSaving(true);
    setError(null);
    try {
      await api.updateTaskCardDetails(card.id, {
        // Un titre vidé par mégarde ne s'enregistre pas : la carte garde le
        // sien, le serveur le refuserait de toute façon.
        text: text.trim() || card.text,
        description: editor?.getHTML() ?? "",
        member_ids: memberIds.map(Number),
        label_ids: labelIds.map(Number),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const refreshComments = async () => {
    const fiche = await api.getTaskCard(card.id);
    setComments(fiche.comments || []);
  };

  const addComment = async (texte) => {
    await api.addTaskCardComment(card.id, texte);
    await refreshComments();
  };

  const updateComment = async (id, texte) => {
    await api.updateTaskCardComment(id, texte);
    await refreshComments();
  };

  const deleteComment = async (id) => {
    await api.deleteTaskCardComment(id);
    await refreshComments();
  };

  return (
    <Drawer
      opened={opened}
      onClose={fermer}
      position="right"
      size={560}
      padding={DRAWER_PADDING}
      withCloseButton={false}
      styles={{
        content: {
          display: "flex",
          flexDirection: "column",
          // Lue par la barre de défilement des panneaux (assets/styles/CardDrawer.module.css).
          "--milo-drawer-padding": `${DRAWER_PADDING}px`,
        },
        // Le corps ne défile plus : seul le panneau de l'onglet ouvert le
        // fait, par sa propre zone de défilement. Le titre, les onglets et les
        // actions du bas restent en place.
        body: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <LoadingOverlay visible={loading || saving} />

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
              d'onglets : ce ne sont pas des volets à ouvrir, mais des blocs à
              poser sur la carte. Poussé à droite, le menu ne se confond pas
              avec les onglets. */}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                variant="subtle"
                color="gray"
                rightSection={<IconChevronDown size={14} />}
                ml="auto"
                mb={4}
                // Le même gris neutre que le menu « Actions » des onglets de
                // tableaux : celui de Mantine tire sur le bleu au survol.
                style={{ alignSelf: "center", "--button-hover": NEUTRAL_HOVER }}
              >
                Actions
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconChecklist size={16} />}
                onClick={ajouterChecklist}
              >
                Checklist
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Tabs.List>

        <Tabs.Panel
          value="settings"
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          {/* La barre ne se montre que pendant le défilement, comme sur le
              tableau ; le style la déporte sur la bordure gauche du tiroir. */}
          <ScrollArea
            type="scroll"
            scrollbars="y"
            classNames={{ scrollbar: classes.scrollbar, thumb: classes.thumb }}
            style={{ flex: 1, minHeight: 0 }}
          >
            <Stack gap="xl">
              {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

              {/* Ce qui range la carte vient avant ce qui la nomme : les deux
                colonnes s'ouvrent chacune sur leur propre liste. Les bulles
                des membres tiennent en peu de place, les étiquettes portent du
                texte : la largeur se partage en 30 / 70. Ce partage se dit en
                proportions et non en pourcentages : « 30% + 70% » aurait
                ignoré l'écart entre les deux colonnes, et la seconde aurait
                débordé d'autant. */}
              <Group align="flex-start" gap="md" wrap="nowrap">
                <div style={{ flex: "3 1 0", minWidth: 0 }}>
                  <ChipPicker
                    chipHeight={CHIP_HEIGHT}
                    // Les bulles se suivent avec le même filet d'air que sur une
                    // carte du tableau ou dans celui des projets.
                    chipGap={ACTOR_GAP}
                    label="Membres"
                    options={users}
                    value={memberIds}
                    onChange={setMemberIds}
                    emptyText="Aucun compte à proposer"
                    // Dans la liste, la bulle et le nom : il faut pouvoir choisir
                    // quelqu'un. Une fois retenu, la bulle suffit.
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
                  <LabelPicker
                    chipHeight={CHIP_HEIGHT}
                    labels={labels}
                    value={labelIds}
                    onChange={setLabelIds}
                    boardId={boardId}
                    onLabelsChanged={onLabelsChanged}
                  />
                </div>
              </Group>

              <TextInput
                label="Titre"
                placeholder="Titre de la carte"
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                required
              />

              <RichTextField editor={editor} label="Description" />

              {/* Le numéro ferme la fiche : il est attribué à la création et ne
                bouge plus, il se montre sans se modifier. */}
              <Input.Wrapper label="Numéro">
                <Text size="sm" c="dimmed" pt={4}>
                  #{numero ?? "—"}
                </Text>
              </Input.Wrapper>

              {/* Les checklists ferment la fiche : elles s'ajoutent par le menu
                « Actions » et s'enregistrent d'elles-mêmes. */}
              <CardChecklists
                cardId={card?.id}
                checklists={checklists}
                users={users}
                onChanged={refreshChecklists}
                onError={setError}
              />
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
                onAdd={addComment}
                onUpdate={updateComment}
                onDelete={deleteComment}
              />
            </Stack>
          </ScrollArea>
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}
