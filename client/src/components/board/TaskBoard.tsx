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
  IconLink,
  IconPaperclip,
  IconMessage,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../../api";
import { INSERT_LINE, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import ActorAvatars from "../ui/ActorAvatars";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import ColumnInsert, { COLUMN_INSERT_ZONE } from "../ui/ColumnInsert";
import AddButton from "../ui/AddButton";
import { useRights } from "../../lib/droits";
import { CardLabel } from "../ui/LabelChip";
import CelebrationEffect, { toggleMark, titleEffects, MARKS } from "../ui/EffetsFete";
import type { Effect, Zone } from "../ui/EffetsFete";
import CardDrawer from "./CardDrawer";
import MoveOrCopyListModal, { type ListAction } from "./MoveOrCopyListModal";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import EmptyPanel from "../ui/EmptyPanel";
import pastilles from "../../assets/styles/ListColors.module.css";
import classes from "../../assets/styles/TaskBoard.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import { DUE_WORD, shortDate, dueState } from "../../lib/echeance";
import { SelectionBorder } from "../ui/LabelColorPicker";
import type { DueState } from "../../lib/echeance";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { listKey, isListColor, taskReference } from "@milo/shared";
import { inList } from "../../lib/listes";
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
  background: string;
  text: string;
  hover: string;
  hoverText: string;
  cardBorder: string;
  separatorBackground: string;
  separatorText: string;
  insertionLine: string;
}

/** Le glisser d'une liste, tel que le rendu le voit. */
interface ListDrag {
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
interface ListDragInProgress {
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
interface CardTarget {
  listId: Id;
  index: number;
}

/** Le glisser d'une carte, tel que le rendu le voit. */
interface CardDrag {
  id: Id;
  /** Le clone et l'emplacement d'accueil reprennent la taille de la carte. */
  width: number;
  height: number;
  target: CardTarget | null;
  x: number;
  y: number;
}

interface CardDragInProgress {
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
  frozen: boolean;
}

/** Une carte qui vient d'être saisie, posée avant la réponse du serveur. */
interface ProvisionalCard {
  id: string;
  list_id: Id;
  text: string;
  number: number;
  kind: "card" | "separator";
}

/** Une fête en cours, jouée sur une liste et la carte qui vient d'y arriver. */
interface Celebration {
  key: string;
  effect: Effect;
  column: Zone;
  card: Zone | null;
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

// Couleurs proposées dans le menu d'une liste : le rouge, l'orange, le vert
// et le bleu des projets, le jaune et le violet (nuance 8), puis deux
// nuances plus claires de chacun (6 et 4, éclaircies dans useListColors), en
// trois lignes de six. « Aucune », à part, rend à la liste le
// fond neutre du tableau. Le libellé ne s'affiche pas, il nomme la pastille.
const HUES = [
  { name: "red", label: "Rouge" },
  { name: "orange", label: "Orange" },
  { name: "yellow", label: "Jaune" },
  { name: "green", label: "Vert" },
  { name: "blue", label: "Bleu" },
  { name: "violet", label: "Violet" },
];
const SHADES = [
  { shade: 8, label: "" },
  { shade: 6, label: " moyen" },
  { shade: 4, label: " clair" },
];
const LIST_COLORS = SHADES.flatMap(({ shade, label }) =>
  HUES.map((t) => ({ value: `${t.name}.${shade}`, label: `${t.label}${label}` })),
);

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
      const dark = colorScheme === "dark";
      // Le blanc n'est pas une teinte de la palette : il s'inverse d'un thème
      // à l'autre, blanc sur le sombre et noir sur le clair.
      let background: string;
      let neutral = false;
      // « red.8 » : la couleur des projets, éclaircie d'un quart par cran
      // sous 8 — le thème n'en a qu'une nuance (main.tsx). « red » — une
      // couleur d'avant — prend la nuance principale du thème.
      const [name, shade] = (color ?? "").split(".");
      const palette = name ? theme.colors[name] : undefined;
      if (color === "white") background = dark ? theme.white : theme.black;
      else if (palette && isListColor(color)) {
        const base = palette[getPrimaryShade(theme, colorScheme)] ?? palette[6]!;
        background = shade ? lighten(base, (8 - Number(shade)) * 0.125) : base;
      }
      else {
        neutral = true;
        background = (dark ? theme.colors["dark"]?.[5] : theme.colors["gray"]?.[2]) ?? theme.white;
      }

      const readable = (below: string): string =>
        getContrastColor({
          color: below,
          theme,
          autoContrast: true,
          colorScheme,
        });

      const darkened = darken(background, 0.18);
      // Un séparateur se pose sur le fond de sa liste, assombri plus franchement
      // que le survol : il doit se lire comme un intertitre, pas comme un
      // élément survolé. Sauf sur la liste neutre du thème sombre : les cartes y
      // sont déjà plus sombres que la liste, et un séparateur assombri se
      // confondrait avec elles — il s'éclaircit donc.
      const darkenedSeparator = neutral && dark ? lighten(background, 0.15) : darken(background, 0.35);
      return {
        background,
        text: readable(background),
        // Ce qui se survole sur la liste s'assombrit, ce qui se pose dessus
        // s'éclaircit : le « … » et le champ de renommage d'un côté, la
        // bordure d'une carte de l'autre.
        hover: darkened,
        hoverText: readable(darkened),
        // La bordure d'une carte au survol : le fond de la liste éclairci.
        cardBorder: lighten(background, 0.45),
        separatorBackground: darkenedSeparator,
        separatorText: readable(darkenedSeparator),
        insertionLine: INSERT_LINE,
      };
    },
    [theme, colorScheme],
  );
}

// Fond de l'emplacement d'accueil d'une carte : en creux sous les cartes de sa
// liste. Celui d'une liste n'en a plus besoin : elle s'y rappelle elle-même.
const CARD_PLACEHOLDER_BG =
  "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-9))";

// Rayon des cartes : le même pour la carte, son emplacement d'accueil, la copie
// qui suit le pointeur et le champ de saisie qui la remplace en édition.
const CARD_RADIUS = 8;
/** La hauteur de l'image de couverture en tête d'une carte. */
const COVER_HEIGHT = 120;

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
const insertLineBreak = (
  element: HTMLTextAreaElement,
  setValue: (value: string) => void,
): void => {
  const { value } = element;
  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? start;
  setValue(`${value.slice(0, start)}\n${value.slice(end)}`);
  requestAnimationFrame(() => {
    element.selectionStart = start + 1;
    element.selectionEnd = start + 1;
  });
};

// Touches communes à la saisie d'une carte et à sa modification : Échap
// annule, Entrée valide, Cmd/Ctrl + Entrée va à la ligne.
interface CardKeyDownOptions {
  setValue: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const cardKeyDown =
  ({ setValue, onCancel, onSubmit }: CardKeyDownOptions) =>
  (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
  if (event.key === "Escape") {
    onCancel();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (event.metaKey || event.ctrlKey) insertLineBreak(event.currentTarget, setValue);
  else onSubmit();
  };

// La bordure de survol est toujours là, transparente au repos : la carte ne
// bouge pas quand le pointeur la touche.

// Diamètre des bulles posées sur une carte : plus grandes que celles du tableau
// des projets, où une ligne serrée les contraignait. Leur recouvrement, lui,
// reste celui des projets.
const CARD_AVATAR_SIZE = 25;
// L'écart entre les lignes d'une carte : étiquettes, titre, pictos.
const CARD_CONTENT_GAP = 4;
// L'air au-dessus de chaque colonne de la dernière ligne, quand elles sont
// empilées.
const CARD_STACKED_SPACE = 10;
// Sur la dernière ligne : l'écart entre un picto et sa valeur, serré pour
// qu'ils se lisent ensemble, et celui entre deux éléments, plus large.
const ICON_VALUE_GAP = 2;
const CARD_ITEMS_GAP = 10;
// Entre deux tags (numéro, échéance), l'écart d'avant.
const TAGS_GAP = 6;

// La pastille d'échéance : une horloge et le jour, en abrégé. Dès qu'une carte
// porte une date, elle se montre ; c'est sa couleur qui alerte, ou non. Rouge
// passé le jour dit, orange dans les trois jours qui le précèdent, et sinon un
// fond neutre — la date se lit, mais rien ne presse. Elle précède la pastille
// des checklists, comme l'échéance précède le titre dans la fiche.
const DUE_BG: Record<DueState, string> = {
  retard: "var(--mantine-color-red-filled)",
  bientot: "var(--mantine-color-orange-filled)",
  // Loin encore : le vert de ce qui va bien, comme « À venir » dans la fiche.
  aucun: "var(--mantine-color-green-filled)",
};

// Les trois fonds sont pleins : le texte y est blanc.
const DUE_FG = "var(--mantine-color-white)";

// Le numéro d'une carte, en étiquette verte : la même forme que l'échéance.
function CardNumberTag({ number }: { number: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 6,
        backgroundColor: "var(--mantine-color-green-filled)",
        color: "var(--mantine-color-white)",
        flexShrink: 0,
      }}
    >
      <Text size="xs">{taskReference(number)}</Text>
    </span>
  );
}

interface CardDueBadgeProps {
  card: TaskCard;
}

function CardDueBadge({ card }: CardDueBadgeProps) {
  const text = shortDate(card.due_date);
  if (!text) return null;

  const state = dueState(card.due_date);
  const word = DUE_WORD[state];

  return (
    <span
      aria-label={word ? `Échéance : ${text} — ${word}` : `Échéance : ${text}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: ICON_VALUE_GAP,
        padding: "1px 6px",
        borderRadius: 6,
        backgroundColor: DUE_BG[state],
        color: DUE_FG,
        flexShrink: 0,
      }}
    >
      <IconClock size={14} />
      <Text size="xs">{text}</Text>
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
        gap: ICON_VALUE_GAP,
        padding: "1px 0",
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
  const remaining = card.checklist_open || [];
  if (remaining.length === 0) return null;

  return (
    <Stack
      gap={CHECKLIST_ITEM_GAP}
      data-no-card-drag="true"
      pt={CHECKLIST_PANEL_PAD}
      mt={CHECKLIST_PANEL_MARGIN}
      style={{ borderTop: CHECKLIST_PANEL_RULE }}
    >
      {remaining.map((item) => (
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
  const members = card.members || [];

  const attachments = card.attachment_count || 0;
  const comments = card.comment_count || 0;
  const links = card.link_count || 0;
  // Une carte qui attend encore le serveur n'a pas de numéro.
  const showNumber = withNumber && card.number > 0;

  // Les colonnes passées chacune sur sa ligne : le CSS ne sait pas le dire,
  // on le lit à leur position. Recalculé à chaque changement de taille.
  const left = useRef<HTMLDivElement | null>(null);
  const rightHand = useRef<HTMLDivElement | null>(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const g = left.current;
    const d = rightHand.current;
    if (!g || !d) {
      setStacked(false);
      return undefined;
    }
    // Côte à côte, centrées, leurs hauts diffèrent si leurs hauteurs
    // diffèrent : seuls des acteurs tout entiers au-dessus des pictos disent
    // qu'elles sont empilées.
    const measure = () =>
      setStacked(d.getBoundingClientRect().bottom <= g.getBoundingClientRect().top + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(g);
    observer.observe(d);
    return () => observer.disconnect();
  }, [members.length]);

  // Deux colonnes : à gauche les pictos, à droite les acteurs. Chacune part
  // de la largeur de son contenu sur une ligne et ne descend jamais en
  // dessous (« fit-content ») : tant que les deux tiennent ensemble, elles
  // restent côte à côte ; sinon, elles passent chacune sur sa ligne, en
  // pleine largeur. « wrap-reverse »
  // empile alors les lignes de bas en haut : les acteurs, venus en second,
  // montent au-dessus des pictos.
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap-reverse",
        alignItems: "center",
      }}
    >
      {/* Empilées, chaque colonne prend 10px d'air au-dessus d'elle. Les
          pictos, en bas, les prennent en entier ; les acteurs, en haut, ont
          déjà l'écart qui les sépare du titre, qu'on en retire. */}
      <Group
        ref={left}
        gap={CARD_ITEMS_GAP}
        align="center"
        wrap="wrap"
        c="dimmed"
        pt={stacked ? CARD_STACKED_SPACE : 0}
        style={{ flex: "1 1 auto", minWidth: "fit-content", maxWidth: "100%", rowGap: 4 }}
      >
        {/* Le numéro ouvre la ligne. Une carte qui attend encore le serveur
            n'en a pas. */}
        {/* Les tags se suivent de plus près que les autres éléments. */}
        {(showNumber || shortDate(card.due_date)) && (
          <Group gap={TAGS_GAP} align="center" wrap="wrap" style={{ rowGap: 4 }}>
            {showNumber && <CardNumberTag number={card.number} />}
            {/* Puis l'échéance : une carte en retard doit se voir avant qu'on
                lise ce qu'elle porte. */}
            <CardDueBadge card={card} />
          </Group>
        )}
        <CardChecklistBadge
          card={card}
          onToggle={onChecklistToggle}
        />
        {/* Le picto dit qu'il y a autre chose à lire dans la fiche. */}
        {card.has_description && (
          <IconAlignLeft size={14} aria-label="Cette carte a une description" />
        )}
        {comments > 0 && (
          <Group
            gap={ICON_VALUE_GAP}
            align="center"
            wrap="nowrap"
            aria-label={`Cette carte a ${comments} commentaire${comments > 1 ? "s" : ""}`}
          >
            <IconMessage size={14} />
            <Text size="xs">{comments}</Text>
          </Group>
        )}
        {links > 0 && (
          <Group
            gap={ICON_VALUE_GAP}
            align="center"
            wrap="nowrap"
            aria-label={`Cette carte a ${links} dépendance${links > 1 ? "s" : ""}`}
          >
            <IconLink size={14} />
            <Text size="xs">{links}</Text>
          </Group>
        )}
        {attachments > 0 && (
          <Group
            gap={ICON_VALUE_GAP}
            align="center"
            wrap="nowrap"
            aria-label={`Cette carte a ${attachments} pièce${attachments > 1 ? "s" : ""} jointe${attachments > 1 ? "s" : ""}`}
          >
            <IconPaperclip size={14} />
            <Text size="xs">{attachments}</Text>
          </Group>
        )}
      </Group>
      {/* À droite, les acteurs, calés dans le coin de la carte. Leur retrait
          tient lieu d'écart entre les colonnes : il ne compte que quand elles
          sont côte à côte. */}
      {members.length > 0 && (
        <Group
          ref={rightHand}
          gap={6}
          justify="flex-end"
          align="center"
          wrap="wrap"
          pl={CARD_ITEMS_GAP}
          pt={stacked ? CARD_STACKED_SPACE - CARD_CONTENT_GAP : 0}
          style={{ flex: "1 1 auto", minWidth: "fit-content", maxWidth: "100%", rowGap: 4 }}
        >
          <ActorAvatars actors={members} size={CARD_AVATAR_SIZE} max={4} />
        </Group>
      )}
    </div>
  );
}

// Un séparateur n'est pas une carte à suivre : il titre ce qui vient ensuite.
// Il se saisit, se modifie et se glisse comme une carte, mais il ne porte ni
// numéro ni fond de carte.
const isSeparator = (card: TaskCard): boolean => card.kind === "separator";

// Le fond d'un séparateur : celui de sa liste, assombri. Une carte ordinaire
// garde le fond que Mantine donne au Paper.
const separatorStyle = (card: TaskCard, palette: Palette): CSSProperties | null =>
  isSeparator(card)
    ? {
        backgroundColor: palette.separatorBackground,
        color: palette.separatorText,
      }
    : null;

// La couverture d'une carte, d'un bord à l'autre : elle mange le retrait de la
// carte (« xs ») et suit son arrondi, bordure déduite. Plusieurs images se
// relaient à l'intervalle choisi dans la fiche ; sans intervalle, la première
// reste.
function Cover({ urls, interval }: { urls: string[]; interval: number }) {
  const [rank, setRank] = useState(0);
  const [pause, setPaused] = useState(false);
  // Le tableau relu redonne une liste neuve : seul un changement d'images
  // relance la rotation depuis la première.
  const key = urls.join("|");
  const count = urls.length;
  const current = count ? rank % count : 0;

  useEffect(() => setRank(0), [key]);

  // Comme le widget image : le survol suspend le défilement, et un point
  // choisi repart pour un intervalle entier.
  useEffect(() => {
    if (!interval || count < 2 || pause) return;
    const timeout = window.setTimeout(
      () => setRank((r) => (r + 1) % count),
      interval * 1000,
    );
    return () => window.clearTimeout(timeout);
  }, [key, count, interval, pause, rank]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: "relative",
        width: "calc(100% + 2 * var(--mantine-spacing-xs))",
        margin: "calc(-1 * var(--mantine-spacing-xs)) calc(-1 * var(--mantine-spacing-xs)) 11px",
      }}
    >
      <img
        src={urls[current] ?? urls[0]}
        alt=""
        decoding="async"
        draggable={false}
        style={{
          display: "block",
          width: "100%",
          height: COVER_HEIGHT,
          objectFit: "cover",
          borderTopLeftRadius: CARD_RADIUS - 2,
          borderTopRightRadius: CARD_RADIUS - 2,
        }}
      />
      {/* Les points du widget image, posés sur la photo, en bas : en blanc,
          avec une ombre, pour se lire sur n'importe quelle image. Ils
          répondent eux-mêmes au clic : ni glisser, ni fiche ouverte. */}
      {count > 1 && (
        <Group
          gap={6}
          justify="center"
          wrap="nowrap"
          style={{ position: "absolute", left: 0, right: 0, bottom: 8 }}
        >
          {urls.map((src, i) => (
            <UnstyledButton
              key={`${src}-${i}`}
              data-no-card-drag="true"
              data-no-list-drag="true"
              aria-label={`Image ${i + 1}`}
              onClick={() => setRank(i)}
              onDoubleClick={(e) => e.stopPropagation()}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "var(--mantine-color-white)",
                opacity: i === current ? 1 : 0.5,
                boxShadow: "0 0 2px rgba(0, 0, 0, 0.6)",
              }}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

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
  if (isSeparator(card))
    return (
      <Text size="sm" fw={700} style={CARD_TEXT}>
        {card.text}
      </Text>
    );

  // Les étiquettes du tableau font foi : renommée ou recolorée, une étiquette
  // se montre sous son nouveau jour sans attendre que les listes soient
  // relues. La carte ne garde que le lien.
  const cardLabels = (card.labels || []).map(
    (e) => (labels || []).find((l) => l.id === e.id) || e,
  );

  return (
    <Stack gap={CARD_CONTENT_GAP}>
      {/* La couverture ouvre la carte, d'un bord à l'autre : elle mange le
          retrait de la carte (« xs ») et suit son arrondi, bordure déduite. */}
      {card.cover_urls.length > 0 && (
        <Cover urls={card.cover_urls} interval={card.cover_interval} />
      )}
      {/* Les étiquettes coiffent le titre. Cliquer l'une d'elles les replie ou
          les déploie toutes, sur tout le tableau. */}
      {cardLabels.length > 0 && (
        <Group gap={3} align="center" pb={5} style={{ rowGap: 4 }}>
          {cardLabels.map((label) => (
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
function CardInsert({ color, onClick }: { color: string; onClick: () => void }) {
  const [hovering, setHovered] = useState(false);

  return (
    <div style={{ position: "relative", height: 0, marginTop: -CARD_GAP }}>
      <div
        data-no-list-drag="true"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
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
          color: color,
          // Le trait et son « + » s'effacent un peu : ils indiquent sans
          // prendre le pas sur les cartes.
          opacity: hovering ? 0.8 : 0,
          transition: "opacity 120ms",
        }}
      >
        <span style={{ flex: 1, borderTop: `1px dashed ${color}` }} />
        <IconPlus size={PLUS_SIZE} />
        <span style={{ flex: 1, borderTop: `1px dashed ${color}` }} />
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
      style={{ border: "2px solid transparent", ...separatorStyle(card, palette) }}
    >
      <CardContent card={card} withNumber={withNumber} labelsCompactes={labelsCompactes} />
    </Paper>
  );
}

// Insertion dans une copie : l'original n'est jamais touché.
const withInserted = <T,>(column: T[], index: number, value: T): T[] => {
  const copy = [...column];
  copy.splice(index, 0, value);
  return copy;
};

// Déplacement d'une carte dans une copie des listes, pour l'afficher avant que
// le serveur ait répondu.
const withCardMoved = (
  lists: TaskList[],
  cardId: Id,
  toListId: Id,
  index: number,
): TaskList[] => {
  const card = lists
    .flatMap((l) => l.cards || [])
    .find((c) => c.id === cardId);
  if (!card) return lists;
  return lists.map((list) => {
    const cards = (list.cards || []).filter((c) => c.id !== cardId);
    if (list.id === toListId)
      cards.splice(index, 0, { ...card, list_id: toListId });
    return { ...list, cards: cards };
  });
};

// --- Liste ----------------------------------------------------------------

/** Le renommage en cours d'une liste. */
interface ListEditing {
  id: Id;
  name: string;
}

interface ListCardProps {
  list: TaskList;
  editing: ListEditing | null;
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
  /** Pose ou retire la marque d'une animation au bout du titre. */
  onAnimation: (effect: Effect) => void;
  onSeparator: () => void;
  /** Suivre cette liste, c'est être prévenu de ce qui arrive à ses cartes. */
  followed: boolean;
  onToggleFollow: () => void;
  /** Tableau verrouillé : la liste ne se déplace ni ne se supprime. */
  isLocked: boolean;
  /** Les droits du compte dans la société du tableau. */
  rights: BoardRights;
  children?: ReactNode;
}

/** Ce que le compte peut faire dans le tableau ouvert, selon sa société. */
interface BoardRights {
  add: boolean;
  updateStatement: boolean;
  canDelete: boolean;
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
  onAnimation,
  onSeparator,
  followed,
  onToggleFollow,
  isLocked,
  rights,
  children,
}: ListCardProps) {
  // Le menu s'ouvre au clic droit, au point cliqué. Il se ferme de lui-même
  // sur ses entrées, mais pas sur les pastilles de couleur, qui n'en sont
  // pas : on le pilote pour qu'un choix le referme.
  const [menu, setMenu] = useState<PointMenuPosition | null>(null);
  const colors = useListColors();
  const own = colors(list.color);
  const tasks = (list.cards || []).filter((c) => !isSeparator(c)).length;

  // Un champ de saisie garde le menu du navigateur : couper, coller.
  const openMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea")) return;
    // En modification, sans rien à proposer : le menu du widget.
    if (!isLocked && !rights.add && !rights.updateStatement && !rights.canDelete) return;
    setMenu(menuPosition(event));
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
      onContextMenu={openMenu}
      style={{
        touchAction: "none",
        cursor: "pointer",
        alignSelf: "flex-start",
        backgroundColor: own.background,
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
                  backgroundColor: own.hover,
                  color: own.hoverText,
                },
              }}
              style={{ flex: 1, minWidth: 0 }}
              aria-label={`Renommer ${list.name}`}
            />
          ) : (
            <Text
              fw={600}
              size="sm"
              c={own.text}
              onClick={rights.updateStatement ? onStartEdit : undefined}
              style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
            >
              {list.name}
            </Text>
          )}

          {/* Combien de cartes porte la liste, au bout du titre. Les
              séparateurs ne comptent pas : ils rangent les cartes, ils n'en
              sont pas. */}
          <Text size="xs" c={own.text} opacity={0.7} style={{ flexShrink: 0 }}>
            {tasks}
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
          {/* En modification, la liste ne propose que ce qui touche au
              tableau : la déplacer, la copier, la supprimer. Hors
              modification, ce qui touche à son contenu. */}
          {isLocked && (
            <Menu.Item
              leftSection={<IconEye size={16} />}
              rightSection={followed ? <IconCheck size={14} /> : null}
              onClick={onToggleFollow}
              closeMenuOnClick={false}
            >
              Suivre
            </Menu.Item>
          )}

          {isLocked && (rights.add || rights.updateStatement) && <Menu.Divider />}

          {isLocked && rights.add && (
            <Menu.Item
              leftSection={<IconSeparatorHorizontal size={16} />}
              onClick={onSeparator}
            >
              Séparateur
            </Menu.Item>
          )}
          {/* Vers un autre tableau, la liste quitterait celui-ci : un
              tableau verrouillé la garde. */}
          {!isLocked && rights.updateStatement && (
            <Menu.Item
              leftSection={<IconFolderSymlink size={16} />}
              onClick={onMove}
            >
              Déplacer
            </Menu.Item>
          )}
          {/* Copier suit déplacer : même question — vers quel tableau ? —
              et la même boîte y répond, le tableau courant compris. */}
          {!isLocked && rights.add && (
            <Menu.Item
              leftSection={<IconCopy size={16} />}
              onClick={onCopy}
            >
              Copier
            </Menu.Item>
          )}

          {isLocked && rights.updateStatement && (
            <>
              <Menu.Divider />
              {/* Les pastilles se passent d'intitulé : une couleur se
                  reconnaît. La section, elle, en porte un. */}
              <Menu.Label>Couleur de la liste</Menu.Label>
              <div className={pastilles.grille}>
                {LIST_COLORS.map((color) => (
                  <ColorSwatch
                    key={color.value}
                    component="button"
                    type="button"
                    color={colors(color.value).background}
                    size={22}
                    onClick={() => {
                      setMenu(null);
                      onColor(color.value);
                    }}
                    className={pastilles.pastille}
                    aria-label={color.label}
                    aria-pressed={color.value === list.color}
                  >
                    {color.value === list.color && <SelectionBorder />}
                  </ColorSwatch>
                ))}
              </div>
              <Menu.Item
                leftSection={<IconCircleOff size={16} />}
                onClick={() => onColor("")}
              >
                Aucune
              </Menu.Item>
              <Menu.Divider />
              {/* L'arrivée d'une carte se fête selon les marques du titre :
                  chaque emoji pose la sienne au bout, ou la retire. */}
              <Menu.Label>Animation à l'arrivée</Menu.Label>
              <div className={pastilles.animations}>
                {MARKS.map((m) => (
                  <UnstyledButton
                    key={m.effect}
                    className={pastilles.animation}
                    onClick={() => {
                      setMenu(null);
                      onAnimation(m.effect);
                    }}
                    title={m.label}
                    aria-label={m.label}
                    aria-pressed={list.name.includes(m.mark)}
                  >
                    {m.emoji}
                  </UnstyledButton>
                ))}
              </div>
            </>
          )}

          {rights.canDelete && (
            <>
              <Menu.Divider />
              {/* Vider la liste sans la supprimer : ses séparateurs restent. */}
              {isLocked ? (
                <Menu.Item
                  color={RED}
                  leftSection={<IconTrashX size={16} />}
                  onClick={onDeleteTasks}
                  disabled={tasks === 0}
                >
                  Supprimer tâches
                </Menu.Item>
              ) : (
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
interface CardEditing {
  id: Id;
  text: string;
}

interface CardViewProps {
  card: TaskCard;
  editing: CardEditing | null;
  onStartEdit: (card: TaskCard) => void;
  onEditChange: (event: { currentTarget: { value: string } }) => void;
  onEditKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onEditBlur: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  /** Sans lui — en modification —, le clic droit revient au menu du widget. */
  onContextMenu?: (card: TaskCard, position: PointMenuPosition) => void;
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
      onContextMenu={(e) => onContextMenu?.(card, menuPosition(e))}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        touchAction: "none",
        cursor: "pointer",
        border: `2px solid ${hovered || active ? palette.cardBorder : "transparent"}`,
        ...separatorStyle(card, palette),
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
  [other: string]: unknown;
}

function ListStill({
  list,
  style,
  shadow,
  withNumber,
  labelsCompactes,
  ...props
}: ListStillProps) {
  const own = useListColors()(list?.color);

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
        backgroundColor: own.background,
        ...style,
      }}
      {...props}
    >
      <Stack gap={0}>
        <Text fw={600} size="sm" c={own.text} pb={5} pl={5}>
          {list?.name}
        </Text>
        <Stack gap={CARD_GAP}>
          {(list?.cards || []).map((card) => (
            <CardStill
              key={card.id}
              card={card}
              palette={own}
              withNumber={withNumber}
              labelsCompactes={labelsCompactes}
            />
          ))}
        </Stack>
        <AddCardButton label="Ajouter une carte" color={own.text} onClick={() => {}} />
      </Stack>
    </Paper>
  );
}

export interface TaskBoardProps {
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
  cardToOpen: Id | null;
  onCardOpened: (id: Id | null) => void;
  /** Le widget « Tâches » qui la montre : ses listes, et celles qu'on y crée. */
  listKey?: string;
  /** Montrer le numéro des cartes : une option du widget (task-indicators/liste.tsx). */
  withNumber?: boolean;
}

/** La clé de l'option du widget « Tâches » qui montre le numéro des cartes. */
export const NUMBERS = "numeros";

/** Le widget montre-t-il le numéro des cartes ? Sans réglage, non. */
export const withNumbers = (config: unknown): boolean =>
  (config as Record<string, unknown> | null)?.[NUMBERS] === true;

/**
 * Le tableau ouvert, tel que la page le met en scène : le widget des listes
 * (task-indicators/liste.tsx) le lit ici, où qu'il soit posé dans les
 * sections.
 */
export const TaskBoardContext = createContext<TaskBoardProps | null>(null);

/**
 * Les listes du tableau en widget — celles de ce widget seulement
 * (lib/listes.ts). Remonté à chaque tableau : une saisie ou un glisser en
 * cours ne traverse pas le changement d'onglet.
 */
export function TaskBoardWidget({ config }: { config: unknown }) {
  const board = useContext(TaskBoardContext);
  const all = board?.lists;
  const visibleLists = useMemo(() => all?.filter(inList(config)) ?? [], [all, config]);
  if (!board) return null;
  return (
    <TaskBoard
      key={board.boardId}
      {...board}
      lists={visibleLists}
      listKey={listKey(config)}
      withNumber={withNumbers(config)}
    />
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
  follows,
  onToggleFollow,
  cardToOpen,
  onCardOpened,
  listKey,
  withNumber = false,
}: TaskBoardProps) {
  const [composing, setComposing] = useState(false);
  // Le rang où la liste saisie prendra place : « null », au bout. Le « + »
  // entre deux listes en donne un, et l'encart s'ouvre à cet endroit.
  const [newRank, setNewRank] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<Id | null>(null);
  const [editingName, setEditingName] = useState("");
  // Échap doit annuler sans que la perte de focus n'enregistre au passage.
  const cancelled = useRef(false);

  const [pendingDelete, setPendingDelete] = useState<TaskList | null>(null);
  // La liste qu'on demande à vider de ses tâches.
  const [listToEmpty, setListToEmpty] = useState<TaskList | null>(null);
  // Liste dont on choisit le tableau d'accueil.
  // La liste qu'on s'apprête à déplacer ou à copier, et lequel des deux.
  const [targetList, setTargetList] = useState<{ list: TaskList; mode: ListAction } | null>(
    null,
  );
  // Carte dont la fiche est ouverte.
  const [openCard, setOpenedCard] = useState<TaskCard | null>(null);
  // Le menu contextuel d'une carte, et la carte dont on demande la
  // suppression.
  const [cardMenu, setCardMenu] = useState<
    { card: TaskCard; position: PointMenuPosition } | null
  >(null);
  const [cardToDelete, setCardToDelete] = useState<TaskCard | null>(null);

  // Une carte désignée de l'extérieur — par l'adresse, ou par le lien d'une
  // notification. L'application s'est déjà placée sur le bon tableau ; on
  // attend simplement que ses listes soient lues pour y trouver la carte.
  useEffect(() => {
    if (cardToOpen === null) return;
    for (const column of lists) {
      const card = column.cards.find((c) => c.id === cardToOpen);
      if (card) {
        setOpenedCard(card);
        return;
      }
    }
  }, [cardToOpen, lists]);

  // La copie qu'on vient de dupliquer : sa fiche s'ouvre dès que les listes
  // relues la portent, pour qu'on la reprenne comme base d'une autre.
  const [copyToOpen, setCopyToOpen] = useState<Id | null>(null);
  useEffect(() => {
    if (copyToOpen === null) return;
    const copy = lists.flatMap((l) => l.cards).find((c) => c.id === copyToOpen);
    if (copy) {
      setCopyToOpen(null);
      setOpenedCard(copy);
    }
  }, [copyToOpen, lists]);

  // L'adresse suit la carte ouverte : c'est l'application qui l'écrit, le
  // tableau lui dit seulement ce qu'il montre.
  useEffect(() => {
    onCardOpened(openCard?.id ?? null);
  }, [openCard, onCardOpened]);
  // Les étiquettes se replient en barres, ou se déploient avec leur nom : le
  // choix vaut pour tout le tableau, comme un réglage d'affichage.
  const [labelsCompactes, setCompactLabels] = useState(false);
  // Cartes dont le panneau « ce qu'il reste à faire » est déplié. Chaque carte
  // garde le sien : on peut en ouvrir plusieurs à la fois.
  const [expandedChecklists, setExpandedChecklists] = useState<Set<Id>>(() => new Set());

  // Saisie d'une nouvelle carte : la liste, le rang où elle prendra place et
  // son genre (« card » ou « separator »). Modification d'une carte existante
  // juste en dessous.
  const [cardCompose, setCardComposition] = useState<Composition | null>(null);
  const [cardText, setCardText] = useState("");
  const composeCancelled = useRef(false);
  const [editingCardId, setEditingCardId] = useState<Id | null>(null);
  // Ouverture de la fiche différée, le temps qu'un second clic puisse la
  // devancer pour ouvrir la saisie du titre.
  const openRecord = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(openRecord.current), []);
  const [editingCardText, setEditingCardText] = useState("");
  const editCancelled = useRef(false);

  // Ordre affiché pendant l'enregistrement d'un déplacement. Sans lui, la
  // relâche redessinerait à partir des props, encore porteuses de l'ancien
  // ordre : on verrait l'élément revenir à sa place le temps de l'aller-retour
  // serveur. Les props reprennent la main dès qu'elles arrivent.
  const [localOrder, setLocalOrder] = useState<TaskList[] | null>(null);
  const columns = localOrder || lists;
  useEffect(() => setLocalOrder(null), [lists]);

  const colors = useListColors();

  const board = (boards || []).find((b) => String(b.id) === String(boardId));
  // Verrouillé, le tableau garde ses listes : ni ajout, ni déplacement, ni
  // suppression. Les cartes, elles, se glissent toujours.
  const isLocked = board?.is_locked === 1;
  // Qui ne fait que lire ouvre les fiches, sans rien ajouter, glisser ni
  // supprimer.
  const can = useRights();
  const rights: BoardRights = {
    add: can("tasks", "create"),
    updateStatement: can("tasks", "update"),
    canDelete: can("tasks", "delete"),
  };
  // Pas de liste ajoutée : verrouillé, ou sans le droit.
  const withoutListAdd = isLocked || !rights.add;

  // Fêtes en cours : une par marque du titre de la liste d'accueil.
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);

  // Une carte qui arrive dans une liste marquée (✨, ❤️, 👍, 🚀, 🔥, ❄️, ⚡) se
  // fête. La liste et la carte sont mesurées à l'écran : le tableau défile, leur
  // position n'est connue qu'à cet instant. La carte vient d'être déplacée : on
  // attend qu'elle soit peinte à sa nouvelle place avant de la mesurer.
  const arrivalCelebration = (list: TaskList, cardId: Id) => {
    const effects = titleEffects(list.name);
    if (effects.length === 0) return;
    const zone = (el: Element | null): Zone | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const column = zone(document.querySelector(`[data-list-id="${list.id}"]`));
        if (!column) return;
        const card = zone(document.querySelector(`[data-card-id="${cardId}"]`));
        const key = Date.now();
        setCelebrations((before) => [
          ...before,
          ...effects.map((effect) => ({ key: `${key}-${effect}`, effect, column, card })),
        ]);
      }),
    );
  };

  // État du glisser en cours : une liste, ou une carte.
  const [drag, setDrag] = useState<ListDrag | null>(null);
  const dragRef = useRef<ListDragInProgress | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [cardDrag, setCardDrag] = useState<CardDrag | null>(null);
  const cardDragRef = useRef<CardDragInProgress | null>(null);
  const cardTargetRef = useRef<CardTarget | null>(null);

  // La hauteur de chaque liste, suivie à l'écran : le « + » entre deux listes
  // prend celle de la plus haute des deux, et non celle de toute la rangée.
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    const band = rowRef.current;
    if (!band) return undefined;
    const observer = new ResizeObserver((entries) => {
      setHeights((before) => {
        let next: Map<string, number> | null = null;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.listId;
          const height = (entry.target as HTMLElement).offsetHeight;
          if (!id || before.get(id) === height) continue;
          next ??= new Map(before);
          next.set(id, height);
        }
        return next ?? before;
      });
    });
    band.querySelectorAll("[data-list-id]").forEach((column) => observer.observe(column));
    return () => observer.disconnect();
  }, [columns]);
  // Conteneur des cartes de chaque liste, par identifiant de liste.
  const cardZones = useRef(new Map<Id, HTMLElement>());

  // --- Renommage en ligne ------------------------------------------------
  const startEdit = (list: TaskList) => {
    if (!rights.updateStatement) return;
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
    const name = editingName.trim();
    setEditingId(null);
    if (!name || name === list.name) return;
    try {
      await api.updateTaskList(list.id, { name: name });
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- Animation d'une liste ---------------------------------------------
  // La marque se pose au bout du titre : c'est lui qui décide de la fête.
  const setListAnimation = async (list: TaskList, effect: Effect) => {
    const name = toggleMark(list.name, effect);
    if (!name || name === list.name) return;
    setLocalOrder(columns.map((l) => (l.id === list.id ? { ...l, name } : l)));
    try {
      await api.updateTaskList(list.id, { name });
      await onListsChanged();
    } catch (e) {
      setLocalOrder(null);
      notifyError(errorMessage(e));
    }
  };

  // --- Couleur d'une liste ------------------------------------------------
  const setListColor = async (list: TaskList, color: string) => {
    if ((list.color || "") === color) return;
    // La liste prend sa couleur tout de suite : l'aller-retour serveur ne doit
    // pas laisser le menu se refermer sur l'ancien fond.
    setLocalOrder(
      columns.map((l) => (l.id === list.id ? { ...l, color } : l)),
    );
    try {
      await api.updateTaskList(list.id, { color: color as ListColor });
      await onListsChanged();
    } catch (e) {
      setLocalOrder(null);
      notifyError(errorMessage(e));
    }
  };

  // --- Suppression d'une liste -------------------------------------------
  const deleteList = async (list: TaskList) => {
    setPendingDelete(null);
    try {
      await api.deleteTaskList(list.id);
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteTasks = async (list: TaskList) => {
    setListToEmpty(null);
    // La fiche ouverte sur une tâche de cette liste n'aurait plus de carte.
    if (openCard && openCard.list_id === list.id && !isSeparator(openCard)) {
      setOpenedCard(null);
    }
    try {
      await api.deleteTaskListCards(list.id);
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteCard = async (card: TaskCard) => {
    setCardToDelete(null);
    if (openCard?.id === card.id) setOpenedCard(null);
    try {
      await api.deleteTaskCard(card.id);
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- Cartes : saisie et modification -----------------------------------
  // Dans les deux cas, Échap annule et la perte de focus valide.
  const startCompose = (list: TaskList, index: number, kind: "card" | "separator" = "card") => {
    if (!rights.add) return;
    composeCancelled.current = false;
    setCardComposition({ listId: list.id, index, kind });
    setCardText("");
  };

  const cancelCompose = () => {
    composeCancelled.current = true;
    setCardComposition(null);
    setCardText("");
  };

  // Entrée et la perte de focus mènent tous deux ici : le drapeau ferme la
  // porte derrière le premier des deux, sans quoi la carte serait créée deux
  // fois. startCompose le rouvre.
  const saveComposition = async (
    list: TaskList,
    rank: number | null,
    kind: "card" | "separator" = "card",
  ) => {
    if (composeCancelled.current) return;
    composeCancelled.current = true;
    const text = cardText.trim();
    setCardComposition(null);
    setCardText("");
    if (!text) return;

    const cards = list.cards || [];
    const index = Math.min(rank ?? cards.length, cards.length);

    // La carte prend sa place tout de suite, au rang visé : sans cela le champ
    // s'effacerait sur du vide, et la carte n'apparaîtrait qu'au retour du
    // serveur. Sa référence, elle, attend le serveur : le compteur est commun
    // à tous les modes, et rien ici ne dit la suivante.
    const provisional: ProvisionalCard = {
      id: `nouvelle-${Date.now()}`,
      list_id: list.id,
      text: text,
      number: 0,
      kind,
    };
    // La carte provisoire n'a pas encore d'identifiant de ligne : elle tient
    // la place d'une vraie le temps de l'aller-retour.
    setLocalOrder(
      columns.map((l) =>
        l.id === list.id
          ? { ...l, cards: withInserted(cards, index, provisional as unknown as TaskCard) }
          : l,
      ),
    );

    try {
      // Le serveur ajoute toujours la carte à la fin : si elle s'insère plus
      // haut, l'ordre de la liste suit dans la foulée.
      // Elle naît dans le contexte qu'on regarde ; sous « Tous », dans le
      // premier du tableau.
      const created = await api.createTaskCard(
        list.id,
        text,
        kind,
        undefined,
        board?.context_id ?? null,
      );
      if (index < cards.length) {
        await api.reorderTaskCards(
          list.id,
          withInserted(cards.map((c) => c.id), index, created.id),
        );
      }
      await onListsChanged();
    } catch (e) {
      setLocalOrder(null);
      notifyError(errorMessage(e));
    }
  };

  const startEditCard = (card: TaskCard) => {
    // Le second clic arrive avant que la fiche ne s'ouvre : on retire
    // l'ouverture en attente, sans quoi le tiroir viendrait par-dessus la
    // saisie qu'on vient d'ouvrir.
    if (!rights.updateStatement) return;
    clearTimeout(openRecord.current);
    editCancelled.current = false;
    setEditingCardId(card.id);
    setEditingCardText(card.text);
  };

  // « Modifier » ouvre la fiche ; un séparateur, qui n'en a pas, se modifie
  // sur le tableau.
  const editCard = (card: TaskCard) => {
    if (isSeparator(card)) startEditCard(card);
    else setOpenedCard(card);
  };

  // Un séparateur dupliqué n'a pas de fiche : il se pose sous l'original,
  // et l'on glisse ensuite celui des deux qui doit trancher ailleurs.
  const duplicateCard = async (card: TaskCard) => {
    try {
      const copy = await api.duplicateTaskCard(card.id);
      await onListsChanged();
      if (!isSeparator(card)) setCopyToOpen(copy.id);
    } catch (e) {
      notifyError(errorMessage(e));
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
    const text = editingCardText.trim();
    setEditingCardId(null);
    if (!text || text === card.text) return;
    try {
      await api.updateTaskCard(card.id, text);
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
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
      return Math.max(0, Math.min(columns.length - 1, index));
    },
    [columns.length],
  );

  const onListPointerDown =
    (list: TaskList, index: number) => (event: ReactPointerEvent) => {
    // Bouton principal uniquement, jamais pendant un renommage ni sur un
    // tableau verrouillé.
    if (event.button !== 0 || editingId === list.id || isLocked || !rights.updateStatement) return;
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

      const current = drag;
      setDrag(null);
      if (!current || current.target === current.from) return;

      // Nouvel ordre affiché aussitôt, puis enregistré.
      const order = columns.map((l) => l.id);
      const [moved] = order.splice(current.from, 1);
      if (moved === undefined) return;
      order.splice(current.target, 0, moved);
      setLocalOrder(
        order
          .map((id) => columns.find((l) => l.id === id))
          .filter((l): l is TaskList => Boolean(l)),
      );
      try {
        await api.reorderTaskLists(Number(boardId), order);
        await onListsChanged();
      } catch (e) {
        setLocalOrder(null);
        notifyError(errorMessage(e));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, columns, onListsChanged, targetFromPointer, boardId]);

  // --- Glisser-déposer des cartes ----------------------------------------

  // Liste et rang visés. Les cartes n'ont pas toutes la même hauteur : il faut
  // mesurer. « precedent » est l'emplacement d'accueil actuellement affiché.
  const cardTargetFromPointer = useCallback(
    (clientX: number, clientY: number, previous: CardTarget | null): CardTarget | null => {
      const column = columns[targetFromPointer(clientX)];
      if (!column) return null;
      const zone = cardZones.current.get(column.id);
      if (!zone) return { listId: column.id, index: 0 };

      // La carte déplacée ne s'affiche plus : ne restent que les autres.
      const cards = [...zone.querySelectorAll<HTMLElement>("[data-card-id]")];

      // L'emplacement d'accueil occupe de la place et pousse vers le bas les
      // cartes qui le suivent. On retire ce décalage : sinon le rang calculé
      // dépendrait de l'emplacement affiché et oscillerait entre deux valeurs.
      const home = zone.querySelector("[data-card-placeholder]");
      const offset = home
        ? (home as HTMLElement).getBoundingClientRect().height + CARD_GAP
        : 0;
      const homeRank =
        home && previous && previous.listId === column.id
          ? previous.index
          : cards.length;

      let index = cards.length;
      for (let i = 0; i < cards.length; i += 1) {
        const rect = (cards[i] as HTMLElement).getBoundingClientRect();
        const top = rect.top - (i >= homeRank ? offset : 0);
        if (clientY < top + rect.height / 2) {
          index = i;
          break;
        }
      }
      return { listId: column.id, index };
    },
    [columns, targetFromPointer],
  );

  const toggleChecklist = (cardId: Id) =>
    setExpandedChecklists((openSessions) => {
      const next = new Set(openSessions);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

  // Cocher depuis la carte : l'élément quitte le panneau et la pastille
  // avance. La fiche n'a pas besoin d'être ouverte pour cela.
  const checkChecklistItem = async (itemId: Id) => {
    if (!rights.updateStatement) return;
    try {
      await api.updateChecklistItem(itemId, { done: true });
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
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
      frozen: !rights.updateStatement,
    };
    };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const d = cardDragRef.current;
      if (!d) return;

      if (!d.started) {
        if (d.frozen) return;
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
        const card = columns.flatMap((l) => l.cards || []).find((c) => c.id === d.id);
        if (card && !isSeparator(card)) {
          clearTimeout(openRecord.current);
          openRecord.current = setTimeout(
            () => setOpenedCard(card),
            DOUBLE_CLICK_DELAY,
          );
        }
        return;
      }

      setCardDrag(null);
      if (!target) return;

      const home = columns.find((l) => l.id === target.listId);
      if (!home) return;

      // Ordre complet de la liste d'accueil : ses cartes, la carte déplacée
      // ôtée si elle en venait, puis réinsérée au rang visé.
      const before = (home.cards || []).map((c) => c.id);
      const order = before.filter((id) => id !== d.id);
      order.splice(target.index, 0, d.id);
      if (target.listId === d.listId && order.join() === before.join()) return;

      // La carte rejoint sa destination sans attendre la réponse du serveur.
      setLocalOrder(withCardMoved(columns, d.id, home.id, target.index));
      // Venue d'une autre liste : l'arrivée se fête, si la liste le demande.
      if (target.listId !== d.listId) arrivalCelebration(home, d.id);
      try {
        await api.reorderTaskCards(home.id, order);
        await onListsChanged();
      } catch (e) {
        setLocalOrder(null);
        notifyError(errorMessage(e));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [columns, onListsChanged, cardTargetFromPointer]);

  // --- Création d'une liste ----------------------------------------------
  const cancel = () => {
    setComposing(false);
    setNewRank(null);
    setName("");
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createTaskList(
        Number(boardId),
        name.trim(),
        newRank ?? undefined,
        listKey || undefined,
      );
      await onListsChanged();
      // On enchaîne : le champ reste ouvert et vide pour la liste suivante,
      // qui se range juste après celle qu'on vient de créer.
      setName("");
      setNewRank((r) => (r === null ? null : r + 1));
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Ordre affiché pendant le glisser : la liste déplacée sort du flux et cède
  // sa place à un emplacement d'accueil à l'index visé.
  const dragged = drag ? columns.find((l) => l.id === drag.id) : null;
  const visibleItems = drag ? columns.filter((l) => l.id !== drag.id) : columns;

  const draggedCard = cardDrag
    ? columns.flatMap((l) => l.cards || []).find((c) => c.id === cardDrag.id)
    : null;
  // La liste d'où part une carte : un séparateur glissé garde le fond de sa
  // liste d'origine jusqu'à ce qu'il se pose.
  const listOf = (card: TaskCard): TaskList | undefined =>
    columns.find((l) => l.id === card.list_id);

  // Cartes d'une liste, avec l'emplacement d'accueil quand le glisser la vise
  // et, entre deux cartes, le point d'insertion qui ouvre une saisie.
  const renderCards = (list: TaskList) => {
    const cards = list.cards || [];
    // Saisie en cours dans cette liste, et le champ qui la porte : il est
    // écrit une fois, puis posé au rang visé.
    const input = cardCompose?.listId === list.id ? cardCompose : null;
    const separator = input?.kind === "separator";
    const palette = colors(list.color);
    const field = input ? (
      <Textarea
        data-no-list-drag="true"
        placeholder={
          separator
            ? "Nom du séparateur"
            : "Saisissez le texte de la carte"
        }
        value={cardText}
        onChange={(e) => {
          const { value } = e.currentTarget;
          setCardText(value);
        }}
        onKeyDown={cardKeyDown({
          setValue: setCardText,
          onCancel: cancelCompose,
          onSubmit: () => saveComposition(list, input.index, input.kind),
        })}
        onBlur={() => saveComposition(list, input.index, input.kind)}
        autosize
        minRows={separator ? 1 : 2}
        autoFocus
        radius={CARD_RADIUS}
        styles={
          // Le séparateur s'écrit tel qu'il s'affichera : en gras, sur le fond
          // de la liste assombri.
          separator
            ? {
                input: {
                  ...INPUT_NO_BORDER.input,
                  backgroundColor: palette.separatorBackground,
                  color: palette.separatorText,
                  fontWeight: 700,
                  // Le gris que Mantine donne au texte d'invite ne tient pas
                  // sur un fond coloré : on reprend la couleur du texte, juste
                  // assez estompée pour rester une invite.
                  "--input-placeholder-color": alpha(palette.separatorText, 0.75),
                },
              }
            : INPUT_NO_BORDER
        }
        aria-label={
          separator
            ? `Ajouter un séparateur dans ${list.name}`
            : `Ajouter une carte dans ${list.name}`
        }
      />
    ) : null;
    const displayed = cardDrag
      ? cards.filter((c) => c.id !== cardDrag.id)
      : cards;
    const rank =
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
        {displayed.map((card, index) => (
          <Fragment key={card.id}>
            {rank === index && cardDrag && <CardPlaceholder height={cardDrag.height} />}

            {/* Entre deux cartes : le trait pointillé qui ouvre une saisie à
                ce rang. Ni pendant un glisser, ni au-dessus de la première
                carte, ni là où la saisie est déjà ouverte. */}
            {index > 0 &&
              rights.add &&
              !cardDrag &&
              !drag &&
              input?.index !== index &&
              input?.index !== index - 1 && (
                <CardInsert
                  color={palette.insertionLine}
                  onClick={() => startCompose(list, index)}
                />
              )}

            {input?.index === index && field}

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
              onEditKeyDown={cardKeyDown({
                setValue: setEditingCardText,
                onCancel: cancelEditCard,
                onSubmit: () => saveEditCard(card),
              })}
              onEditBlur={() => saveEditCard(card)}
              onPointerDown={onCardPointerDown(card, list)}
              onContextMenu={
                isLocked ? (card, position) => setCardMenu({ card: card, position }) : undefined
              }
              active={cardMenu?.card.id === card.id}
              palette={palette}
              withNumber={withNumber}
              labelsCompactes={labelsCompactes}
              onLabelClick={() => setCompactLabels((c) => !c)}
              labels={labels}
              checklistOpen={expandedChecklists.has(card.id)}
              onChecklistToggle={() => toggleChecklist(card.id)}
              onChecklistCheck={checkChecklistItem}
            />
          </Fragment>
        ))}

        {/* Emplacement en fin de liste. */}
        {rank !== null && cardDrag && rank >= displayed.length && (
          <CardPlaceholder height={cardDrag.height} />
        )}

        {/* La saisie ouverte par « Ajouter une carte » ferme la pile. */}
        {input && input.index >= displayed.length && field}
      </Stack>
    );
  };

  // L'encart de saisie d'une nouvelle liste : au bout de la rangée, ou au
  // rang qu'a donné le « + » entre deux listes.
  const newInset = (
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
  const deletedCards = pendingDelete?.cards?.length ?? 0;
  // Ce que vider la liste visée emporterait.
  const deletedTasks = (listToEmpty?.cards || []).filter((c) => !isSeparator(c)).length;

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>

      {/* Un tableau sans liste : l'invite occupe toute la hauteur du
          panneau, comme les autres écrans vides. Pendant une lecture, on
          n'affiche rien : « aucune liste » serait une conclusion prématurée. */}
      {columns.length === 0 && !composing ? (
        loading ? null : (
          <EmptyPanel
            icon={IconColumns}
            message="Aucune liste"
            actionLabel={withoutListAdd ? undefined : "Ajouter une liste"}
            onAction={withoutListAdd ? undefined : () => setComposing(true)}
            // La taille des autres listes vides — projets, demandes.
            size="md"
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
            {visibleItems.map((list, index) => (
              <Fragment key={list.id}>
                {drag && drag.target === index && <Placeholder list={dragged ?? undefined} withNumber={withNumber} labelsCompactes={labelsCompactes} />}
                {composing && newRank === index && newInset}
                {/* Avant chaque liste : le trait qui en insère une à cet
                    endroit. Il ne prend aucune largeur — la marge négative
                    rend à la rangée l'écart que ce repère lui coûterait. */}
                {!drag && !cardDrag && !composing && !withoutListAdd && (
                  <div
                    style={{
                      position: "relative",
                      width: 0,
                      height: Math.max(
                        heights.get(String(list.id)) ?? 0,
                        index > 0 ? (heights.get(String(visibleItems[index - 1]!.id)) ?? 0) : 0,
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
                        setNewRank(index);
                        setComposing(true);
                      }}
                    />
                  </div>
                )}
                <ListCard
                  followed={follows.list.includes(list.id)}
                  onToggleFollow={() => onToggleFollow("list", list.id)}
                  isLocked={isLocked}
                  rights={rights}
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
                  onPointerDown={onListPointerDown(list, columns.indexOf(list))}
                  onDelete={() => setPendingDelete(list)}
                  onDeleteTasks={() => setListToEmpty(list)}
                  onMove={() => setTargetList({ list, mode: "move" })}
                  onCopy={() => setTargetList({ list, mode: "copy" })}
                  onColor={(color) => setListColor(list, color)}
                  onAnimation={(effect) => setListAnimation(list, effect)}
                  onSeparator={() =>
                    startCompose(list, (list.cards || []).length, "separator")
                  }
                >
                  {renderCards(list)}

                  {cardCompose?.listId !== list.id && rights.add && (
                    <AddCardButton
                      label="Ajouter une carte"
                      color={colors(list.color).text}
                      onClick={() => startCompose(list, (list.cards || []).length)}
                    />
                  )}
                </ListCard>
              </Fragment>
            ))}

            {/* Emplacement en fin de rangée. */}
            {drag && drag.target >= visibleItems.length && (
              <Placeholder list={dragged ?? undefined} withNumber={withNumber} labelsCompactes={labelsCompactes} />
            )}

            {/* Toujours à droite des listes : le bouton cède la place à l'encart. */}
            {!composing && !drag && !withoutListAdd && (
              <AddButton
                label="Ajouter une liste"
                onClick={() => setComposing(true)}
                style={{ flexShrink: 0 }}
              />
            )}

            {composing && newRank === null && newInset}
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
            ...separatorStyle(draggedCard, colors(listOf(draggedCard)?.color)),
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

      {celebrations.map((celebration) => (
        <CelebrationEffect
          key={celebration.key}
          effect={celebration.effect}
          column={celebration.column}
          card={celebration.card}
          onDone={() => setCelebrations((before) => before.filter((f) => f.key !== celebration.key))}
        />
      ))}

      <CardDrawer
        opened={openCard !== null}
        followed={openCard !== null && follows.card.includes(openCard.id)}
        onToggleFollow={() => {
          if (openCard) onToggleFollow("card", openCard.id);
        }}
        onClose={() => setOpenedCard(null)}
        card={openCard}
        labels={labels ?? []}
        users={users ?? []}
        boardId={boardId}
        contexts={board?.contexts}
        onLabelsChanged={onLabelsChanged}
        onSaved={onListsChanged}
        readOnly={!rights.updateStatement}
      />

      {/* « Modifier » ouvre une saisie sur le séparateur : le focus ne doit
          pas revenir à l'ancre, il la refermerait aussitôt. */}
      {cardMenu && (
        <PointMenu
          position={cardMenu.position}
          onClose={() => setCardMenu(null)}
          returnFocus={false}
        >
          {/* Suivre vient en tête, comme dans la fiche. Un séparateur n'a pas
              de fiche : il n'y a rien à y suivre. */}
          {!isSeparator(cardMenu.card) && (
            <>
              <Menu.Item
                leftSection={<IconEye size={16} />}
                rightSection={
                  follows.card.includes(cardMenu.card.id) ? <IconCheck size={14} /> : null
                }
                onClick={() => void onToggleFollow("card", cardMenu.card.id)}
                closeMenuOnClick={false}
              >
                Suivre
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          {/* Sans le droit de modifier, la fiche s'ouvre encore d'un clic sur
              la carte, pour être lue. */}
          {rights.updateStatement && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() => editCard(cardMenu.card)}
            >
              Modifier
            </Menu.Item>
          )}
          {rights.add && (
            <Menu.Item
              leftSection={<IconCopyPlus size={16} />}
              onClick={() => void duplicateCard(cardMenu.card)}
            >
              Dupliquer
            </Menu.Item>
          )}
          {rights.canDelete && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setCardToDelete(cardMenu.card)}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <MoveOrCopyListModal
        opened={targetList !== null}
        onClose={() => setTargetList(null)}
        mode={targetList?.mode ?? "move"}
        list={targetList?.list ?? null}
        viewId={board?.view_id ?? null}
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
            {deletedCards > 0 && (
              <>
                {" "}
                <strong>
                  {deletedCards} carte{deletedCards > 1 ? "s" : ""}
                </strong>{" "}
                {deletedCards > 1 ? "seront supprimées" : "sera supprimée"}.
              </>
            )}
          </>
        }
      />

      <DeleteConfirmModal
        opened={listToEmpty !== null}
        onClose={() => setListToEmpty(null)}
        onConfirm={() => listToEmpty && deleteTasks(listToEmpty)}
        title="Supprimer les tâches"
        message={
          <>
            Voulez-vous vraiment supprimer{" "}
            <strong>
              {deletedTasks > 1
                ? `les ${deletedTasks} tâches`
                : "la tâche"}
            </strong>{" "}
            de « {listToEmpty?.name} » ? La liste et ses séparateurs restent en
            place.
          </>
        }
      />

      <DeleteConfirmModal
        opened={cardToDelete !== null}
        onClose={() => setCardToDelete(null)}
        onConfirm={() => cardToDelete && deleteCard(cardToDelete)}
        title={
          cardToDelete && isSeparator(cardToDelete)
            ? "Supprimer le séparateur"
            : "Supprimer la carte"
        }
        message={<>Voulez-vous vraiment supprimer « {cardToDelete?.text} » ?</>}
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
