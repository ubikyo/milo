import {
  Checkbox,
  Group,
  Input,
  Menu,
  Paper,
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
  IconPlus,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ADD_ACTION, FIELD_ICON, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import { ACTOR_GAP, PersonAvatar } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";
import { DragHandle, InsertLine, usePileGlissante } from "../ui/PileGlissante";
import { messageErreur } from "../../lib/errors";
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

// La date porte une bulle verte à la hauteur des pastilles de personnes : les
// deux se suivent sur la ligne, elles doivent s'aligner. Le vert est celui de
// la progression d'une checklist et de la pastille d'une carte terminée.
const DATE_BUBBLE = {
  height: ITEM_AVATAR_SIZE,
  borderRadius: ITEM_AVATAR_SIZE / 2,
  padding: "0 8px",
  backgroundColor: "var(--mantine-color-teal-filled)",
  color: "var(--mantine-color-white)",
};

// Hauteur de la barre de progression, et largeur qu'on lui réserve dans
// l'entête : elle ne doit pas repousser le titre d'une checklist à l'autre.
const PROGRESS_HEIGHT = 6;
const PROGRESS_WIDTH = 90;

// Écart entre deux éléments d'une checklist, et entre deux checklists.
const ITEM_GAP = 2;
const CHECKLIST_GAP = 16;

// Hauteur des saisies posées sur une ligne déjà écrite — le titre d'une
// checklist, le libellé d'un élément. C'est celle des boutons qui les
// accompagnent (ActionIcon « sm ») : la ligne garde donc la même hauteur,
// qu'on lise ou qu'on modifie.
const INLINE_HEIGHT = 26;

// Ces saisies ne portent aucun cadre, pas même le bleu que Mantine pose au
// focus : on ne fait que continuer à lire la même ligne, elle ne doit pas
// s'encadrer au clic. C'est le parti pris des cartes et des listes du tableau.
const inlineInput = (extra?: CSSProperties) => ({
  input: {
    "--input-bd": "transparent",
    "--input-bd-focus": "transparent",
    height: INLINE_HEIGHT,
    minHeight: INLINE_HEIGHT,
    ...extra,
  },
});

// Le clic droit dans une saisie garde le menu du navigateur : copier, coller.
const dansUneSaisie = (event: ReactMouseEvent): boolean =>
  event.target instanceof HTMLElement && event.target.closest("input, textarea") !== null;

// Une date se garde en « AAAA-MM-JJ » et se montre à la française.
const afficheDate = (valeur: string | null | undefined): string | null =>
  valeur ? dayjs(valeur).format("DD/MM/YYYY") : null;

// Où en est une checklist, en pourcentage. Vide, elle est à zéro : aucune case
// cochée n'est pas un travail achevé.
const avancement = (items: Element[]): number => {
  if (!items || items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
};

// La date d'échéance d'un élément : une pastille qui ouvre un calendrier.
// Sans date, il ne reste que l'icône, discrète ; avec, le jour s'encadre d'une
// bulle verte, qu'on repère sans lire.
interface ItemDateProps {
  value: string;
  onChange: (value: string) => void;
}

function ItemDate({ value, onChange }: ItemDateProps) {
  const [opened, setOpened] = useState(false);
  const texte = afficheDate(value);

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
          c={texte ? undefined : FIELD_ICON}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            ...(texte ? DATE_BUBBLE : null),
          }}
          aria-label="Date de l'élément"
        >
          <IconCalendar size={16} />
          {texte && <Text size="xs">{texte}</Text>}
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
  const retenus = members || [];

  return (
    <ActorPicker
      label="Acteurs de l'élément"
      users={users}
      value={retenus.map((m) => String(m.id))}
      onChange={(ids) => onChange(ids.map(Number))}
      position="bottom-end"
      target={
        retenus.length === 0 ? (
          <Text span c={FIELD_ICON} style={{ display: "inline-flex" }}>
            <IconUserPlus size={16} />
          </Text>
        ) : (
          <Group gap={ACTOR_GAP} wrap="nowrap">
            {retenus.map((m) => (
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
  dragged: boolean;
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
  dragged,
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
  const [edite, setEdite] = useState<string | null>(autoEdit ? item.text : null);
  const [survole, setSurvole] = useState(false);

  useEffect(() => {
    if (autoEdit) setEdite(item.text);
    // Ne dépend que du signal : le texte suivra la saisie, pas l'inverse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  const fermerSaisie = () => {
    setEdite(null);
    onEditDone?.();
  };

  const valider = () => {
    const texte = (edite ?? "").trim();
    fermerSaisie();
    if (texte && texte !== item.text) onRename(texte);
  };

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="center"
      data-checklist-item={item.id}
      onMouseEnter={() => setSurvole(true)}
      onMouseLeave={() => setSurvole(false)}
      onContextMenu={(e) => !dansUneSaisie(e) && onContextMenu(positionDuMenu(e))}
      style={{ opacity: dragged ? 0.4 : 1, minHeight: 28 }}
    >
      {/* Seule la poignée déplace la ligne : tout le reste répond déjà au
          clic, une ligne glissable de bout en bout les gênerait. */}
      <DragHandle
        onPointerDown={onPointerDown}
        visible={survole}
        label="Glisser pour réordonner"
      />

      <Checkbox
        checked={Boolean(item.done)}
        onChange={(e) => onToggle(e.currentTarget.checked)}
        size="xs"
        styles={{ input: { cursor: "pointer" } }}
        aria-label={item.text || "Élément de checklist"}
      />

      {edite === null ? (
        <Text
          size="sm"
          onClick={() => setEdite(item.text)}
          // Coché, le libellé se barre et s'efface : la ligne est faite.
          td={item.done ? "line-through" : undefined}
          c={item.done ? "dimmed" : undefined}
          style={{ flex: 1, minWidth: 0, cursor: "pointer", wordBreak: "break-word" }}
        >
          {item.text || <Text span c="dimmed" size="sm" fs="italic">Sans libellé</Text>}
        </Text>
      ) : (
        <TextInput
          value={edite}
          onChange={(e) => setEdite(e.currentTarget.value)}
          onBlur={valider}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              valider();
            }
            if (e.key === "Escape") fermerSaisie();
          }}
          size="sm"
          autoFocus
          placeholder="Libellé de l'élément"
          styles={inlineInput()}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Modifier l'élément"
        />
      )}

      <ItemMembers members={item.members} users={users} onChange={onMembers} />
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
}

function Checklist({
  checklist,
  users,
  onChanged,
  onError,
  dragged,
  onHandlePointerDown,
}: ChecklistProps) {
  /** Le titre en cours de saisie ; « null » tant qu'on ne le modifie pas. */
  const [titre, setTitre] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<ChecklistType | null>(null);
  const [itemASupprimer, setItemASupprimer] = useState<Element | null>(null);
  const [survole, setSurvole] = useState(false);
  // L'élément qu'on vient d'ajouter : il s'ouvre en saisie.
  const [nouvelItem, setNouvelItem] = useState<Id | null>(null);
  // Le menu contextuel ouvert : celui de l'entête (sans élément) ou d'un
  // élément.
  const [menu, setMenu] = useState<{ item: Element | null; position: PointMenuPosition } | null>(
    null,
  );

  const items = checklist.items || [];
  const pourcentage = avancement(items);

  // Tout ce qui part au serveur passe par ici : une panne se dit à l'écran,
  // au lieu de laisser le geste sans effet apparent.
  const agir = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError?.(messageErreur(e));
    }
  };

  // Les éléments se glissent entre eux, à l'intérieur de leur checklist.
  const { zoneRef, drag, onPointerDown } = usePileGlissante({
    ids: items.map((i) => i.id),
    selector: "[data-checklist-item]",
    onReorder: (ordre) =>
      agir(async () => {
        await api.reorderChecklistItems(checklist.id, ordre);
        await onChanged();
      }),
  });

  const validerTitre = async () => {
    const nom = (titre ?? "").trim();
    setTitre(null);
    if (!nom || nom === checklist.title) return;
    await agir(async () => {
      await api.updateChecklist(checklist.id, { title: nom });
      await onChanged();
    });
  };

  // La ligne naît sans libellé et s'ouvre aussitôt en saisie : on l'écrit dans
  // la foulée du clic, sans avoir à la rouvrir.
  const ajouterItem = () =>
    agir(async () => {
      const cree = await api.createChecklistItem(checklist.id);
      await onChanged();
      setNouvelItem(cree.id);
    });

  const modifierItem = (item: Element, data: ChecklistItemInput) =>
    agir(async () => {
      await api.updateChecklistItem(item.id, data);
      await onChanged();
    });

  const supprimerItem = async () => {
    const item = itemASupprimer;
    setItemASupprimer(null);
    if (!item) return;
    await agir(async () => {
      await api.deleteChecklistItem(item.id);
      await onChanged();
    });
  };

  return (
    <Paper
      radius="md"
      p="sm"
      data-checklist={checklist.id}
      onMouseEnter={() => setSurvole(true)}
      onMouseLeave={() => setSurvole(false)}
      // Le fond des champs de la fiche, sans leur bordure : la checklist se lit
      // comme l'un d'eux.
      bg="var(--mantine-color-default)"
      style={{ opacity: dragged ? 0.4 : 1 }}
    >
      <Stack gap="xs">
        {/* Entête : la poignée, le titre, la progression. */}
        <Group
          gap="xs"
          wrap="nowrap"
          align="center"
          onContextMenu={(e) =>
            !dansUneSaisie(e) && setMenu({ item: null, position: positionDuMenu(e) })
          }
        >
          {/* La poignée ouvre l'entête : c'est par elle qu'on range les
              checklists entre elles. */}
          <DragHandle
            onPointerDown={onHandlePointerDown}
            visible={survole}
            label="Glisser pour réordonner la checklist"
          />
          {titre === null ? (
            <Text
              fw={600}
              size="sm"
              onClick={() => setTitre(checklist.title)}
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
              value={titre}
              onChange={(e) => setTitre(e.currentTarget.value)}
              onBlur={validerTitre}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  validerTitre();
                }
                if (e.key === "Escape") setTitre(null);
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
              value={pourcentage}
              color="teal"
              size={PROGRESS_HEIGHT}
              radius="xl"
              w={PROGRESS_WIDTH}
            />
            <Text size="xs" c="dimmed" w={34} ta="right">
              {pourcentage}%
            </Text>
          </Group>
        </Group>

        <Stack gap={ITEM_GAP} ref={zoneRef}>
          {items.map((item, index) => (
            <div key={item.id}>
              {drag?.target === index && <InsertLine gap={ITEM_GAP} />}
              <ChecklistItem
                item={item}
                users={users}
                dragged={drag?.id === item.id}
                autoEdit={nouvelItem === item.id}
                onEditDone={() => setNouvelItem(null)}
                onPointerDown={onPointerDown(item.id, index)}
                onToggle={(done) => modifierItem(item, { done })}
                onRename={(text) => modifierItem(item, { text })}
                onDate={(due_date) => modifierItem(item, { due_date })}
                onMembers={(member_ids) => modifierItem(item, { member_ids })}
                onContextMenu={(position) => setMenu({ item, position })}
              />
            </div>
          ))}
          {drag && drag.target >= items.length && <InsertLine gap={ITEM_GAP} />}

          {/* Le vert des actions « ajouter », comme au bout d'une liste. */}
          <UnstyledButton onClick={ajouterItem} mt={4}>
            <Group gap={PLUS_GAP} wrap="nowrap" c={ADD_ACTION.color}>
              <IconPlus size={PLUS_SIZE} />
              <Text size="sm">Ajouter un élément</Text>
            </Group>
          </UnstyledButton>
        </Stack>
      </Stack>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() =>
              menu.item ? setItemASupprimer(menu.item) : setASupprimer(checklist)
            }
          >
            {menu.item ? "Supprimer l'élément" : "Supprimer la checklist"}
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={() => {
          setASupprimer(null);
          return agir(async () => {
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
        opened={itemASupprimer !== null}
        onClose={() => setItemASupprimer(null)}
        onConfirm={supprimerItem}
        title="Supprimer l'élément"
        message={
          <>
            Voulez-vous vraiment supprimer « {itemASupprimer?.text || "cet élément"} » ?
          </>
        }
      />
    </Paper>
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
}

export default function CardChecklists({
  cardId,
  checklists,
  users,
  onChanged,
  onError,
}: CardChecklistsProps) {
  const listes = checklists || [];

  // Les checklists se glissent entre elles, par la poignée de leur entête.
  const { zoneRef, drag, onPointerDown } = usePileGlissante({
    ids: listes.map((c) => c.id),
    selector: "[data-checklist]",
    onReorder: async (ordre) => {
      try {
        await api.reorderChecklists(cardId, ordre);
        await onChanged();
      } catch (e) {
        onError?.(messageErreur(e));
      }
    },
  });

  if (listes.length === 0) return null;

  return (
    // Le bloc porte son intitulé comme les autres champs de la fiche — le
    // titre, la description, le numéro —, et disparaît avec eux quand la carte
    // n'a aucune checklist.
    <Input.Wrapper label="Checklist">
      <Stack gap={CHECKLIST_GAP} ref={zoneRef}>
        {listes.map((checklist, index) => (
          <div key={checklist.id}>
            {drag?.target === index && <InsertLine gap={CHECKLIST_GAP} />}
            <Checklist
              checklist={checklist}
              users={users}
              onChanged={onChanged}
              onError={onError}
              dragged={drag?.id === checklist.id}
              onHandlePointerDown={onPointerDown(checklist.id, index)}
            />
          </div>
        ))}
        {drag && drag.target >= listes.length && <InsertLine gap={CHECKLIST_GAP} />}
      </Stack>
    </Input.Wrapper>
  );
}
