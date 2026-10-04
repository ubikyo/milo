import {
  Checkbox,
  Group,
  Input,
  Box,
  Menu,
  Popover,
  Progress,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import {
  IconCalendar,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { FIELD_ICON, RED } from "../../themes/colors";
import { ACTOR_GAP, PersonAvatar } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import { DragHandle, InsertLine, useDraggableStack } from "../ui/DraggableStack";
import { ROUNDING, ROW_BACKGROUND, ROW_INSET, NAME_INSET, rowStyle } from "../ui/DrawerRows";
import { errorMessage } from "../../lib/errors";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type {
  Checklist as ChecklistType,
  ChecklistItemInput,
  ChecklistItem as Element,
  Id,
  PublicUser,
} from "@milo/shared";

// Diamètre des bulles posées sur un élément : plus petites que celles de la
// carte, la ligne est déjà bien remplie.
const ITEM_AVATAR_SIZE = 22;

// La date se pose comme une étiquette de carte (CardLabel) : un rectangle à
// peine arrondi, le texte gras et serré. Le vert est celui de la progression
// d'une checklist et de la pastille d'une carte terminée.
const DATE_TAG = {
  height: 20,
  borderRadius: 4,
  padding: "0 8px",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: "nowrap" as const,
  backgroundColor: "var(--mantine-color-teal-filled)",
  color: "var(--mantine-color-white)",
};

// Hauteur de la barre de progression, et largeur qu'on lui réserve dans
// l'entête : elle ne doit pas repousser le titre d'une checklist à l'autre.
const PROGRESS_HEIGHT = 6;
const PROGRESS_WIDTH = 90;

// Écart entre deux lignes d'une checklist — le fond du tiroir s'y montre,
// comme entre les catégories et les étiquettes du tiroir d'un widget —, et
// entre deux checklists.
const ITEM_GAP = 1;
const CHECKLIST_GAP = 16;

// Hauteur des saisies posées sur une ligne déjà écrite — le titre d'une
// checklist, le libellé d'un élément. C'est celle des noms des catégories et
// des étiquettes du tiroir d'un widget (« xs ») : les lignes ont la même
// hauteur d'un tiroir à l'autre, et la même qu'on lise ou qu'on modifie.
const INLINE_HEIGHT = 30;

// La hauteur d'une ligne : la saisie, et l'air que la ligne garde au-dessus
// et au-dessous d'elle.
const ROW_HEIGHT = INLINE_HEIGHT + 2 * ROW_INSET;

// Une ligne de checklist : celle du tiroir d'un widget, mais avec autant d'air
// à droite qu'à gauche — elle finit sur une date ou un pourcentage, pas sur
// un champ calé au bord.
const checklistRowStyle = (rank: number, total: number, held: boolean): CSSProperties => ({
  ...rowStyle(rank, total, held),
  paddingRight: NAME_INSET,
});

// L'entête d'une checklist se détache de ses éléments : un gris neutre plus
// foncé sur le clair ; sur le sombre, un cran plus loin du fond du tiroir.
const HEADER_BACKGROUND = "light-dark(#dcdcdc, var(--mantine-color-dark-5))";

// Ces saisies ne portent aucun cadre, pas même le bleu que Mantine pose au
// focus : on ne fait que continuer à lire la même ligne, elle ne doit pas
// s'encadrer au clic. C'est le parti pris des cartes et des listes du tableau.
const inlineInput = (extra?: CSSProperties) => ({
  input: {
    borderRadius: `var(--mantine-radius-${ROUNDING})`,
    "--input-bd": "transparent",
    "--input-bd-focus": "transparent",
    height: INLINE_HEIGHT,
    minHeight: INLINE_HEIGHT,
    ...extra,
  },
});

// Le clic droit dans une saisie garde le menu du navigateur : copier, coller.
const inInput = (event: ReactMouseEvent): boolean =>
  event.target instanceof HTMLElement && event.target.closest("input, textarea") !== null;

// Une date se garde en « AAAA-MM-JJ » et se montre à la française.
const showDate = (value: string | null | undefined): string | null =>
  value ? dayjs(value).format("DD/MM/YYYY") : null;

// Où en est une checklist, en pourcentage. Vide, elle est à zéro : aucune case
// cochée n'est pas un travail achevé.
const progress = (items: Element[]): number => {
  if (!items || items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
};

// La date d'échéance d'un élément : une pastille qui ouvre un calendrier.
// Sans date, il ne reste que l'icône, discrète ; avec, le jour prend la place
// de l'icône dans une étiquette verte, qu'on repère sans lire.
interface ItemDateProps {
  value: string;
  onChange: (value: string) => void;
}

function ItemDate({ value, onChange }: ItemDateProps) {
  const [opened, setOpened] = useState(false);
  const text = showDate(value);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      // Comme les autres listes du tiroir : restée sur place, elle échappe au
      // piège à focus du tiroir ; « fixed » la tient hors du défilement.
      withinPortal={false}
      floatingStrategy="fixed"
      shadow="md"
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          c={text ? undefined : FIELD_ICON}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            ...(text ? DATE_TAG : null),
          }}
          aria-label="Date de l'élément"
        >
          {text ?? <IconCalendar size={16} />}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack gap="xs">
          <DatePicker
            value={value || null}
            onChange={(date) => {
              onChange(date || "");
              setOpened(false);
            }}
            // Recliquer la date retenue l'enlève : c'est le geste inverse.
            allowDeselect
          />
          {value && (
            <UnstyledButton
              onClick={() => {
                onChange("");
                setOpened(false);
              }}
            >
              <Text size="xs" c="dimmed">
                Retirer la date
              </Text>
            </UnstyledButton>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

// Les membres d'un élément : leurs bulles, et le choix d'acteurs de toute
// l'application — favoris, recherche dans Milo et dans l'annuaire — qui s'ouvre
// au clic. On ajoute et on retire au même endroit, comme pour les membres
// d'une carte.
interface ItemMembersProps {
  members: Element["members"];
  users: PublicUser[];
  onChange: (ids: number[]) => void;
}

function ItemMembers({ members, users, onChange }: ItemMembersProps) {
  const chosen = members || [];

  return (
    <ActorPicker
      label="Acteurs de l'élément"
      users={users}
      value={chosen.map((m) => String(m.id))}
      onChange={(ids) => onChange(ids.map(Number))}
      position="bottom-end"
      target={
        chosen.length === 0 ? (
          <Text span c={FIELD_ICON} style={{ display: "inline-flex" }}>
            <IconUserPlus size={16} />
          </Text>
        ) : (
          <Group gap={ACTOR_GAP} wrap="nowrap">
            {chosen.map((m) => (
              <span key={m.id} style={{ display: "inline-flex" }} aria-label={m.name}>
                <PersonAvatar person={m} size={ITEM_AVATAR_SIZE} />
              </span>
            ))}
          </Group>
        )
      }
    />
  );
}

// Une ligne de checklist : la poignée pour la glisser, la case, le libellé qui
// se modifie au clic, les membres et la date. « Supprimer » est dans son menu
// contextuel, au clic droit, comme pour les cartes du tableau.
interface ChecklistItemProps {
  item: Element;
  users: PublicUser[];
  /** Le style de la ligne dans la pile : son fond, ses bouts arrondis. */
  row: CSSProperties;
  /** Les acteurs retirés de la carte, pas encore sauvegardés : ils ne se montrent plus. */
  hidden: string[];
  /**
   * Vrai pour l'élément qu'on vient d'ajouter : il s'ouvre en saisie, le
   * curseur dedans.
   */
  autoEdit: boolean;
  onEditDone?: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onToggle: (done: boolean) => void;
  onRename: (text: string) => void;
  onDate: (date: string) => void;
  onMembers: (ids: number[]) => void;
  onContextMenu: (position: PointMenuPosition) => void;
}

function ChecklistItem({
  item,
  users,
  row,
  hidden,
  // Vrai pour l'élément qu'on vient d'ajouter : il s'ouvre en saisie, le
  // curseur dedans. Sans cela, ajouter une ligne donnerait un « Sans
  // libellé » qu'il faudrait encore cliquer pour l'écrire.
  autoEdit,
  onEditDone,
  onPointerDown,
  onToggle,
  onRename,
  onDate,
  onMembers,
  onContextMenu,
}: ChecklistItemProps) {
  const [edited, setEdited] = useState<string | null>(autoEdit ? item.text : null);

  useEffect(() => {
    if (autoEdit) setEdited(item.text);
    // Ne dépend que du signal : le texte suivra la saisie, pas l'inverse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  const closeInput = () => {
    setEdited(null);
    onEditDone?.();
  };

  const validate = () => {
    const text = (edited ?? "").trim();
    closeInput();
    if (text && text !== item.text) onRename(text);
  };

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="center"
      data-checklist-item={item.id}
      onContextMenu={(e) => !inInput(e) && onContextMenu(menuPosition(e))}
      style={{ ...row, minHeight: ROW_HEIGHT }}
    >
      {/* Seule la poignée déplace la ligne : tout le reste répond déjà au
          clic, une ligne glissable de bout en bout les gênerait. */}
      <DragHandle onPointerDown={onPointerDown} label="Glisser pour réordonner" />

      <Checkbox
        checked={Boolean(item.done)}
        onChange={(e) => onToggle(e.currentTarget.checked)}
        size="xs"
        styles={{ input: { cursor: "pointer" } }}
        aria-label={item.text || "Élément de checklist"}
      />

      {edited === null ? (
        <Text
          size="sm"
          onClick={() => setEdited(item.text)}
          // Coché, le libellé se barre et s'efface : la ligne est faite.
          td={item.done ? "line-through" : undefined}
          c={item.done ? "dimmed" : undefined}
          style={{ flex: 1, minWidth: 0, cursor: "pointer", wordBreak: "break-word" }}
        >
          {item.text || <Text span c="dimmed" size="sm" fs="italic">Sans libellé</Text>}
        </Text>
      ) : (
        <TextInput
          value={edited}
          onChange={(e) => setEdited(e.currentTarget.value)}
          onBlur={validate}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              validate();
            }
            if (e.key === "Escape") closeInput();
          }}
          size="sm"
          autoFocus
          placeholder="Libellé de l'élément"
          styles={inlineInput()}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Modifier l'élément"
        />
      )}

      <ItemMembers
        members={(item.members || []).filter((m) => !hidden.includes(String(m.id)))}
        users={users}
        onChange={onMembers}
      />
      <ItemDate value={item.due_date} onChange={onDate} />
    </Group>
  );
}

// Une checklist : son entête — titre modifiable, progression —, ses éléments
// et le lien qui en ajoute un. Elle est toujours dépliée. Elle se supprime par
// le menu contextuel de son entête.
interface ChecklistProps {
  checklist: ChecklistType;
  users: PublicUser[];
  onChanged: () => void | Promise<void>;
  onError?: (message: string) => void;
  dragged: boolean;
  onHandlePointerDown: (event: ReactPointerEvent) => void;
  onMembers?: (ids: number[]) => void;
  hidden: string[];
}

function Checklist({
  checklist,
  users,
  onChanged,
  onError,
  dragged,
  onHandlePointerDown,
  onMembers,
  hidden,
}: ChecklistProps) {
  /** Le titre en cours de saisie ; « null » tant qu'on ne le modifie pas. */
  const [title, setTitle] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ChecklistType | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Element | null>(null);
  // L'élément qu'on vient d'ajouter : il s'ouvre en saisie.
  const [newItem, setNewItem] = useState<Id | null>(null);
  // Le menu contextuel ouvert : celui de l'entête (sans élément) ou d'un
  // élément.
  const [menu, setMenu] = useState<{ item: Element | null; position: PointMenuPosition } | null>(
    null,
  );

  const items = checklist.items || [];
  // L'entête ouvre la pile, les éléments la suivent.
  const rows = items.length + 1;
  const percentage = progress(items);

  // Tout ce qui part au serveur passe par ici : une panne se dit à l'écran,
  // au lieu de laisser le geste sans effet apparent.
  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError?.(errorMessage(e));
    }
  };

  // Les éléments se glissent entre eux, à l'intérieur de leur checklist.
  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: items.map((i) => i.id),
    selector: "[data-checklist-item]",
    onReorder: (order) =>
      act(async () => {
        await api.reorderChecklistItems(checklist.id, order);
        await onChanged();
      }),
  });

  const validateTitle = async () => {
    const name = (title ?? "").trim();
    setTitle(null);
    if (!name || name === checklist.title) return;
    await act(async () => {
      await api.updateChecklist(checklist.id, { title: name });
      await onChanged();
    });
  };

  // La ligne naît sans libellé et s'ouvre aussitôt en saisie : on l'écrit dans
  // la foulée du clic, sans avoir à la rouvrir.
  const addItem = () =>
    act(async () => {
      const created = await api.createChecklistItem(checklist.id);
      await onChanged();
      setNewItem(created.id);
    });

  const editItem = (item: Element, data: ChecklistItemInput) =>
    act(async () => {
      await api.updateChecklistItem(item.id, data);
      await onChanged();
    });

  const deleteItem = async () => {
    const item = itemToDelete;
    setItemToDelete(null);
    if (!item) return;
    await act(async () => {
      await api.deleteChecklistItem(item.id);
      await onChanged();
    });
  };

  return (
    // Une pile de lignes sur le fond gris du tiroir, comme les catégories et
    // les étiquettes dans les réglages d'un widget : l'entête en tête, les
    // éléments dessous, « Ajouter » au bout.
    <Box data-checklist={checklist.id} style={{ opacity: dragged ? 0.4 : 1 }}>
      <Stack gap={ITEM_GAP} ref={zoneRef}>
        {/* Entête : la poignée, le titre, la progression. */}
        <Group
          gap="xs"
          wrap="nowrap"
          align="center"
          onContextMenu={(e) =>
            !inInput(e) && setMenu({ item: null, position: menuPosition(e) })
          }
          style={{ ...checklistRowStyle(0, rows, false), backgroundColor: HEADER_BACKGROUND }}
        >
          {/* La poignée ouvre l'entête : c'est par elle qu'on range les
              checklists entre elles. */}
          <DragHandle
            onPointerDown={onHandlePointerDown}
            label="Glisser pour réordonner la checklist"
          />
          {title === null ? (
            <Text
              fw={600}
              size="sm"
              onClick={() => setTitle(checklist.title)}
              style={{
                flex: 1,
                minWidth: 0,
                cursor: "pointer",
                wordBreak: "break-word",
                // La même hauteur que la saisie qui le remplace : l'entête ne
                // sursaute pas au clic.
                lineHeight: `${INLINE_HEIGHT}px`,
              }}
            >
              {checklist.title}
            </Text>
          ) : (
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              onBlur={validateTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  validateTitle();
                }
                if (e.key === "Escape") setTitle(null);
              }}
              size="sm"
              autoFocus
              // Le titre garde sa graisse en saisie : rien ne change à l'œil
              // que le curseur qui s'y pose.
              styles={inlineInput({ fontWeight: 600 })}
              style={{ flex: 1, minWidth: 0 }}
              aria-label="Renommer la checklist"
            />
          )}

          {/* La progression se lit d'un coup d'œil, sans parcourir les
              lignes. */}
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Progress
              value={percentage}
              color="teal"
              size={PROGRESS_HEIGHT}
              radius="xl"
              w={PROGRESS_WIDTH}
              // Le fond de la barre est celui des éléments de la checklist.
              styles={{ root: { backgroundColor: ROW_BACKGROUND } }}
            />
            <Text size="xs" c="dimmed" w={34} ta="right">
              {percentage}%
            </Text>
          </Group>
        </Group>

        {items.map((item, index) => (
          <div key={item.id}>
            {drag?.target === index && <InsertLine gap={ITEM_GAP} />}
            <ChecklistItem
              item={item}
              users={users}
              row={checklistRowStyle(index + 1, rows, drag?.id === item.id)}
              hidden={hidden}
              autoEdit={newItem === item.id}
              onEditDone={() => setNewItem(null)}
              onPointerDown={onPointerDown(item.id, index)}
              onToggle={(done) => editItem(item, { done })}
              onRename={(text) => editItem(item, { text })}
              onDate={(due_date) => editItem(item, { due_date })}
              onMembers={(member_ids) => {
                onMembers?.(member_ids);
                return editItem(item, { member_ids });
              }}
              onContextMenu={(position) => setMenu({ item, position })}
            />
          </div>
        ))}
        {drag && drag.target >= items.length && <InsertLine gap={ITEM_GAP} />}
      </Stack>

      {/* Au plus près de la pile qu'il allonge. */}
      <AddButton label="Ajouter un élément" onClick={addItem} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() =>
              menu.item ? setItemToDelete(menu.item) : setToDelete(checklist)
            }
          >
            {menu.item ? "Supprimer l'élément" : "Supprimer la checklist"}
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          setToDelete(null);
          return act(async () => {
            await api.deleteChecklist(checklist.id);
            await onChanged();
          });
        }}
        title="Supprimer la checklist"
        message={
          <>
            Voulez-vous vraiment supprimer « {checklist.title} » ?
            {items.length > 0 && (
              <>
                {" "}
                <strong>
                  {items.length} élément{items.length > 1 ? "s" : ""}
                </strong>{" "}
                {items.length > 1 ? "seront supprimés" : "sera supprimé"}.
              </>
            )}
          </>
        }
      />

      <DeleteConfirmModal
        opened={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={deleteItem}
        title="Supprimer l'élément"
        message={
          <>
            Voulez-vous vraiment supprimer « {itemToDelete?.text || "cet élément"} » ?
          </>
        }
      />
    </Box>
  );
}

/**
 * Les checklists d'une carte, à la fin de sa fiche. Elles s'ajoutent par le
 * menu « Actions » du tiroir, et tout s'y enregistre au fil des gestes : une
 * case cochée, un libellé validé ou une ligne déplacée partent aussitôt au
 * serveur, sans attendre « Enregistrer ».
 */
interface CardChecklistsProps {
  cardId: Id;
  checklists: ChecklistType[];
  users: PublicUser[];
  onChanged: () => void | Promise<void>;
  onError?: (message: string) => void;
  /**
   * Les personnes posées sur un élément : la fiche ajoute à ses acteurs
   * celles qui n'y sont pas encore — on ne confie pas une part d'une tâche à
   * qui n'y prend pas part.
   */
  onMembers?: (ids: number[]) => void;
  /**
   * Les acteurs qu'on vient de retirer de la carte. Le serveur les retire des
   * éléments à « Sauvegarder » ; d'ici là, les éléments ne les montrent déjà
   * plus.
   */
  hidden?: string[];
}

export default function CardChecklists({
  cardId,
  checklists,
  users,
  onChanged,
  onError,
  onMembers,
  hidden = [],
}: CardChecklistsProps) {
  const currentChecklists = checklists || [];

  // Les checklists se glissent entre elles, par la poignée de leur entête.
  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: currentChecklists.map((c) => c.id),
    selector: "[data-checklist]",
    onReorder: async (order) => {
      try {
        await api.reorderChecklists(cardId, order);
        await onChanged();
      } catch (e) {
        onError?.(errorMessage(e));
      }
    },
  });

  if (currentChecklists.length === 0) return null;

  return (
    // Le bloc porte son intitulé comme les autres champs de la fiche — le
    // titre, la description, le numéro —, et disparaît avec eux quand la carte
    // n'a aucune checklist.
    <Input.Wrapper label="Checklist">
      <Stack gap={CHECKLIST_GAP} ref={zoneRef}>
        {currentChecklists.map((checklist, index) => (
          <div key={checklist.id}>
            {drag?.target === index && (
              <InsertLine gap={CHECKLIST_GAP} atEdge={index === 0} />
            )}
            <Checklist
              checklist={checklist}
              users={users}
              onChanged={onChanged}
              onError={onError}
              dragged={drag?.id === checklist.id}
              onHandlePointerDown={onPointerDown(checklist.id, index)}
              onMembers={onMembers}
              hidden={hidden}
            />
          </div>
        ))}
        {drag && drag.target >= currentChecklists.length && <InsertLine gap={CHECKLIST_GAP} />}
      </Stack>
    </Input.Wrapper>
  );
}
