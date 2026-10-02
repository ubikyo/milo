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
  IconCheck,
  IconCheckbox,
  IconClock,
  IconCircleOff,
  IconColumns,
  IconCopy,
  IconCopyPlus,
  IconEye,
  IconFolderSymlink,
  IconPencil,
  IconAlignLeft,
  IconPlus,
  IconSeparatorHorizontal,
  IconTrash,
  IconTrashX,
  IconX,
} from "@tabler/icons-react";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../../api";
import { INSERT_LINE, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import ActorAvatars from "../ui/ActorAvatars";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";
import ColumnInsert, { COLUMN_INSERT_ZONE } from "../ui/ColumnInsert";
import AddButton from "../ui/AddButton";
import { useDroits } from "../../lib/droits";
import { CardLabel } from "../ui/LabelChip";
import Confetti from "../ui/Confetti";
import CardDrawer from "./CardDrawer";
import MoveOrCopyListModal, { type ListAction } from "./MoveOrCopyListModal";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import EmptyPanel from "../ui/EmptyPanel";
import ErrorAlert from "../ui/ErrorAlert";
import classes from "../../assets/styles/TaskBoard.module.css";
import { messageErreur } from "../../lib/errors";
import { MOT_ECHEANCE, dateCourte, etatEcheance } from "../../lib/echeance";
import { BordureSelection } from "../ui/LabelColorPicker";
import type { EtatEcheance } from "../../lib/echeance";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { taskReference } from "@milo/shared";
import type {
  Board,
  FollowKind,
  Follows,
  Id,
  Label,
  ListColor,
  PublicUser,
  TaskCard,
  TaskList,
} from "@milo/shared";

/** Les couleurs d'une liste, résolues pour le thème courant. */
interface Palette {
  fond: string;
  texte: string;
  survol: string;
  texteSurvol: string;
  bordureCarte: string;
  fondSeparateur: string;
  texteSeparateur: string;
  traitInsertion: string;
}

/** Le glisser d'une liste, tel que le rendu le voit. */
interface GlisserListe {
  id: Id;
  /** Son rang de départ. */
  from: number;
  /** Le rang où elle se posera. */
  target: number;
  /** Position du clone qui suit le pointeur. */
  x: number;
  y: number;
}

/**
 * Le même geste, suivi hors du rendu par une référence : il change à chaque
 * mouvement du pointeur, et n'a pas à provoquer de rendu tant que le seuil de
 * déclenchement n'est pas franchi.
 */
interface GlisserListeEnCours {
  id: Id;
  index: number;
  startX: number;
  startY: number;
  /** Décalage du pointeur dans la carte, pour que le clone suive sans saut. */
  offsetX: number;
  offsetY: number;
  /** Faux tant que le pointeur n'a pas franchi le seuil de déclenchement. */
  started: boolean;
}

/** La liste d'accueil d'une carte et le rang qu'elle y prendra. */
interface CibleCarte {
  listId: Id;
  index: number;
}

/** Le glisser d'une carte, tel que le rendu le voit. */
interface GlisserCarte {
  id: Id;
  /** Le clone et l'emplacement d'accueil reprennent la taille de la carte. */
  width: number;
  height: number;
  target: CibleCarte | null;
  x: number;
  y: number;
}

interface GlisserCarteEnCours {
  id: Id;
  listId: Id;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  started: boolean;
  /** Sans le droit de modifier, l'appui reste un clic : la carte ne glisse pas. */
  figee: boolean;
}

/** Une carte qui vient d'être saisie, posée avant la réponse du serveur. */
interface CarteProvisoire {
  id: string;
  list_id: Id;
  text: string;
  number: number;
  kind: "card" | "separator";
}

/** La salve de confettis en cours, tirée au-dessus d'une liste. */
interface Confettis {
  cle: number;
  x: number;
  y: number;
  width: number;
}

/** La saisie d'une nouvelle carte : où elle se posera, et de quel genre. */
interface Composition {
  listId: Id;
  index: number;
  kind: "card" | "separator";
}

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
export function useListColors() {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");

  return useCallback(
    (color: string | null | undefined): Palette => {
      const sombre = colorScheme === "dark";
      // Le blanc n'est pas une teinte de la palette : il s'inverse d'un thème
      // à l'autre, blanc sur le sombre et noir sur le clair.
      let fond: string;
      let neutre = false;
      const palette = color ? theme.colors[color] : undefined;
      if (color === "white") fond = sombre ? theme.white : theme.black;
      else if (palette && LIST_COLORS.some((c) => c.value === color))
        fond = palette[getPrimaryShade(theme, colorScheme)] ?? palette[6]!;
      else {
        neutre = true;
        fond = (sombre ? theme.colors["dark"]?.[5] : theme.colors["gray"]?.[2]) ?? theme.white;
      }

      const lisible = (dessous: string): string =>
        getContrastColor({
          color: dessous,
          theme,
          autoContrast: true,
          colorScheme,
        });

      const creuse = darken(fond, 0.18);
      // Un séparateur se pose sur le fond de sa liste, assombri plus franchement
      // que le survol : il doit se lire comme un intertitre, pas comme un
      // élément survolé. Sauf sur la liste neutre du thème sombre : les cartes y
      // sont déjà plus sombres que la liste, et un séparateur assombri se
      // confondrait avec elles — il s'éclaircit donc.
      const creuseSepare = neutre && sombre ? lighten(fond, 0.15) : darken(fond, 0.35);
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
        traitInsertion: INSERT_LINE,
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
interface AddCardButtonProps {
  label: string;
  onClick: () => void;
  color: string;
}

function AddCardButton({ label, onClick, color }: AddCardButtonProps) {
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
const CARD_TEXT: CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word" };

// Entrée valide la carte, Cmd (ou Ctrl) + Entrée va à la ligne. Le navigateur
// n'insère rien de lui-même sur cette combinaison : on pose le retour à la
// ligne à la position du curseur, qu'on replace juste après.
const insererRetourLigne = (
  element: HTMLTextAreaElement,
  setValue: (value: string) => void,
): void => {
  const { value } = element;
  const debut = element.selectionStart ?? value.length;
  const fin = element.selectionEnd ?? debut;
  setValue(`${value.slice(0, debut)}\n${value.slice(fin)}`);
  requestAnimationFrame(() => {
    element.selectionStart = debut + 1;
    element.selectionEnd = debut + 1;
  });
};

// Touches communes à la saisie d'une carte et à sa modification : Échap
// annule, Entrée valide, Cmd/Ctrl + Entrée va à la ligne.
interface ToucheCarte {
  setValue: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const toucheCarte =
  ({ setValue, onCancel, onSubmit }: ToucheCarte) =>
  (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
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

// La pastille d'échéance : une horloge et le jour, en abrégé. Dès qu'une carte
// porte une date, elle se montre ; c'est sa couleur qui alerte, ou non. Rouge
// passé le jour dit, orange dans les trois jours qui le précèdent, et sinon un
// fond neutre — la date se lit, mais rien ne presse. Elle précède la pastille
// des checklists, comme l'échéance précède le titre dans la fiche.
const DUE_BG: Record<EtatEcheance, string> = {
  retard: "var(--mantine-color-red-filled)",
  bientot: "var(--mantine-color-orange-filled)",
  // Le gris des fonds discrets : la bulle se détache de la carte sans crier.
  aucun: "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))",
};

// Sur un fond plein, le blanc ; sur le fond neutre, la couleur du texte
// ordinaire — du blanc y serait illisible en thème clair.
const DUE_FG: Record<EtatEcheance, string> = {
  retard: "var(--mantine-color-white)",
  bientot: "var(--mantine-color-white)",
  aucun: "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))",
};

interface CardDueBadgeProps {
  card: TaskCard;
}

function CardDueBadge({ card }: CardDueBadgeProps) {
  const texte = dateCourte(card.due_date);
  if (!texte) return null;

  const etat = etatEcheance(card.due_date);
  const mot = MOT_ECHEANCE[etat];

  return (
    <span
      aria-label={mot ? `Échéance : ${texte} — ${mot}` : `Échéance : ${texte}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        borderRadius: 6,
        backgroundColor: DUE_BG[etat],
        color: DUE_FG[etat],
        flexShrink: 0,
      }}
    >
      <IconClock size={14} />
      <Text size="xs">{texte}</Text>
    </span>
  );
}

// La pastille des checklists : un symbole de case à cocher et le rapport des
// cases cochées au total, cumulé sur toutes les checklists de la carte. Elle
// se clique pour déplier, sous la carte, ce qu'il reste à faire. Une fois tout
// coché, elle s'encadre de vert : la carte est faite, cela doit se voir sans
// lire le compte.
const CHECKLIST_DONE_BG = "var(--mantine-color-teal-filled)";

// Ce qu'il reste à cocher se détache du corps de la carte par un filet et un
// peu d'air : déplié, on voit d'un coup où finit la carte et où commence sa
// liste. Le même air sépare les lignes entre elles : deux cases à cocher
// collées se lisent comme un bloc, alors qu'on les coche une par une.
const CHECKLIST_PANEL_RULE = "1px solid var(--mantine-color-default-border)";
const CHECKLIST_PANEL_MARGIN = 6;
const CHECKLIST_PANEL_PAD = 10;
const CHECKLIST_ITEM_GAP = 8;

interface CardChecklistBadgeProps {
  card: TaskCard;
  onToggle: () => void;
}

function CardChecklistBadge({ card, onToggle }: CardChecklistBadgeProps) {
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
// pastille, sans ouvrir la fiche. Plus rien à cocher, plus de panneau : la
// pastille verte le dit déjà, un « Tout est coché » sous la carte ne ferait
// que l'allonger.
interface CardChecklistPanelProps {
  card: TaskCard;
  onCheck: (itemId: Id) => void;
}

function CardChecklistPanel({ card, onCheck }: CardChecklistPanelProps) {
  const restants = card.checklist_open || [];
  if (restants.length === 0) return null;

  return (
    <Stack
      gap={CHECKLIST_ITEM_GAP}
      data-no-card-drag="true"
      pt={CHECKLIST_PANEL_PAD}
      mt={CHECKLIST_PANEL_MARGIN}
      style={{ borderTop: CHECKLIST_PANEL_RULE }}
    >
      {restants.map((item) => (
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
      ))}
    </Stack>
  );
}

// Bas de la carte : le signe d'une description et la référence à gauche, les
// membres à droite. La référence (« TSK-12 ») est un repère discret pour la
// désigner, donné par le compteur commun aux modes ; un tableau peut la taire
// (« Numéros des cartes », dans son tiroir). Les bulles se
// recouvrent comme dans le tableau des projets ; sans membre, la ligne n'en
// montre aucune.
interface CardNumberProps {
  card: TaskCard;
  withNumber: boolean;
  onChecklistToggle: () => void;
}

function CardNumber({ card, withNumber, onChecklistToggle }: CardNumberProps) {
  const membres = card.members || [];

  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
      <Group gap={6} align="center" wrap="nowrap" c="dimmed">
        {/* Le picto dit qu'il y a autre chose à lire dans la fiche. */}
        {card.has_description && (
          <IconAlignLeft size={14} aria-label="Cette carte a une description" />
        )}
        {/* L'échéance ouvre la ligne : une carte en retard doit se voir
            avant qu'on lise ce qu'elle porte. */}
        <CardDueBadge card={card} />
        {/* Les cases cochées passent avant le numéro : c'est l'avancement
            qu'on cherche du regard, pas le repère. */}
        <CardChecklistBadge
          card={card}
          onToggle={onChecklistToggle}
        />
        {/* Une carte qui attend encore le serveur n'a pas de référence. */}
        {withNumber && card.number > 0 && <Text size="xs">{taskReference(card.number)}</Text>}
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
const estSeparateur = (card: TaskCard): boolean => card.kind === "separator";

// Le fond d'un séparateur : celui de sa liste, assombri. Une carte ordinaire
// garde le fond que Mantine donne au Paper.
const styleSeparateur = (card: TaskCard, palette: Palette): CSSProperties | null =>
  estSeparateur(card)
    ? {
        backgroundColor: palette.fondSeparateur,
        color: palette.texteSeparateur,
      }
    : null;

// Ce que montre une carte. Posé à part : la carte elle-même, la copie qui suit
// le pointeur et les cartes de la liste qu'on déplace s'en servent toutes.
interface CardContentProps {
  card: TaskCard;
  withNumber?: boolean;
  labelsCompactes?: boolean;
  onLabelClick?: () => void;
  /** Les étiquettes du tableau : elles font foi sur celles que porte la carte. */
  labels?: Label[];
  checklistOpen?: boolean;
  onChecklistToggle?: () => void;
  onChecklistCheck?: (itemId: Id) => void;
}

function CardContent({
  card,
  withNumber = true,
  labelsCompactes,
  onLabelClick,
  labels,
  checklistOpen = false,
  onChecklistToggle,
  onChecklistCheck,
}: CardContentProps) {
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
        onChecklistToggle={onChecklistToggle ?? (() => {})}
      />
      {/* Déplié par la pastille : ce qu'il reste à cocher, sous la carte. */}
      {checklistOpen && (
        <CardChecklistPanel card={card} onCheck={onChecklistCheck ?? (() => {})} />
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
function CardInsert({ couleur, onClick }: { couleur: string; onClick: () => void }) {
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
interface CardStillProps {
  card: TaskCard;
  palette: Palette;
  withNumber: boolean;
  labelsCompactes: boolean;
}

function CardStill({ card, palette, withNumber, labelsCompactes }: CardStillProps) {
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
const insere = <T,>(liste: T[], index: number, valeur: T): T[] => {
  const copie = [...liste];
  copie.splice(index, 0, valeur);
  return copie;
};

// Déplacement d'une carte dans une copie des listes, pour l'afficher avant que
// le serveur ait répondu.
const withCardMoved = (
  lists: TaskList[],
  cardId: Id,
  toListId: Id,
  index: number,
): TaskList[] => {
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

/** Le renommage en cours d'une liste. */
interface EditionListe {
  id: Id;
  name: string;
}

interface ListCardProps {
  list: TaskList;
  editing: EditionListe | null;
  onStartEdit: () => void;
  onEditChange: (event: { currentTarget: { value: string } }) => void;
  onEditKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onEditBlur: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onDelete: () => void;
  onDeleteTasks: () => void;
  onMove: () => void;
  onCopy: () => void;
  onColor: (color: string) => void;
  onSeparator: () => void;
  /** Suivre cette liste, c'est être prévenu de ce qui arrive à ses cartes. */
  suivie: boolean;
  onToggleFollow: () => void;
  /** Tableau verrouillé : la liste ne se déplace ni ne se supprime. */
  verrouillee: boolean;
  /** Les droits du compte dans la société du tableau. */
  droits: DroitsTableau;
  children?: ReactNode;
}

/** Ce que le compte peut faire dans le tableau ouvert, selon sa société. */
interface DroitsTableau {
  ajouter: boolean;
  modifier: boolean;
  supprimer: boolean;
}

function ListCard({
  list,
  editing,
  onStartEdit,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onPointerDown,
  onDelete,
  onDeleteTasks,
  onMove,
  onCopy,
  onColor,
  onSeparator,
  suivie,
  onToggleFollow,
  verrouillee,
  droits,
  children,
}: ListCardProps) {
  // Le menu s'ouvre au clic droit, au point cliqué. Il se ferme de lui-même
  // sur ses entrées, mais pas sur les pastilles de couleur, qui n'en sont
  // pas : on le pilote pour qu'un choix le referme.
  const [menu, setMenu] = useState<PointMenuPosition | null>(null);
  const couleurs = useListColors();
  const sienne = couleurs(list.color);
  const taches = (list.cards || []).filter((c) => !estSeparateur(c)).length;

  // Un champ de saisie garde le menu du navigateur : couper, coller.
  const ouvrirMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea")) return;
    setMenu(positionDuMenu(event));
  };

  return (
    <Paper
      w={LIST_WIDTH}
      miw={LIST_WIDTH}
      radius="md"
      p={LIST_PADDING}
      data-list-id={list.id}
      // Une liste se glisse par son propre geste : elle n'emporte pas le
      // widget qui porte le tableau (IndicatorsPanel).
      data-no-widget-drag="true"
      onPointerDown={onPointerDown}
      onContextMenu={ouvrirMenu}
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
              onClick={droits.modifier ? onStartEdit : undefined}
              style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
            >
              {list.name}
            </Text>
          )}

          {/* Combien de cartes porte la liste, au bout du titre. Les
              séparateurs ne comptent pas : ils rangent les cartes, ils n'en
              sont pas. */}
          <Text size="xs" c={sienne.texte} opacity={0.7} style={{ flexShrink: 0 }}>
            {taches}
          </Text>
        </Group>

        {children}
      </Stack>

      {/* Mantine rend le focus à l'ancre un instant après la fermeture du
          menu. « Séparateur » ouvre une saisie qui prend le focus dans le
          même souffle : sans « returnFocus », elle le perdrait aussitôt et
          se refermerait sur du vide. */}
      {menu && (
        <PointMenu position={menu} onClose={() => setMenu(null)} returnFocus={false}>
          {/* Le séparateur se saisit comme une carte, à la fin de la
              liste ; on le glisse ensuite là où il doit trancher. */}
          {/* Cochée, la liste est suivie : toute modification de ses
              cartes vaut notification. La coche est à droite comme dans
              les menus du système, l'œil à gauche comme les autres icônes. */}
          <Menu.Item
            leftSection={<IconEye size={16} />}
            rightSection={suivie ? <IconCheck size={14} /> : null}
            onClick={onToggleFollow}
            closeMenuOnClick={false}
          >
            Suivre
          </Menu.Item>

          {(droits.ajouter || droits.modifier) && <Menu.Divider />}

          {droits.ajouter && (
            <Menu.Item
              leftSection={<IconSeparatorHorizontal size={16} />}
              onClick={onSeparator}
            >
              Séparateur
            </Menu.Item>
          )}
          {/* Vers un autre tableau, la liste quitterait celui-ci : un
              tableau verrouillé la garde. */}
          {!verrouillee && droits.modifier && (
            <Menu.Item
              leftSection={<IconFolderSymlink size={16} />}
              onClick={onMove}
            >
              Déplacer
            </Menu.Item>
          )}
          {/* Copier suit déplacer : même question — vers quel tableau ? —
              et la même boîte y répond, le tableau courant compris. */}
          {droits.ajouter && (
            <Menu.Item
              leftSection={<IconCopy size={16} />}
              onClick={onCopy}
            >
              Copier
            </Menu.Item>
          )}

          {droits.modifier && (
            <>
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
                      setMenu(null);
                      onColor(couleur.value);
                    }}
                    style={{ cursor: "pointer" }}
                    aria-label={couleur.label}
                    aria-pressed={couleur.value === list.color}
                  >
                    {couleur.value === list.color && <BordureSelection />}
                  </ColorSwatch>
                ))}
              </SimpleGrid>
              <Menu.Item
                leftSection={<IconCircleOff size={16} />}
                onClick={() => onColor("")}
              >
                Aucune
              </Menu.Item>
            </>
          )}

          {droits.supprimer && (
            <>
              <Menu.Divider />
              {/* Vider la liste sans la supprimer : ses séparateurs restent. */}
              <Menu.Item
                color={RED}
                leftSection={<IconTrashX size={16} />}
                onClick={onDeleteTasks}
                disabled={taches === 0}
              >
                Supprimer tâches
              </Menu.Item>
              {!verrouillee && (
                <Menu.Item
                  color={RED}
                  leftSection={<IconTrash size={16} />}
                  onClick={onDelete}
                >
                  Supprimer
                </Menu.Item>
              )}
            </>
          )}
        </PointMenu>
      )}
    </Paper>
  );
}

// --- Carte ----------------------------------------------------------------

/** La saisie en cours sur une carte : celle qu'on modifie, et son texte. */
interface EditionCarte {
  id: Id;
  text: string;
}

interface CardViewProps {
  card: TaskCard;
  editing: EditionCarte | null;
  onStartEdit: (card: TaskCard) => void;
  onEditChange: (event: { currentTarget: { value: string } }) => void;
  onEditKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onEditBlur: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onContextMenu: (card: TaskCard, position: PointMenuPosition) => void;
  /** Son menu est ouvert : elle garde le cadre du survol. */
  active: boolean;
  palette: Palette;
  withNumber: boolean;
  labelsCompactes: boolean;
  onLabelClick: () => void;
  labels: Label[];
  checklistOpen: boolean;
  onChecklistToggle: () => void;
  onChecklistCheck: (itemId: Id) => void;
}

function CardView({
  card,
  editing,
  onStartEdit,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onPointerDown,
  onContextMenu,
  active,
  palette,
  withNumber,
  labelsCompactes,
  onLabelClick,
  labels,
  checklistOpen,
  onChecklistToggle,
  onChecklistCheck,
}: CardViewProps) {
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
      onContextMenu={(e) => onContextMenu(card, positionDuMenu(e))}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        touchAction: "none",
        cursor: "pointer",
        border: `2px solid ${hovered || active ? palette.bordureCarte : "transparent"}`,
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
interface ListStillProps {
  list: TaskList;
  style?: CSSProperties;
  shadow?: string;
  withNumber: boolean;
  labelsCompactes: boolean;
  [autre: string]: unknown;
}

function ListStill({
  list,
  style,
  shadow,
  withNumber,
  labelsCompactes,
  ...props
}: ListStillProps) {
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
        <AddCardButton label="Ajouter une carte" color={sienne.texte} onClick={() => {}} />
      </Stack>
    </Paper>
  );
}

interface TaskBoardProps {
  boardId: string | null;
  boards: Board[];
  lists: TaskList[];
  loading: boolean;
  onListsChanged: () => void | Promise<void>;
  labels: Label[];
  users: PublicUser[];
  onLabelsChanged: (patch?: { id: number; data: Partial<Label> }) => void | Promise<void>;
  follows: Follows;
  onToggleFollow: (kind: FollowKind, id: Id) => void | Promise<void>;
  carteAOuvrir: Id | null;
  onCarteOuverte: (id: Id | null) => void;
}

/**
 * Le tableau ouvert, tel que la page le met en scène : le widget des listes
 * (task-indicators/liste.tsx) le lit ici, où qu'il soit posé dans les
 * sections.
 */
export const TableauDesTachesContext = createContext<TaskBoardProps | null>(null);

/**
 * Les listes du tableau en widget. Remonté à chaque tableau : une saisie ou
 * un glisser en cours ne traverse pas le changement d'onglet.
 */
export function TableauDesTachesWidget() {
  const tableau = useContext(TableauDesTachesContext);
  if (!tableau) return null;
  return <TaskBoard key={tableau.boardId} {...tableau} />;
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
  follows,
  onToggleFollow,
  carteAOuvrir,
  onCarteOuverte,
}: TaskBoardProps) {
  const [composing, setComposing] = useState(false);
  // Le rang où la liste saisie prendra place : « null », au bout. Le « + »
  // entre deux listes en donne un, et l'encart s'ouvre à cet endroit.
  const [rangNouvelle, setRangNouvelle] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<Id | null>(null);
  const [editingName, setEditingName] = useState("");
  // Échap doit annuler sans que la perte de focus n'enregistre au passage.
  const cancelled = useRef(false);

  const [pendingDelete, setPendingDelete] = useState<TaskList | null>(null);
  // La liste qu'on demande à vider de ses tâches.
  const [listeAVider, setListeAVider] = useState<TaskList | null>(null);
  // Liste dont on choisit le tableau d'accueil.
  // La liste qu'on s'apprête à déplacer ou à copier, et lequel des deux.
  const [listeVisee, setListeVisee] = useState<{ list: TaskList; mode: ListAction } | null>(
    null,
  );
  // Carte dont la fiche est ouverte.
  const [cardOuverte, setCardOuverte] = useState<TaskCard | null>(null);
  // Le menu contextuel d'une carte, et la carte dont on demande la
  // suppression.
  const [menuCarte, setMenuCarte] = useState<
    { card: TaskCard; position: PointMenuPosition } | null
  >(null);
  const [carteASupprimer, setCarteASupprimer] = useState<TaskCard | null>(null);

  // Une carte désignée de l'extérieur — par l'adresse, ou par le lien d'une
  // notification. L'application s'est déjà placée sur le bon tableau ; on
  // attend simplement que ses listes soient lues pour y trouver la carte.
  useEffect(() => {
    if (carteAOuvrir === null) return;
    for (const liste of lists) {
      const carte = liste.cards.find((c) => c.id === carteAOuvrir);
      if (carte) {
        setCardOuverte(carte);
        return;
      }
    }
  }, [carteAOuvrir, lists]);

  // La copie qu'on vient de dupliquer : sa fiche s'ouvre dès que les listes
  // relues la portent, pour qu'on la reprenne comme base d'une autre.
  const [copieAOuvrir, setCopieAOuvrir] = useState<Id | null>(null);
  useEffect(() => {
    if (copieAOuvrir === null) return;
    const copie = lists.flatMap((l) => l.cards).find((c) => c.id === copieAOuvrir);
    if (copie) {
      setCopieAOuvrir(null);
      setCardOuverte(copie);
    }
  }, [copieAOuvrir, lists]);

  // L'adresse suit la carte ouverte : c'est l'application qui l'écrit, le
  // tableau lui dit seulement ce qu'il montre.
  useEffect(() => {
    onCarteOuverte(cardOuverte?.id ?? null);
  }, [cardOuverte, onCarteOuverte]);
  // Les étiquettes se replient en barres, ou se déploient avec leur nom : le
  // choix vaut pour tout le tableau, comme un réglage d'affichage.
  const [labelsCompactes, setLabelsCompactes] = useState(false);
  // Cartes dont le panneau « ce qu'il reste à faire » est déplié. Chaque carte
  // garde le sien : on peut en ouvrir plusieurs à la fois.
  const [checklistsDepliees, setChecklistsDepliees] = useState<Set<Id>>(() => new Set());

  // Saisie d'une nouvelle carte : la liste, le rang où elle prendra place et
  // son genre (« card » ou « separator »). Modification d'une carte existante
  // juste en dessous.
  const [cardCompose, setCardCompose] = useState<Composition | null>(null);
  const [cardText, setCardText] = useState("");
  const composeCancelled = useRef(false);
  const [editingCardId, setEditingCardId] = useState<Id | null>(null);
  // Ouverture de la fiche différée, le temps qu'un second clic puisse la
  // devancer pour ouvrir la saisie du titre.
  const ouvertureFiche = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(ouvertureFiche.current), []);
  const [editingCardText, setEditingCardText] = useState("");
  const editCancelled = useRef(false);

  // Ordre affiché pendant l'enregistrement d'un déplacement. Sans lui, la
  // relâche redessinerait à partir des props, encore porteuses de l'ancien
  // ordre : on verrait l'élément revenir à sa place le temps de l'aller-retour
  // serveur. Les props reprennent la main dès qu'elles arrivent.
  const [ordreLocal, setOrdreLocal] = useState<TaskList[] | null>(null);
  const colonnes = ordreLocal || lists;
  useEffect(() => setOrdreLocal(null), [lists]);

  const couleurs = useListColors();

  // Le tableau ouvert dit s'il montre le numéro de ses cartes. Un tableau pas
  // encore lu le montre : c'est le réglage par défaut.
  const tableau = (boards || []).find((b) => String(b.id) === String(boardId));
  const withNumber = tableau ? tableau.show_card_numbers !== 0 : true;
  // Verrouillé, le tableau garde ses listes : ni ajout, ni déplacement, ni
  // suppression. Les cartes, elles, se glissent toujours.
  const verrouille = tableau?.is_locked === 1;
  // Ce que le compte peut faire ici dépend de la société du tableau : qui ne
  // fait que lire ouvre les fiches, sans rien ajouter, glisser ni supprimer.
  const peut = useDroits();
  const droits: DroitsTableau = {
    ajouter: peut("tasks", "create", tableau?.company_id),
    modifier: peut("tasks", "update", tableau?.company_id),
    supprimer: peut("tasks", "delete", tableau?.company_id),
  };
  // Pas de liste ajoutée : verrouillé, ou sans le droit.
  const sansAjoutDeListe = verrouille || !droits.ajouter;

  // Salve de confettis en cours, tirée au-dessus d'une liste.
  const [confettis, setConfettis] = useState<Confettis | null>(null);

  // Une carte qui arrive dans une liste marquée ✨ se fête. La salve part du
  // haut de la liste, mesurée à l'écran : le tableau défile, sa position n'est
  // connue qu'à cet instant.
  const feteArrivee = (list: TaskList) => {
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
  const [drag, setDrag] = useState<GlisserListe | null>(null);
  const dragRef = useRef<GlisserListeEnCours | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [cardDrag, setCardDrag] = useState<GlisserCarte | null>(null);
  const cardDragRef = useRef<GlisserCarteEnCours | null>(null);
  const cardTargetRef = useRef<CibleCarte | null>(null);

  // La hauteur de chaque liste, suivie à l'écran : le « + » entre deux listes
  // prend celle de la plus haute des deux, et non celle de toute la rangée.
  const [hauteurs, setHauteurs] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    const rangee = rowRef.current;
    if (!rangee) return undefined;
    const observateur = new ResizeObserver((entrees) => {
      setHauteurs((avant) => {
        let suivant: Map<string, number> | null = null;
        for (const entree of entrees) {
          const id = (entree.target as HTMLElement).dataset.listId;
          const hauteur = (entree.target as HTMLElement).offsetHeight;
          if (!id || avant.get(id) === hauteur) continue;
          suivant ??= new Map(avant);
          suivant.set(id, hauteur);
        }
        return suivant ?? avant;
      });
    });
    rangee.querySelectorAll("[data-list-id]").forEach((liste) => observateur.observe(liste));
    return () => observateur.disconnect();
  }, [colonnes]);
  // Conteneur des cartes de chaque liste, par identifiant de liste.
  const cardZones = useRef(new Map<Id, HTMLElement>());

  // --- Renommage en ligne ------------------------------------------------
  const startEdit = (list: TaskList) => {
    if (!droits.modifier) return;
    cancelled.current = false;
    setEditingId(list.id);
    setEditingName(list.name);
  };

  const cancelEdit = () => {
    cancelled.current = true;
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async (list: TaskList) => {
    if (cancelled.current) return;
    const nom = editingName.trim();
    setEditingId(null);
    if (!nom || nom === list.name) return;
    try {
      await api.updateTaskList(list.id, { name: nom });
      await onListsChanged();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  // --- Couleur d'une liste ------------------------------------------------
  const setListColor = async (list: TaskList, color: string) => {
    if ((list.color || "") === color) return;
    // La liste prend sa couleur tout de suite : l'aller-retour serveur ne doit
    // pas laisser le menu se refermer sur l'ancien fond.
    setOrdreLocal(
      colonnes.map((l) => (l.id === list.id ? { ...l, color } : l)),
    );
    try {
      await api.updateTaskList(list.id, { color: color as ListColor });
      await onListsChanged();
    } catch (e) {
      setOrdreLocal(null);
      setError(messageErreur(e));
    }
  };

  // --- Suppression d'une liste -------------------------------------------
  const deleteList = async (list: TaskList) => {
    setPendingDelete(null);
    try {
      await api.deleteTaskList(list.id);
      await onListsChanged();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const deleteTasks = async (list: TaskList) => {
    setListeAVider(null);
    // La fiche ouverte sur une tâche de cette liste n'aurait plus de carte.
    if (cardOuverte && cardOuverte.list_id === list.id && !estSeparateur(cardOuverte)) {
      setCardOuverte(null);
    }
    try {
      await api.deleteTaskListCards(list.id);
      await onListsChanged();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const deleteCard = async (card: TaskCard) => {
    setCarteASupprimer(null);
    if (cardOuverte?.id === card.id) setCardOuverte(null);
    try {
      await api.deleteTaskCard(card.id);
      await onListsChanged();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  // --- Cartes : saisie et modification -----------------------------------
  // Dans les deux cas, Échap annule et la perte de focus valide.
  const startCompose = (list: TaskList, index: number, kind: "card" | "separator" = "card") => {
    if (!droits.ajouter) return;
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
  const saveCompose = async (
    list: TaskList,
    rang: number | null,
    kind: "card" | "separator" = "card",
  ) => {
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
    // serveur. Sa référence, elle, attend le serveur : le compteur est commun
    // à tous les modes, et rien ici ne dit la suivante.
    const provisoire: CarteProvisoire = {
      id: `nouvelle-${Date.now()}`,
      list_id: list.id,
      text: texte,
      number: 0,
      kind,
    };
    // La carte provisoire n'a pas encore d'identifiant de ligne : elle tient
    // la place d'une vraie le temps de l'aller-retour.
    setOrdreLocal(
      colonnes.map((l) =>
        l.id === list.id
          ? { ...l, cards: insere(cartes, index, provisoire as unknown as TaskCard) }
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
      setError(messageErreur(e));
    }
  };

  const startEditCard = (card: TaskCard) => {
    // Le second clic arrive avant que la fiche ne s'ouvre : on retire
    // l'ouverture en attente, sans quoi le tiroir viendrait par-dessus la
    // saisie qu'on vient d'ouvrir.
    if (!droits.modifier) return;
    clearTimeout(ouvertureFiche.current);
    editCancelled.current = false;
    setEditingCardId(card.id);
    setEditingCardText(card.text);
  };

  // « Modifier » ouvre la fiche ; un séparateur, qui n'en a pas, se modifie
  // sur le tableau.
  const modifierCarte = (card: TaskCard) => {
    if (estSeparateur(card)) startEditCard(card);
    else setCardOuverte(card);
  };

  // Un séparateur dupliqué n'a pas de fiche : il se pose sous l'original,
  // et l'on glisse ensuite celui des deux qui doit trancher ailleurs.
  const dupliquerCarte = async (card: TaskCard) => {
    try {
      const copie = await api.duplicateTaskCard(card.id);
      await onListsChanged();
      if (!estSeparateur(card)) setCopieAOuvrir(copie.id);
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const cancelEditCard = () => {
    editCancelled.current = true;
    setEditingCardId(null);
    setEditingCardText("");
  };

  const saveEditCard = async (card: TaskCard) => {
    if (editCancelled.current) return;
    editCancelled.current = true;
    const texte = editingCardText.trim();
    setEditingCardId(null);
    if (!texte || texte === card.text) return;
    try {
      await api.updateTaskCard(card.id, texte);
      await onListsChanged();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  // --- Glisser-déposer des listes ----------------------------------------

  // Index visé d'après la position horizontale du pointeur : toutes les listes
  // ont la même largeur, un simple calcul suffit.
  const targetFromPointer = useCallback(
    (clientX: number): number => {
      const row = rowRef.current;
      if (!row) return 0;
      const rect = row.getBoundingClientRect();
      const x = clientX - rect.left + row.scrollLeft;
      const index = Math.floor(x / (LIST_WIDTH + LIST_GAP));
      return Math.max(0, Math.min(colonnes.length - 1, index));
    },
    [colonnes.length],
  );

  const onListPointerDown =
    (list: TaskList, index: number) => (event: ReactPointerEvent) => {
    // Bouton principal uniquement, jamais pendant un renommage ni sur un
    // tableau verrouillé.
    if (event.button !== 0 || editingId === list.id || verrouille || !droits.modifier) return;
    // Les cartes, le menu et les champs de saisie ont leur propre rôle : un
    // appui sur eux ne déplace pas la liste.
    if ((event.target as HTMLElement).closest("[data-no-list-drag]")) return;

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
    const onMove = (event: PointerEvent) => {
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
      if (deplacee === undefined) return;
      ordre.splice(courant.target, 0, deplacee);
      setOrdreLocal(
        ordre
          .map((id) => colonnes.find((l) => l.id === id))
          .filter((l): l is TaskList => Boolean(l)),
      );
      try {
        await api.reorderTaskLists(Number(boardId), ordre);
        await onListsChanged();
      } catch (e) {
        setOrdreLocal(null);
        setError(messageErreur(e));
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
    (clientX: number, clientY: number, precedent: CibleCarte | null): CibleCarte | null => {
      const liste = colonnes[targetFromPointer(clientX)];
      if (!liste) return null;
      const zone = cardZones.current.get(liste.id);
      if (!zone) return { listId: liste.id, index: 0 };

      // La carte déplacée ne s'affiche plus : ne restent que les autres.
      const cartes = [...zone.querySelectorAll<HTMLElement>("[data-card-id]")];

      // L'emplacement d'accueil occupe de la place et pousse vers le bas les
      // cartes qui le suivent. On retire ce décalage : sinon le rang calculé
      // dépendrait de l'emplacement affiché et oscillerait entre deux valeurs.
      const accueil = zone.querySelector("[data-card-placeholder]");
      const decalage = accueil
        ? (accueil as HTMLElement).getBoundingClientRect().height + CARD_GAP
        : 0;
      const rangAccueil =
        accueil && precedent && precedent.listId === liste.id
          ? precedent.index
          : cartes.length;

      let index = cartes.length;
      for (let i = 0; i < cartes.length; i += 1) {
        const rect = (cartes[i] as HTMLElement).getBoundingClientRect();
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

  const basculerChecklist = (cardId: Id) =>
    setChecklistsDepliees((ouvertes) => {
      const suivant = new Set(ouvertes);
      if (suivant.has(cardId)) suivant.delete(cardId);
      else suivant.add(cardId);
      return suivant;
    });

  // Cocher depuis la carte : l'élément quitte le panneau et la pastille
  // avance. La fiche n'a pas besoin d'être ouverte pour cela.
  const cocherChecklistItem = async (itemId: Id) => {
    if (!droits.modifier) return;
    try {
      await api.updateChecklistItem(itemId, { done: true });
      await onListsChanged();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const onCardPointerDown =
    (card: TaskCard, list: TaskList) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || editingCardId === card.id) return;
    // Une étiquette répond elle-même au clic : elle ne déplace pas la carte et
    // n'ouvre pas sa fiche.
    if ((event.target as HTMLElement).closest("[data-no-card-drag]")) return;

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
      figee: !droits.modifier,
    };
    };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const d = cardDragRef.current;
      if (!d) return;

      if (!d.started) {
        if (d.figee) return;
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
        setError(messageErreur(e));
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
    setRangNouvelle(null);
    setName("");
    setError(null);
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createTaskList(Number(boardId), name.trim(), rangNouvelle ?? undefined);
      await onListsChanged();
      // On enchaîne : le champ reste ouvert et vide pour la liste suivante,
      // qui se range juste après celle qu'on vient de créer.
      setName("");
      setRangNouvelle((r) => (r === null ? null : r + 1));
    } catch (e) {
      setError(messageErreur(e));
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
  const listeDe = (card: TaskCard): TaskList | undefined =>
    colonnes.find((l) => l.id === card.list_id);

  // Cartes d'une liste, avec l'emplacement d'accueil quand le glisser la vise
  // et, entre deux cartes, le point d'insertion qui ouvre une saisie.
  const renderCards = (list: TaskList) => {
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
            {rang === index && cardDrag && <CardPlaceholder height={cardDrag.height} />}

            {/* Entre deux cartes : le trait pointillé qui ouvre une saisie à
                ce rang. Ni pendant un glisser, ni au-dessus de la première
                carte, ni là où la saisie est déjà ouverte. */}
            {index > 0 &&
              droits.ajouter &&
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
                editingCardId === card.id ? { id: card.id, text: editingCardText } : null
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
              onContextMenu={(carte, position) => setMenuCarte({ card: carte, position })}
              active={menuCarte?.card.id === card.id}
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
        {rang !== null && cardDrag && rang >= affichees.length && (
          <CardPlaceholder height={cardDrag.height} />
        )}

        {/* La saisie ouverte par « Ajouter une carte » ferme la pile. */}
        {saisie && saisie.index >= affichees.length && champ}
      </Stack>
    );
  };

  // L'encart de saisie d'une nouvelle liste : au bout de la rangée, ou au
  // rang qu'a donné le « + » entre deux listes.
  const encartNouvelle = (
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
  );

  // Ce que la suppression de la liste visée emporterait.
  const cartesSupprimees = pendingDelete?.cards?.length ?? 0;
  // Ce que vider la liste visée emporterait.
  const tachesSupprimees = (listeAVider?.cards || []).filter((c) => !estSeparateur(c)).length;

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
            message="Aucune liste"
            actionLabel={sansAjoutDeListe ? undefined : "Ajouter une liste"}
            onAction={sansAjoutDeListe ? undefined : () => setComposing(true)}
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
                {drag && drag.target === index && <Placeholder list={dragged ?? undefined} withNumber={withNumber} labelsCompactes={labelsCompactes} />}
                {composing && rangNouvelle === index && encartNouvelle}
                {/* Avant chaque liste : le trait qui en insère une à cet
                    endroit. Il ne prend aucune largeur — la marge négative
                    rend à la rangée l'écart que ce repère lui coûterait. */}
                {!drag && !cardDrag && !composing && !sansAjoutDeListe && (
                  <div
                    style={{
                      position: "relative",
                      width: 0,
                      height: Math.max(
                        hauteurs.get(String(list.id)) ?? 0,
                        index > 0 ? (hauteurs.get(String(visibles[index - 1]!.id)) ?? 0) : 0,
                      ),
                      marginRight: -LIST_GAP,
                    }}
                  >
                    <ColumnInsert
                      label="Insérer une liste ici"
                      style={{
                        // Avant la première, la zone de défilement rognerait
                        // tout ce qui déborde à gauche : elle chevauche donc
                        // à moitié le bord de la liste.
                        left:
                          index === 0
                            ? -COLUMN_INSERT_ZONE / 2
                            : -(LIST_GAP + COLUMN_INSERT_ZONE) / 2,
                      }}
                      onClick={() => {
                        setRangNouvelle(index);
                        setComposing(true);
                      }}
                    />
                  </div>
                )}
                <ListCard
                  suivie={follows.list.includes(list.id)}
                  onToggleFollow={() => onToggleFollow("list", list.id)}
                  verrouillee={verrouille}
                  droits={droits}
                  list={list}
                  editing={editingId === list.id ? { id: list.id, name: editingName } : null}
                  onStartEdit={() => startEdit(list)}
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
                  onDeleteTasks={() => setListeAVider(list)}
                  onMove={() => setListeVisee({ list, mode: "move" })}
                  onCopy={() => setListeVisee({ list, mode: "copy" })}
                  onColor={(color) => setListColor(list, color)}
                  onSeparator={() =>
                    startCompose(list, (list.cards || []).length, "separator")
                  }
                >
                  {renderCards(list)}

                  {cardCompose?.listId !== list.id && droits.ajouter && (
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
              <Placeholder list={dragged ?? undefined} withNumber={withNumber} labelsCompactes={labelsCompactes} />
            )}

            {/* Toujours à droite des listes : le bouton cède la place à l'encart. */}
            {!composing && !drag && !sansAjoutDeListe && (
              <AddButton
                label="Ajouter une liste"
                onClick={() => setComposing(true)}
                style={{ flexShrink: 0 }}
              />
            )}

            {composing && rangNouvelle === null && encartNouvelle}
          </Group>
        </ScrollArea>
      )}

      {/* Clone qui suit le curseur, légèrement incliné. */}
      {drag && dragged && (
        <ListStill
          list={dragged ?? undefined}
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
        suivie={cardOuverte !== null && follows.card.includes(cardOuverte.id)}
        onToggleFollow={() => {
          if (cardOuverte) onToggleFollow("card", cardOuverte.id);
        }}
        onClose={() => setCardOuverte(null)}
        card={cardOuverte}
        labels={labels ?? []}
        users={users ?? []}
        boardId={boardId}
        onLabelsChanged={onLabelsChanged}
        onSaved={onListsChanged}
        readOnly={!droits.modifier}
      />

      {/* « Modifier » ouvre une saisie sur le séparateur : le focus ne doit
          pas revenir à l'ancre, il la refermerait aussitôt. */}
      {menuCarte && (
        <PointMenu
          position={menuCarte.position}
          onClose={() => setMenuCarte(null)}
          returnFocus={false}
        >
          {/* Suivre vient en tête, comme dans la fiche. Un séparateur n'a pas
              de fiche : il n'y a rien à y suivre. */}
          {!estSeparateur(menuCarte.card) && (
            <>
              <Menu.Item
                leftSection={<IconEye size={16} />}
                rightSection={
                  follows.card.includes(menuCarte.card.id) ? <IconCheck size={14} /> : null
                }
                onClick={() => void onToggleFollow("card", menuCarte.card.id)}
                closeMenuOnClick={false}
              >
                Suivre
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          {/* Sans le droit de modifier, la fiche s'ouvre encore d'un clic sur
              la carte, pour être lue. */}
          {droits.modifier && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() => modifierCarte(menuCarte.card)}
            >
              Modifier
            </Menu.Item>
          )}
          {droits.ajouter && (
            <Menu.Item
              leftSection={<IconCopyPlus size={16} />}
              onClick={() => void dupliquerCarte(menuCarte.card)}
            >
              Dupliquer
            </Menu.Item>
          )}
          {droits.supprimer && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setCarteASupprimer(menuCarte.card)}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <MoveOrCopyListModal
        opened={listeVisee !== null}
        onClose={() => setListeVisee(null)}
        mode={listeVisee?.mode ?? "move"}
        list={listeVisee?.list ?? null}
        companyId={tableau?.company_id ?? null}
        onDone={onListsChanged}
      />

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteList(pendingDelete)}
        title="Supprimer la liste"
        message={
          <>
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ?
            {cartesSupprimees > 0 && (
              <>
                {" "}
                <strong>
                  {cartesSupprimees} carte{cartesSupprimees > 1 ? "s" : ""}
                </strong>{" "}
                {cartesSupprimees > 1 ? "seront supprimées" : "sera supprimée"}.
              </>
            )}
          </>
        }
      />

      <DeleteConfirmModal
        opened={listeAVider !== null}
        onClose={() => setListeAVider(null)}
        onConfirm={() => listeAVider && deleteTasks(listeAVider)}
        title="Supprimer les tâches"
        message={
          <>
            Voulez-vous vraiment supprimer{" "}
            <strong>
              {tachesSupprimees > 1
                ? `les ${tachesSupprimees} tâches`
                : "la tâche"}
            </strong>{" "}
            de « {listeAVider?.name} » ? La liste et ses séparateurs restent en
            place.
          </>
        }
      />

      <DeleteConfirmModal
        opened={carteASupprimer !== null}
        onClose={() => setCarteASupprimer(null)}
        onConfirm={() => carteASupprimer && deleteCard(carteASupprimer)}
        title={
          carteASupprimer && estSeparateur(carteASupprimer)
            ? "Supprimer le séparateur"
            : "Supprimer la carte"
        }
        message={<>Voulez-vous vraiment supprimer « {carteASupprimer?.text} » ?</>}
      />
    </Stack>
  );
}

// Emplacement d'accueil : la liste déplacée, rappelée en entier à 50 %
// d'opacité. On la voit derrière la copie qui suit le pointeur, à l'endroit où
// elle se posera.
interface PlaceholderProps {
  list: TaskList | undefined;
  withNumber: boolean;
  labelsCompactes: boolean;
}

function Placeholder({ list, withNumber, labelsCompactes }: PlaceholderProps) {
  // La liste glissée peut ne plus exister (relecture pendant le geste) :
  // l'emplacement d'accueil n'a alors rien à montrer.
  if (!list) return null;
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
function CardPlaceholder({ height }: { height: number }) {
  return (
    <Paper
      h={height}
      radius={CARD_RADIUS}
      data-card-placeholder="true"
      style={{ backgroundColor: CARD_PLACEHOLDER_BG }}
    />
  );
}
