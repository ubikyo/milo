import {
  ActionIcon,
  alpha,
  Anchor,
  Button,
  Checkbox,
  ColorSwatch,
  darken,
  getContrastColor,
  getPrimaryShade,
  Group,
  lighten,
  Menu,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import {
  IconCheckbox,
  IconCircleOff,
  IconColumns,
  IconDots,
  IconFolderSymlink,
  IconAlignLeft,
  IconPlus,
  IconSeparatorHorizontal,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import ActorAvatars from "../ui/ActorAvatars.jsx";
import AddButton from "../ui/AddButton.jsx";
import { CardLabel } from "../ui/LabelChip.jsx";
import Confetti from "../ui/Confetti.jsx";
import CardDrawer from "./CardDrawer.jsx";
import MoveListModal from "./MoveListModal.jsx";
import DeleteConfirmModal from "../ui/DeleteConfirmModal.jsx";
import EmptyPanel from "../ui/EmptyPanel.jsx";
import ErrorAlert from "../ui/ErrorAlert.jsx";
import classes from "../../assets/styles/TaskBoard.module.css";

// Largeur d'une liste et espace entre deux listes.
const LIST_WIDTH = 270;
const LIST_GAP = 15;
// Padding intérieur d'une liste : la moitié du « md » de Mantine (16px).
const LIST_PADDING = 8;
// Espace entre deux cartes d'une même liste.
const CARD_GAP = 8;
// Déplacement du pointeur à partir duquel on considère qu'il s'agit d'un
// glisser et non d'un clic (qui, lui, ouvre le renommage).
const DRAG_THRESHOLD = 5;

// Délai laissé à un second clic avant que le premier n'ouvre la fiche : c'est
// lui qui rend le double-clic possible sur une carte. Assez court pour que
// l'ouverture ne traîne pas, assez long pour un double-clic ordinaire.
const DOUBLE_CLICK_DELAY = 250;

// Fond neutre du tableau : la liste ressort du fond de la page, la carte reste
// sombre pour se détacher de la liste qui la porte.
const LIST_BG =
  "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))";

// Couleurs proposées dans le menu d'une liste, rangées en trois lignes de
// trois. La chaîne vide vaut « aucune » : la liste reprend alors le fond
// neutre du tableau. Le libellé ne s'affiche pas, il nomme la pastille.
const LIST_COLORS = [
  { value: "green", label: "Vert" },
  { value: "blue", label: "Bleu" },
  { value: "violet", label: "Violet" },
  { value: "pink", label: "Rose" },
  { value: "red", label: "Rouge" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Jaune" },
  { value: "gray", label: "Gris" },
  { value: "white", label: "Blanc" },
];

// Les couleurs d'une liste, résolues pour le thème courant. Tout part de son
// fond : la bordure d'une carte l'éclaircit au survol, le « … » l'assombrit. Le
// texte, lui, n'est jamais choisi à la main : « getContrastColor » de Mantine
// tranche entre le noir et le blanc d'après la luminosité du fond qui le
// porte, comme le fait « autoContrast » pour ses propres composants.
function useListColors() {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");

  return useCallback(
    (color) => {
      const sombre = colorScheme === "dark";
      // Le blanc n'est pas une teinte de la palette : il s'inverse d'un thème
      // à l'autre, blanc sur le sombre et noir sur le clair.
      let fond;
      if (color === "white") fond = sombre ? theme.white : theme.black;
      else if (LIST_COLORS.some((c) => c.value === color))
        fond = theme.colors[color][getPrimaryShade(theme, colorScheme)];
      else fond = sombre ? theme.colors.dark[5] : theme.colors.gray[2];

      const lisible = (dessous) =>
        getContrastColor({
          color: dessous,
          theme,
          autoContrast: true,
          colorScheme,
        });

      const creuse = darken(fond, 0.18);
      // Un séparateur se pose sur le fond de sa liste, assombri plus franchement
      // que le survol : il doit se lire comme un intertitre, pas comme un
      // élément survolé.
      const creuseSepare = darken(fond, 0.35);
      return {
        fond,
        texte: lisible(fond),
        // Ce qui se survole sur la liste s'assombrit, ce qui se pose dessus
        // s'éclaircit : le « … » et le champ de renommage d'un côté, la
        // bordure d'une carte de l'autre.
        survol: creuse,
        texteSurvol: lisible(creuse),
        // La bordure d'une carte au survol : le fond de la liste éclairci.
        bordureCarte: lighten(fond, 0.45),
        fondSeparateur: creuseSepare,
        texteSeparateur: lisible(creuseSepare),
        // Le trait d'insertion va jusqu'au blanc : sur l'écart entre deux
        // cartes, il n'a qu'un pointillé d'un pixel pour se faire voir.
        traitInsertion: "var(--mantine-color-white)",
      };
    },
    [theme, colorScheme],
  );
}

// Fond de l'emplacement d'accueil d'une carte : en creux sous les cartes de sa
// liste. Celui d'une liste n'en a plus besoin : elle s'y rappelle elle-même.
const CARD_PLACEHOLDER_BG =
  "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-9))";

// Une liste dont le titre porte cette marque fête chaque carte qui la rejoint.
const MARQUE_FETE = "✨";

// Rayon des cartes : le même pour la carte, son emplacement d'accueil, la copie
// qui suit le pointeur et le champ de saisie qui la remplace en édition.
const CARD_RADIUS = 8;

// Les listes et les cartes n'ont pas de bordure : les champs qui les modifient
// n'en portent pas non plus, pas même le bleu que Mantine pose au focus.
const INPUT_NO_BORDER = {
  input: { "--input-bd": "transparent", "--input-bd-focus": "transparent" },
};

// « Ajouter une carte » ne peint aucun fond, pas même au survol : c'est le
// libellé qui s'éclaircit en devenant translucide. Le « + » est aligné sur le
// bord gauche du contenu de la liste, sans marge intérieure.
function AddCardButton({ label, onClick, color }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Button
      data-no-list-drag="true"
      variant="transparent"
      color={color}
      size="xs"
      justify="flex-start"
      fullWidth
      mt={5}
      pl={0}
      opacity={hovered ? 0.6 : 1}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      leftSection={<IconPlus size={PLUS_SIZE} />}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

// Le texte des cartes est saisi au kilomètre : les retours à la ligne comptent.
const CARD_TEXT = { whiteSpace: "pre-wrap", wordBreak: "break-word" };

// Entrée valide la carte, Cmd (ou Ctrl) + Entrée va à la ligne. Le navigateur
// n'insère rien de lui-même sur cette combinaison : on pose le retour à la
// ligne à la position du curseur, qu'on replace juste après.
const insererRetourLigne = (element, setValue) => {
  const { selectionStart: debut, selectionEnd: fin, value } = element;
  setValue(`${value.slice(0, debut)}\n${value.slice(fin)}`);
  requestAnimationFrame(() => {
    element.selectionStart = debut + 1;
    element.selectionEnd = debut + 1;
  });
};

// Touches communes à la saisie d'une carte et à sa modification : Échap
// annule, Entrée valide, Cmd/Ctrl + Entrée va à la ligne.
const toucheCarte = ({ setValue, onCancel, onSubmit }) => (event) => {
  if (event.key === "Escape") {
    onCancel();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (event.metaKey || event.ctrlKey) insererRetourLigne(event.currentTarget, setValue);
  else onSubmit();
};

// La bordure de survol est toujours là, transparente au repos : la carte ne
// bouge pas quand le pointeur la touche.

// Diamètre des bulles posées sur une carte : plus grandes que celles du tableau
// des projets, où une ligne serrée les contraignait. Leur recouvrement, lui,
// reste celui des projets.
const CARD_AVATAR_SIZE = 25;

// La pastille des checklists : un symbole de case à cocher et le rapport des
// cases cochées au total, cumulé sur toutes les checklists de la carte. Elle
// se clique pour déplier, sous la carte, ce qu'il reste à faire. Une fois tout
// coché, elle s'encadre de vert : la carte est faite, cela doit se voir sans
// lire le compte.
const CHECKLIST_DONE_BG = "var(--mantine-color-teal-filled)";

function CardChecklistBadge({ card, open, onToggle }) {
  const total = card.checklist_total || 0;
  if (total === 0) return null;
  const done = card.checklist_done || 0;
  const complete = done === total;

  return (
    <UnstyledButton
      data-no-card-drag="true"
      onClick={onToggle}
      aria-label={`Checklists : ${done} sur ${total}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        borderRadius: 6,
        backgroundColor: complete ? CHECKLIST_DONE_BG : "transparent",
        color: complete ? "var(--mantine-color-white)" : "inherit",
      }}
    >
      <IconCheckbox size={14} />
      <Text size="xs">
        {done}/{total}
      </Text>
    </UnstyledButton>
  );
}

// Ce qu'il reste à faire, déplié sous la carte : les éléments non cochés de
// toutes ses checklists. Cocher ici retire la ligne et fait avancer la
// pastille, sans ouvrir la fiche.
function CardChecklistPanel({ card, onCheck }) {
  const restants = card.checklist_open || [];

  return (
    <Stack gap={2} data-no-card-drag="true" pt={2}>
      {restants.length === 0 ? (
        <Text size="xs" c="dimmed">
          Tout est coché
        </Text>
      ) : (
        restants.map((item) => (
          <Checkbox
            key={item.id}
            checked={false}
            onChange={() => onCheck(item.id)}
            size="xs"
            label={item.text || "Sans libellé"}
            styles={{
              body: { alignItems: "center" },
              labelWrapper: { minWidth: 0 },
              label: {
                cursor: "pointer",
                paddingLeft: 6,
                fontSize: "var(--mantine-font-size-xs)",
                wordBreak: "break-word",
              },
              input: { cursor: "pointer" },
            }}
          />
        ))
      )}
    </Stack>
  );
}

// Bas de la carte : le signe d'une description et le numéro à gauche, les
// membres à droite. Le numéro est un repère discret pour la désigner à l'oral,
// compté par tableau et non sur l'identifiant en base ; un tableau peut le
// taire (« Afficher le numéro des cartes », dans son tiroir). Les bulles se
// recouvrent comme dans le tableau des projets ; sans membre, la ligne n'en
// montre aucune.
function CardNumber({ card, withNumber, checklistOpen, onChecklistToggle }) {
  const membres = card.members || [];

  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
      <Group gap={6} align="center" wrap="nowrap" c="dimmed">
        {/* Le picto dit qu'il y a autre chose à lire dans la fiche. */}
        {card.has_description && (
          <IconAlignLeft size={14} aria-label="Cette carte a une description" />
        )}
        {/* Les cases cochées passent avant le numéro : c'est l'avancement
            qu'on cherche du regard, pas le repère. */}
        <CardChecklistBadge
          card={card}
          open={checklistOpen}
          onToggle={onChecklistToggle}
        />
        {withNumber && <Text size="xs">#{card.number}</Text>}
      </Group>
      {membres.length > 0 && (
        <ActorAvatars actors={membres} size={CARD_AVATAR_SIZE} max={4} />
      )}
    </Group>
  );
}

// Un séparateur n'est pas une carte à suivre : il titre ce qui vient ensuite.
// Il se saisit, se modifie et se glisse comme une carte, mais il ne porte ni
// numéro ni fond de carte.
const estSeparateur = (card) => card.kind === "separator";

// Le fond d'un séparateur : celui de sa liste, assombri. Une carte ordinaire
// garde le fond que Mantine donne au Paper.
const styleSeparateur = (card, palette) =>
  estSeparateur(card)
    ? {
        backgroundColor: palette.fondSeparateur,
        color: palette.texteSeparateur,
      }
    : null;

// Ce que montre une carte. Posé à part : la carte elle-même, la copie qui suit
// le pointeur et les cartes de la liste qu'on déplace s'en servent toutes.
function CardContent({
  card,
  withNumber = true,
  labelsCompactes,
  onLabelClick,
  labels,
  checklistOpen = false,
  onChecklistToggle,
  onChecklistCheck,
}) {
  if (estSeparateur(card))
    return (
      <Text size="sm" fw={700} style={CARD_TEXT}>
        {card.text}
      </Text>
    );

  // Les étiquettes du tableau font foi : renommée ou recolorée, une étiquette
  // se montre sous son nouveau jour sans attendre que les listes soient
  // relues. La carte ne garde que le lien.
  const etiquettes = (card.labels || []).map(
    (e) => (labels || []).find((l) => l.id === e.id) || e,
  );

  return (
    <Stack gap={4}>
      {/* Les étiquettes coiffent le titre. Cliquer l'une d'elles les replie ou
          les déploie toutes, sur tout le tableau. */}
      {etiquettes.length > 0 && (
        <Group gap={4} align="center">
          {etiquettes.map((label) => (
            <CardLabel
              key={label.id}
              label={label}
              compact={labelsCompactes}
              onClick={onLabelClick}
            />
          ))}
        </Group>
      )}
      <Text size="sm" style={CARD_TEXT}>
        {card.text}
      </Text>
      <CardNumber
        card={card}
        withNumber={withNumber}
        checklistOpen={checklistOpen}
        onChecklistToggle={onChecklistToggle}
      />
      {/* Déplié par la pastille : ce qu'il reste à cocher, sous la carte. */}
      {checklistOpen && (
        <CardChecklistPanel card={card} onCheck={onChecklistCheck} />
      )}
    </Stack>
  );
}

// Hauteur de la zone qui répond au survol entre deux cartes : un peu plus que
// l'écart qu'elle couvre, pour qu'elle soit facile à viser.
const INSERT_ZONE = 12;

// Insertion entre deux cartes : un trait pointillé avec un « + » au milieu,
// qui n'apparaît qu'au survol. La zone ne prend aucune hauteur dans la pile —
// elle chevauche l'écart entre les deux cartes, qui garde ses 8px.
function CardInsert({ couleur, onClick }) {
  const [survole, setSurvole] = useState(false);

  return (
    <div style={{ position: "relative", height: 0, marginTop: -CARD_GAP }}>
      <div
        data-no-list-drag="true"
        onMouseEnter={() => setSurvole(true)}
        onMouseLeave={() => setSurvole(false)}
        onClick={onClick}
        aria-label="Insérer une carte ici"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: (CARD_GAP - INSERT_ZONE) / 2,
          height: INSERT_ZONE,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          color: couleur,
          // Le trait et son « + » s'effacent un peu : ils indiquent sans
          // prendre le pas sur les cartes.
          opacity: survole ? 0.8 : 0,
          transition: "opacity 120ms",
        }}
      >
        <span style={{ flex: 1, borderTop: `1px dashed ${couleur}` }} />
        <IconPlus size={PLUS_SIZE} />
        <span style={{ flex: 1, borderTop: `1px dashed ${couleur}` }} />
      </div>
    </div>
  );
}

// Carte figée : sans écoute du pointeur ni survol, pour les copies affichées
// pendant un glisser.
function CardStill({ card, palette, withNumber, labelsCompactes }) {
  return (
    <Paper
      radius={CARD_RADIUS}
      p="xs"
      style={{ border: "2px solid transparent", ...styleSeparateur(card, palette) }}
    >
      <CardContent card={card} withNumber={withNumber} labelsCompactes={labelsCompactes} />
    </Paper>
  );
}

// Insertion dans une copie : l'original n'est jamais touché.
const insere = (liste, index, valeur) => {
  const copie = [...liste];
  copie.splice(index, 0, valeur);
  return copie;
};

// Déplacement d'une carte dans une copie des listes, pour l'afficher avant que
// le serveur ait répondu.
const withCardMoved = (lists, cardId, toListId, index) => {
  const carte = lists
    .flatMap((l) => l.cards || [])
    .find((c) => c.id === cardId);
  if (!carte) return lists;
  return lists.map((list) => {
    const cartes = (list.cards || []).filter((c) => c.id !== cardId);
    if (list.id === toListId)
      cartes.splice(index, 0, { ...carte, list_id: toListId });
    return { ...list, cards: cartes };
  });
};

// --- Liste ----------------------------------------------------------------

function ListCard({
  list,
  editing,
  onStartEdit,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onPointerDown,
  onDelete,
  onMove,
  onColor,
  onSeparator,
  children,
}) {
  // Le menu se ferme de lui-même sur ses entrées, mais pas sur les pastilles
  // de couleur, qui n'en sont pas : on le pilote pour qu'un choix le referme.
  const [menuOpened, setMenuOpened] = useState(false);
  const [pointsSurvoles, setPointsSurvoles] = useState(false);
  const couleurs = useListColors();
  const sienne = couleurs(list.color);

  return (
    <Paper
      w={LIST_WIDTH}
      miw={LIST_WIDTH}
      radius="md"
      p={LIST_PADDING}
      data-list-id={list.id}
      onPointerDown={onPointerDown}
      style={{
        touchAction: "none",
        cursor: "pointer",
        alignSelf: "flex-start",
        backgroundColor: sienne.fond,
      }}
    >
      {/* Aucun écart ici : le seul espacement de la liste est celui entre deux
          cartes, posé par la pile de renderCards. Le titre et « ajouter une
          carte » posent eux-mêmes leurs 5px de respiration. */}
      <Stack gap={0}>
        {/* Le titre respire de 5px sur sa gauche ; le champ qui le remplace,
            lui, s'aligne sur le bord des cartes. */}
        <Group gap="xs" wrap="nowrap" pb={5} pl={editing ? 0 : 5}>
          {editing ? (
            <TextInput
              data-no-list-drag="true"
              value={editing.name}
              onChange={onEditChange}
              onKeyDown={onEditKeyDown}
              onBlur={onEditBlur}
              size="sm"
              radius={CARD_RADIUS}
              autoFocus
              styles={{
                input: {
                  ...INPUT_NO_BORDER.input,
                  backgroundColor: sienne.survol,
                  color: sienne.texteSurvol,
                },
              }}
              style={{ flex: 1, minWidth: 0 }}
              aria-label={`Renommer ${list.name}`}
            />
          ) : (
            <Text
              fw={600}
              size="sm"
              c={sienne.texte}
              onClick={() => onStartEdit(list)}
              style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
            >
              {list.name}
            </Text>
          )}

          {/* Combien de cartes porte la liste, juste avant son menu. Les
              séparateurs ne comptent pas : ils rangent les cartes, ils n'en
              sont pas. */}
          <Text size="xs" c={sienne.texte} opacity={0.7} style={{ flexShrink: 0 }}>
            {(list.cards || []).filter((c) => !estSeparateur(c)).length}
          </Text>

          {/* Menu de la liste, à droite du libellé. */}
          {/* Aligné sur le bord gauche du « … », et non sur son bord droit. */}
          {/* Mantine rend le focus au « … » un instant après la fermeture du
              menu. « Séparateur » ouvre une saisie qui prend le focus dans le
              même souffle : sans « returnFocus », elle le perdrait aussitôt et
              se refermerait sur du vide. */}
          <Menu
            position="bottom-start"
            withinPortal
            returnFocus={false}
            opened={menuOpened}
            onChange={setMenuOpened}
          >
            <Menu.Target>
              <ActionIcon
                data-no-list-drag="true"
                variant="transparent"
                aria-label={`Menu de ${list.name}`}
                onMouseEnter={() => setPointsSurvoles(true)}
                onMouseLeave={() => setPointsSurvoles(false)}
                style={{
                  color: sienne.texte,
                  backgroundColor: pointsSurvoles ? sienne.survol : sienne.fond,
                }}
              >
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {/* Le séparateur se saisit comme une carte, à la fin de la
                  liste ; on le glisse ensuite là où il doit trancher. */}
              <Menu.Item
                leftSection={<IconSeparatorHorizontal size={16} />}
                onClick={onSeparator}
              >
                Séparateur
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFolderSymlink size={16} />}
                onClick={onMove}
              >
                Déplacer
              </Menu.Item>

              <Menu.Divider />
              {/* Les pastilles se passent d'intitulé : une couleur se
                  reconnaît. */}
              <SimpleGrid cols={3} spacing={8} p="xs">
                {LIST_COLORS.map((couleur) => (
                  <ColorSwatch
                    key={couleur.value}
                    component="button"
                    type="button"
                    color={couleurs(couleur.value).fond}
                    size={22}
                    onClick={() => {
                      setMenuOpened(false);
                      onColor(couleur.value);
                    }}
                    style={{ cursor: "pointer" }}
                    aria-label={couleur.label}
                  />
                ))}
              </SimpleGrid>
              <Menu.Item
                leftSection={<IconCircleOff size={16} />}
                onClick={() => onColor("")}
              >
                Aucune
              </Menu.Item>

              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={onDelete}
              >
                Supprimer
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        {children}
      </Stack>
    </Paper>
  );
}

// --- Carte ----------------------------------------------------------------

function CardView({
  card,
  editing,
  onStartEdit,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onPointerDown,
  palette,
  withNumber,
  labelsCompactes,
  onLabelClick,
  labels,
  checklistOpen,
  onChecklistToggle,
  onChecklistCheck,
}) {
  const [hovered, setHovered] = useState(false);

  // En édition, la carte garde son attribut : elle occupe toujours son
  // emplacement dans le calcul des positions pendant un glisser.
  if (editing) {
    return (
      <Textarea
        data-card-id={card.id}
        data-no-list-drag="true"
        value={editing.text}
        onChange={onEditChange}
        onKeyDown={onEditKeyDown}
        onBlur={onEditBlur}
        autosize
        minRows={2}
        autoFocus
        radius={CARD_RADIUS}
        styles={INPUT_NO_BORDER}
        aria-label="Modifier la carte"
      />
    );
  }

  return (
    <Paper
      data-card-id={card.id}
      data-no-list-drag="true"
      radius={CARD_RADIUS}
      p="xs"
      onPointerDown={onPointerDown}
      // Une carte s'ouvre en fiche d'un simple clic ; seul le séparateur, qui
      // n'a pas de fiche, se modifie encore sur le tableau.
      onDoubleClick={() => onStartEdit(card)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        touchAction: "none",
        cursor: "pointer",
        border: `2px solid ${hovered ? palette.bordureCarte : "transparent"}`,
        ...styleSeparateur(card, palette),
      }}
    >
      <CardContent
        card={card}
        withNumber={withNumber}
        labelsCompactes={labelsCompactes}
        onLabelClick={onLabelClick}
        labels={labels}
        checklistOpen={checklistOpen}
        onChecklistToggle={onChecklistToggle}
        onChecklistCheck={onChecklistCheck}
      />
    </Paper>
  );
}

// Une liste figée : son fond, son titre, ses cartes et son « ajouter une
// carte », sans aucune interaction. C'est ce que montrent la copie qui suit le
// pointeur et la liste laissée en place pendant le glisser.
function ListStill({ list, style, shadow, withNumber, labelsCompactes, ...props }) {
  const sienne = useListColors()(list?.color);

  return (
    <Paper
      w={LIST_WIDTH}
      miw={LIST_WIDTH}
      radius="md"
      p={LIST_PADDING}
      shadow={shadow}
      style={{
        alignSelf: "flex-start",
        pointerEvents: "none",
        backgroundColor: sienne.fond,
        ...style,
      }}
      {...props}
    >
      <Stack gap={0}>
        <Text fw={600} size="sm" c={sienne.texte} pb={5} pl={5}>
          {list?.name}
        </Text>
        <Stack gap={CARD_GAP}>
          {(list?.cards || []).map((card) => (
            <CardStill
              key={card.id}
              card={card}
              palette={sienne}
              withNumber={withNumber}
              labelsCompactes={labelsCompactes}
            />
          ))}
        </Stack>
        <AddCardButton label="Ajouter une carte" color={sienne.texte} />
      </Stack>
    </Paper>
  );
}

export default function TaskBoard({
  boardId,
  boards,
  lists,
  loading,
  onListsChanged,
  labels,
  users,
  onLabelsChanged,
}) {
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  // Échap doit annuler sans que la perte de focus n'enregistre au passage.
  const cancelled = useRef(false);

  const [pendingDelete, setPendingDelete] = useState(null);
  // Liste dont on choisit le tableau d'accueil.
  const [movedList, setMovedList] = useState(null);
  // Carte dont la fiche est ouverte.
  const [cardOuverte, setCardOuverte] = useState(null);
  // Les étiquettes se replient en barres, ou se déploient avec leur nom : le
  // choix vaut pour tout le tableau, comme un réglage d'affichage.
  const [labelsCompactes, setLabelsCompactes] = useState(false);
  // Cartes dont le panneau « ce qu'il reste à faire » est déplié. Chaque carte
  // garde le sien : on peut en ouvrir plusieurs à la fois.
  const [checklistsDepliees, setChecklistsDepliees] = useState(() => new Set());

  // Saisie d'une nouvelle carte : la liste, le rang où elle prendra place et
  // son genre (« card » ou « separator »). Modification d'une carte existante
  // juste en dessous.
  const [cardCompose, setCardCompose] = useState(null);
  const [cardText, setCardText] = useState("");
  const composeCancelled = useRef(false);
  const [editingCardId, setEditingCardId] = useState(null);
  // Ouverture de la fiche différée, le temps qu'un second clic puisse la
  // devancer pour ouvrir la saisie du titre.
  const ouvertureFiche = useRef(null);
  useEffect(() => () => clearTimeout(ouvertureFiche.current), []);
  const [editingCardText, setEditingCardText] = useState("");
  const editCancelled = useRef(false);

  // Ordre affiché pendant l'enregistrement d'un déplacement. Sans lui, la
  // relâche redessinerait à partir des props, encore porteuses de l'ancien
  // ordre : on verrait l'élément revenir à sa place le temps de l'aller-retour
  // serveur. Les props reprennent la main dès qu'elles arrivent.
  const [ordreLocal, setOrdreLocal] = useState(null);
  const colonnes = ordreLocal || lists;
  useEffect(() => setOrdreLocal(null), [lists]);

  const couleurs = useListColors();

  // Le tableau ouvert dit s'il montre le numéro de ses cartes. Un tableau pas
  // encore lu le montre : c'est le réglage par défaut.
  const tableau = (boards || []).find((b) => String(b.id) === String(boardId));
  const withNumber = tableau ? tableau.show_card_numbers !== 0 : true;

  // Salve de confettis en cours, tirée au-dessus d'une liste.
  const [confettis, setConfettis] = useState(null);

  // Une carte qui arrive dans une liste marquée ✨ se fête. La salve part du
  // haut de la liste, mesurée à l'écran : le tableau défile, sa position n'est
  // connue qu'à cet instant.
  const feteArrivee = (list) => {
    if (!list.name.includes(MARQUE_FETE)) return;
    const element = document.querySelector(`[data-list-id="${list.id}"]`);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setConfettis({
      cle: Date.now(),
      x: rect.left,
      y: rect.top,
      width: rect.width,
    });
  };

  // État du glisser en cours : une liste, ou une carte.
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const rowRef = useRef(null);
  const [cardDrag, setCardDrag] = useState(null);
  const cardDragRef = useRef(null);
  const cardTargetRef = useRef(null);
  // Conteneur des cartes de chaque liste, par identifiant de liste.
  const cardZones = useRef(new Map());

  // --- Renommage en ligne ------------------------------------------------
  const startEdit = (list) => {
    cancelled.current = false;
    setEditingId(list.id);
    setEditingName(list.name);
  };

  const cancelEdit = () => {
    cancelled.current = true;
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async (list) => {
    if (cancelled.current) return;
    const nom = editingName.trim();
    setEditingId(null);
    if (!nom || nom === list.name) return;
    try {
      await api.updateTaskList(list.id, { name: nom });
      await onListsChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  // --- Couleur d'une liste ------------------------------------------------
  const setListColor = async (list, color) => {
    if ((list.color || "") === color) return;
    // La liste prend sa couleur tout de suite : l'aller-retour serveur ne doit
    // pas laisser le menu se refermer sur l'ancien fond.
    setOrdreLocal(
      colonnes.map((l) => (l.id === list.id ? { ...l, color } : l)),
    );
    try {
      await api.updateTaskList(list.id, { color });
      await onListsChanged();
    } catch (e) {
      setOrdreLocal(null);
      setError(e.message);
    }
  };

  // --- Suppression d'une liste -------------------------------------------
  const deleteList = async (list) => {
    setPendingDelete(null);
    try {
      await api.deleteTaskList(list.id);
      await onListsChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  // --- Cartes : saisie et modification -----------------------------------
  // Dans les deux cas, Échap annule et la perte de focus valide.
  const startCompose = (list, index, kind = "card") => {
    composeCancelled.current = false;
    setCardCompose({ listId: list.id, index, kind });
    setCardText("");
  };

  const cancelCompose = () => {
    composeCancelled.current = true;
    setCardCompose(null);
    setCardText("");
  };

  // Entrée et la perte de focus mènent tous deux ici : le drapeau ferme la
  // porte derrière le premier des deux, sans quoi la carte serait créée deux
  // fois. startCompose le rouvre.
  const saveCompose = async (list, rang, kind = "card") => {
    if (composeCancelled.current) return;
    composeCancelled.current = true;
    const texte = cardText.trim();
    setCardCompose(null);
    setCardText("");
    if (!texte) return;

    const cartes = list.cards || [];
    const index = Math.min(rang ?? cartes.length, cartes.length);

    // La carte prend sa place tout de suite, au rang visé : sans cela le champ
    // s'effacerait sur du vide, et la carte n'apparaîtrait qu'au retour du
    // serveur. Le numéro provisoire est celui que le serveur attribuera, le
    // suivant parmi les cartes du tableau ; un séparateur n'en porte pas.
    const numero =
      colonnes
        .flatMap((l) => l.cards || [])
        .reduce((max, c) => Math.max(max, c.number || 0), 0) + 1;
    const provisoire = {
      id: `nouvelle-${numero}`,
      list_id: list.id,
      text: texte,
      number: kind === "separator" ? 0 : numero,
      kind,
    };
    setOrdreLocal(
      colonnes.map((l) =>
        l.id === list.id
          ? { ...l, cards: insere(cartes, index, provisoire) }
          : l,
      ),
    );

    try {
      // Le serveur ajoute toujours la carte à la fin : si elle s'insère plus
      // haut, l'ordre de la liste suit dans la foulée.
      const creee = await api.createTaskCard(list.id, texte, kind);
      if (index < cartes.length) {
        await api.reorderTaskCards(
          list.id,
          insere(cartes.map((c) => c.id), index, creee.id),
        );
      }
      await onListsChanged();
    } catch (e) {
      setOrdreLocal(null);
      setError(e.message);
    }
  };

  const startEditCard = (card) => {
    // Le second clic arrive avant que la fiche ne s'ouvre : on retire
    // l'ouverture en attente, sans quoi le tiroir viendrait par-dessus la
    // saisie qu'on vient d'ouvrir.
    clearTimeout(ouvertureFiche.current);
    editCancelled.current = false;
    setEditingCardId(card.id);
    setEditingCardText(card.text);
  };

  const cancelEditCard = () => {
    editCancelled.current = true;
    setEditingCardId(null);
    setEditingCardText("");
  };

  const saveEditCard = async (card) => {
    if (editCancelled.current) return;
    editCancelled.current = true;
    const texte = editingCardText.trim();
    setEditingCardId(null);
    if (!texte || texte === card.text) return;
    try {
      await api.updateTaskCard(card.id, texte);
      await onListsChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  // --- Glisser-déposer des listes ----------------------------------------

  // Index visé d'après la position horizontale du pointeur : toutes les listes
  // ont la même largeur, un simple calcul suffit.
  const targetFromPointer = useCallback(
    (clientX) => {
      const row = rowRef.current;
      if (!row) return 0;
      const rect = row.getBoundingClientRect();
      const x = clientX - rect.left + row.scrollLeft;
      const index = Math.floor(x / (LIST_WIDTH + LIST_GAP));
      return Math.max(0, Math.min(colonnes.length - 1, index));
    },
    [colonnes.length],
  );

  const onListPointerDown = (list, index) => (event) => {
    // Bouton principal uniquement, et jamais pendant un renommage.
    if (event.button !== 0 || editingId === list.id) return;
    // Les cartes, le menu et les champs de saisie ont leur propre rôle : un
    // appui sur eux ne déplace pas la liste.
    if (event.target.closest("[data-no-list-drag]")) return;

    const element = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: list.id,
      index,
      startX: event.clientX,
      startY: event.clientY,
      // Décalage du pointeur dans la carte, pour que le clone suive sans saut.
      offsetX: event.clientX - element.left,
      offsetY: event.clientY - element.top,
      started: false,
    };
  };

  useEffect(() => {
    const onMove = (event) => {
      const d = dragRef.current;
      if (!d) return;

      if (!d.started) {
        const distance = Math.hypot(
          event.clientX - d.startX,
          event.clientY - d.startY,
        );
        if (distance < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "pointer";
      }

      setDrag({
        id: d.id,
        from: d.index,
        target: targetFromPointer(event.clientX),
        x: event.clientX - d.offsetX,
        y: event.clientY - d.offsetY,
      });
    };

    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (!d || !d.started) return;

      const courant = drag;
      setDrag(null);
      if (!courant || courant.target === courant.from) return;

      // Nouvel ordre affiché aussitôt, puis enregistré.
      const ordre = colonnes.map((l) => l.id);
      const [deplacee] = ordre.splice(courant.from, 1);
      ordre.splice(courant.target, 0, deplacee);
      setOrdreLocal(ordre.map((id) => colonnes.find((l) => l.id === id)));
      try {
        await api.reorderTaskLists(Number(boardId), ordre);
        await onListsChanged();
      } catch (e) {
        setOrdreLocal(null);
        setError(e.message);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, colonnes, onListsChanged, targetFromPointer, boardId]);

  // --- Glisser-déposer des cartes ----------------------------------------

  // Liste et rang visés. Les cartes n'ont pas toutes la même hauteur : il faut
  // mesurer. « precedent » est l'emplacement d'accueil actuellement affiché.
  const cardTargetFromPointer = useCallback(
    (clientX, clientY, precedent) => {
      const liste = colonnes[targetFromPointer(clientX)];
      if (!liste) return null;
      const zone = cardZones.current.get(liste.id);
      if (!zone) return { listId: liste.id, index: 0 };

      // La carte déplacée ne s'affiche plus : ne restent que les autres.
      const cartes = [...zone.querySelectorAll("[data-card-id]")];

      // L'emplacement d'accueil occupe de la place et pousse vers le bas les
      // cartes qui le suivent. On retire ce décalage : sinon le rang calculé
      // dépendrait de l'emplacement affiché et oscillerait entre deux valeurs.
      const accueil = zone.querySelector("[data-card-placeholder]");
      const decalage = accueil
        ? accueil.getBoundingClientRect().height + CARD_GAP
        : 0;
      const rangAccueil =
        accueil && precedent && precedent.listId === liste.id
          ? precedent.index
          : cartes.length;

      let index = cartes.length;
      for (let i = 0; i < cartes.length; i += 1) {
        const rect = cartes[i].getBoundingClientRect();
        const haut = rect.top - (i >= rangAccueil ? decalage : 0);
        if (clientY < haut + rect.height / 2) {
          index = i;
          break;
        }
      }
      return { listId: liste.id, index };
    },
    [colonnes, targetFromPointer],
  );

  const basculerChecklist = (cardId) =>
    setChecklistsDepliees((ouvertes) => {
      const suivant = new Set(ouvertes);
      if (suivant.has(cardId)) suivant.delete(cardId);
      else suivant.add(cardId);
      return suivant;
    });

  // Cocher depuis la carte : l'élément quitte le panneau et la pastille
  // avance. La fiche n'a pas besoin d'être ouverte pour cela.
  const cocherChecklistItem = async (itemId) => {
    try {
      await api.updateChecklistItem(itemId, { done: true });
      await onListsChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  const onCardPointerDown = (card, list) => (event) => {
    if (event.button !== 0 || editingCardId === card.id) return;
    // Une étiquette répond elle-même au clic : elle ne déplace pas la carte et
    // n'ouvre pas sa fiche.
    if (event.target.closest("[data-no-card-drag]")) return;

    const element = event.currentTarget.getBoundingClientRect();
    cardTargetRef.current = null;
    cardDragRef.current = {
      id: card.id,
      listId: list.id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - element.left,
      offsetY: event.clientY - element.top,
      // Le clone et l'emplacement d'accueil reprennent la taille de la carte.
      width: element.width,
      height: element.height,
      started: false,
    };
  };

  useEffect(() => {
    const onMove = (event) => {
      const d = cardDragRef.current;
      if (!d) return;

      if (!d.started) {
        const distance = Math.hypot(
          event.clientX - d.startX,
          event.clientY - d.startY,
        );
        if (distance < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "pointer";
      }

      const target = cardTargetFromPointer(
        event.clientX,
        event.clientY,
        cardTargetRef.current,
      );
      cardTargetRef.current = target;
      setCardDrag({
        id: d.id,
        width: d.width,
        height: d.height,
        target,
        x: event.clientX - d.offsetX,
        y: event.clientY - d.offsetY,
      });
    };

    const onUp = async () => {
      const d = cardDragRef.current;
      const target = cardTargetRef.current;
      cardDragRef.current = null;
      cardTargetRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (!d) return;

      // Un appui qui n'a pas glissé est un clic : il ouvre la fiche de la
      // carte. Mais un double-clic, lui, ouvre la saisie du titre — et son
      // premier clic passe d'abord par ici. La fiche attend donc le délai du
      // double-clic ; si un second clic arrive, il annule l'attente
      // (« startEditCard »). Un séparateur n'a pas de fiche : rien à retenir.
      if (!d.started) {
        const carte = colonnes.flatMap((l) => l.cards || []).find((c) => c.id === d.id);
        if (carte && !estSeparateur(carte)) {
          clearTimeout(ouvertureFiche.current);
          ouvertureFiche.current = setTimeout(
            () => setCardOuverte(carte),
            DOUBLE_CLICK_DELAY,
          );
        }
        return;
      }

      setCardDrag(null);
      if (!target) return;

      const accueil = colonnes.find((l) => l.id === target.listId);
      if (!accueil) return;

      // Ordre complet de la liste d'accueil : ses cartes, la carte déplacée
      // ôtée si elle en venait, puis réinsérée au rang visé.
      const avant = (accueil.cards || []).map((c) => c.id);
      const ordre = avant.filter((id) => id !== d.id);
      ordre.splice(target.index, 0, d.id);
      if (target.listId === d.listId && ordre.join() === avant.join()) return;

      // La carte rejoint sa destination sans attendre la réponse du serveur.
      setOrdreLocal(withCardMoved(colonnes, d.id, accueil.id, target.index));
      // Venue d'une autre liste : l'arrivée se fête, si la liste le demande.
      if (target.listId !== d.listId) feteArrivee(accueil);
      try {
        await api.reorderTaskCards(accueil.id, ordre);
        await onListsChanged();
      } catch (e) {
        setOrdreLocal(null);
        setError(e.message);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [colonnes, onListsChanged, cardTargetFromPointer]);

  // --- Création d'une liste ----------------------------------------------
  const cancel = () => {
    setComposing(false);
    setName("");
    setError(null);
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createTaskList(Number(boardId), name.trim());
      await onListsChanged();
      // On enchaîne : le champ reste ouvert et vide pour la liste suivante.
      setName("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Ordre affiché pendant le glisser : la liste déplacée sort du flux et cède
  // sa place à un emplacement d'accueil à l'index visé.
  const dragged = drag ? colonnes.find((l) => l.id === drag.id) : null;
  const visibles = drag ? colonnes.filter((l) => l.id !== drag.id) : colonnes;

  const draggedCard = cardDrag
    ? colonnes.flatMap((l) => l.cards || []).find((c) => c.id === cardDrag.id)
    : null;
  // La liste d'où part une carte : un séparateur glissé garde le fond de sa
  // liste d'origine jusqu'à ce qu'il se pose.
  const listeDe = (card) => colonnes.find((l) => l.id === card.list_id);

  // Cartes d'une liste, avec l'emplacement d'accueil quand le glisser la vise
  // et, entre deux cartes, le point d'insertion qui ouvre une saisie.
  const renderCards = (list) => {
    const cartes = list.cards || [];
    // Saisie en cours dans cette liste, et le champ qui la porte : il est
    // écrit une fois, puis posé au rang visé.
    const saisie = cardCompose?.listId === list.id ? cardCompose : null;
    const separateur = saisie?.kind === "separator";
    const palette = couleurs(list.color);
    const champ = saisie ? (
      <Textarea
        data-no-list-drag="true"
        placeholder={
          separateur
            ? "Nom du séparateur"
            : "Saisissez le texte de la carte"
        }
        value={cardText}
        onChange={(e) => {
          const { value } = e.currentTarget;
          setCardText(value);
        }}
        onKeyDown={toucheCarte({
          setValue: setCardText,
          onCancel: cancelCompose,
          onSubmit: () => saveCompose(list, saisie.index, saisie.kind),
        })}
        onBlur={() => saveCompose(list, saisie.index, saisie.kind)}
        autosize
        minRows={separateur ? 1 : 2}
        autoFocus
        radius={CARD_RADIUS}
        styles={
          // Le séparateur s'écrit tel qu'il s'affichera : en gras, sur le fond
          // de la liste assombri.
          separateur
            ? {
                input: {
                  ...INPUT_NO_BORDER.input,
                  backgroundColor: palette.fondSeparateur,
                  color: palette.texteSeparateur,
                  fontWeight: 700,
                  // Le gris que Mantine donne au texte d'invite ne tient pas
                  // sur un fond coloré : on reprend la couleur du texte, juste
                  // assez estompée pour rester une invite.
                  "--input-placeholder-color": alpha(palette.texteSeparateur, 0.75),
                },
              }
            : INPUT_NO_BORDER
        }
        aria-label={
          separateur
            ? `Ajouter un séparateur dans ${list.name}`
            : `Ajouter une carte dans ${list.name}`
        }
      />
    ) : null;
    const affichees = cardDrag
      ? cartes.filter((c) => c.id !== cardDrag.id)
      : cartes;
    const rang =
      cardDrag && cardDrag.target && cardDrag.target.listId === list.id
        ? cardDrag.target.index
        : null;

    return (
      <Stack
        gap={CARD_GAP}
        ref={(el) => {
          if (el) cardZones.current.set(list.id, el);
          else cardZones.current.delete(list.id);
        }}
      >
        {affichees.map((card, index) => (
          <Fragment key={card.id}>
            {rang === index && <CardPlaceholder height={cardDrag.height} />}

            {/* Entre deux cartes : le trait pointillé qui ouvre une saisie à
                ce rang. Ni pendant un glisser, ni au-dessus de la première
                carte, ni là où la saisie est déjà ouverte. */}
            {index > 0 &&
              !cardDrag &&
              !drag &&
              saisie?.index !== index &&
              saisie?.index !== index - 1 && (
                <CardInsert
                  couleur={palette.traitInsertion}
                  onClick={() => startCompose(list, index)}
                />
              )}

            {saisie?.index === index && champ}

            <CardView
              card={card}
              editing={
                editingCardId === card.id ? { text: editingCardText } : null
              }
              onStartEdit={startEditCard}
              onEditChange={(e) => {
                const { value } = e.currentTarget;
                setEditingCardText(value);
              }}
              onEditKeyDown={toucheCarte({
                setValue: setEditingCardText,
                onCancel: cancelEditCard,
                onSubmit: () => saveEditCard(card),
              })}
              onEditBlur={() => saveEditCard(card)}
              onPointerDown={onCardPointerDown(card, list)}
              palette={palette}
              withNumber={withNumber}
              labelsCompactes={labelsCompactes}
              onLabelClick={() => setLabelsCompactes((c) => !c)}
              labels={labels}
              checklistOpen={checklistsDepliees.has(card.id)}
              onChecklistToggle={() => basculerChecklist(card.id)}
              onChecklistCheck={cocherChecklistItem}
            />
          </Fragment>
        ))}

        {/* Emplacement en fin de liste. */}
        {rang !== null && rang >= affichees.length && (
          <CardPlaceholder height={cardDrag.height} />
        )}

        {/* La saisie ouverte par « Ajouter une carte » ferme la pile. */}
        {saisie && saisie.index >= affichees.length && champ}
      </Stack>
    );
  };

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

      {/* Un tableau sans liste : l'invite occupe toute la hauteur du
          panneau, comme les autres écrans vides. Pendant une lecture, on
          n'affiche rien : « aucune liste » serait une conclusion prématurée. */}
      {colonnes.length === 0 && !composing ? (
        loading ? null : (
          <EmptyPanel
            icon={IconColumns}
            message="Aucune liste dans ce tableau"
            actionLabel="Ajouter une liste"
            onAction={() => setComposing(true)}
          />
        )
      ) : (
        <ScrollArea
          // La barre ne se montre que pendant le défilement, puis s'efface :
          // au repos, le trait de l'entête reste entier.
          type="scroll"
          // Le glisser mesure l'élément qui défile : ce n'est plus la rangée,
          // c'est le viewport de la zone.
          viewportRef={rowRef}
          classNames={{ scrollbar: classes.scrollbar, thumb: classes.thumb }}
          style={{ flex: 1, minHeight: 0 }}
        >
          <Group align="flex-start" gap={LIST_GAP} wrap="nowrap">
            {visibles.map((list, index) => (
              <Fragment key={list.id}>
                {drag && drag.target === index && <Placeholder list={dragged} withNumber={withNumber} labelsCompactes={labelsCompactes} />}
                <ListCard
                  list={list}
                  editing={editingId === list.id ? { name: editingName } : null}
                  onStartEdit={startEdit}
                  onEditChange={(e) => {
                    const { value } = e.currentTarget;
                    setEditingName(value);
                  }}
                  onEditKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(list);
                    if (e.key === "Escape") cancelEdit();
                  }}
                  onEditBlur={() => saveEdit(list)}
                  onPointerDown={onListPointerDown(list, colonnes.indexOf(list))}
                  onDelete={() => setPendingDelete(list)}
                  onMove={() => setMovedList(list)}
                  onColor={(color) => setListColor(list, color)}
                  onSeparator={() =>
                    startCompose(list, (list.cards || []).length, "separator")
                  }
                >
                  {renderCards(list)}

                  {cardCompose?.listId !== list.id && (
                    <AddCardButton
                      label="Ajouter une carte"
                      color={couleurs(list.color).texte}
                      onClick={() => startCompose(list, (list.cards || []).length)}
                    />
                  )}
                </ListCard>
              </Fragment>
            ))}

            {/* Emplacement en fin de rangée. */}
            {drag && drag.target >= visibles.length && (
              <Placeholder list={dragged} withNumber={withNumber} labelsCompactes={labelsCompactes} />
            )}

            {/* Toujours à droite des listes : le bouton cède la place à l'encart. */}
            {!composing && !drag && (
              <AddButton
                label="Ajouter une liste"
                onClick={() => setComposing(true)}
                style={{ flexShrink: 0 }}
              />
            )}

            {composing && (
              <Paper
                w={LIST_WIDTH}
                miw={LIST_WIDTH}
                radius="md"
                p={LIST_PADDING}
                style={{ backgroundColor: LIST_BG }}
              >
                <Stack gap="sm">
                  <TextInput
                    placeholder="Nom"
                    styles={INPUT_NO_BORDER}
                    value={name}
                    onChange={(e) => {
                      const { value } = e.currentTarget;
                      setName(value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") create();
                      if (e.key === "Escape") cancel();
                    }}
                    autoFocus
                  />
                  <Group justify="space-between" wrap="nowrap">
                    <Anchor
                      component="button"
                      type="button"
                      size="sm"
                      onClick={create}
                      disabled={busy || !name.trim()}
                    >
                      {/* Le même « + » que les autres actions « ajouter », et le
                          même écart à son libellé. */}
                      <Group gap={PLUS_GAP} wrap="nowrap">
                        <IconPlus size={PLUS_SIZE} />
                        <span>Ajouter la liste</span>
                      </Group>
                    </Anchor>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={cancel}
                      aria-label="Annuler"
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                </Stack>
              </Paper>
            )}
          </Group>
        </ScrollArea>
      )}

      {/* Clone qui suit le curseur, légèrement incliné. */}
      {drag && dragged && (
        <ListStill
          list={dragged}
          shadow="xl"
          withNumber={withNumber}
          labelsCompactes={labelsCompactes}
          data-drag-clone="true"
          style={{
            position: "fixed",
            left: drag.x,
            top: drag.y,
            transform: "rotate(3deg)",
            zIndex: 400,
          }}
        />
      )}

      {cardDrag && draggedCard && (
        <Paper
          w={cardDrag.width}
          radius={CARD_RADIUS}
          p="xs"
          shadow="xl"
          data-card-clone="true"
          style={{
            position: "fixed",
            left: cardDrag.x,
            top: cardDrag.y,
            transform: "rotate(3deg)",
            pointerEvents: "none",
            zIndex: 400,
            ...styleSeparateur(draggedCard, couleurs(listeDe(draggedCard)?.color)),
          }}
        >
          <CardContent
            card={draggedCard}
            withNumber={withNumber}
            labelsCompactes={labelsCompactes}
            labels={labels}
          />
        </Paper>
      )}

      {confettis && (
        <Confetti
          key={confettis.cle}
          x={confettis.x}
          y={confettis.y}
          width={confettis.width}
          onDone={() => setConfettis(null)}
        />
      )}

      <CardDrawer
        opened={cardOuverte !== null}
        onClose={() => setCardOuverte(null)}
        card={cardOuverte}
        labels={labels ?? []}
        users={users ?? []}
        boardId={boardId}
        onLabelsChanged={onLabelsChanged}
        onSaved={onListsChanged}
      />

      <MoveListModal
        opened={movedList !== null}
        onClose={() => setMovedList(null)}
        list={movedList}
        boards={boards}
        onMoved={onListsChanged}
      />

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => deleteList(pendingDelete)}
        title="Supprimer la liste"
        message={
          <>
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ?
            {pendingDelete?.cards?.length > 0 && (
              <>
                {" "}
                <strong>
                  {pendingDelete.cards.length} carte
                  {pendingDelete.cards.length > 1 ? "s" : ""}
                </strong>{" "}
                {pendingDelete.cards.length > 1
                  ? "seront supprimées"
                  : "sera supprimée"}
                .
              </>
            )}
          </>
        }
      />
    </Stack>
  );
}

// Emplacement d'accueil : la liste déplacée, rappelée en entier à 50 %
// d'opacité. On la voit derrière la copie qui suit le pointeur, à l'endroit où
// elle se posera.
function Placeholder({ list, withNumber, labelsCompactes }) {
  return (
    <ListStill
      list={list}
      withNumber={withNumber}
      labelsCompactes={labelsCompactes}
      data-drop-placeholder="true"
      style={{ opacity: 0.5 }}
    />
  );
}

// Emplacement d'accueil d'une carte : même hauteur que la carte déplacée, pour
// que la liste ne change pas de taille pendant le glisser.
function CardPlaceholder({ height }) {
  return (
    <Paper
      h={height}
      radius={CARD_RADIUS}
      data-card-placeholder="true"
      style={{ backgroundColor: CARD_PLACEHOLDER_BG }}
    />
  );
}
