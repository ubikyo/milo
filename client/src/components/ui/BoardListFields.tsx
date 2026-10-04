import { Group, Input, Menu, NumberInput, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCategory, IconFlag, IconTag, IconTrash } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, DragEvent } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import MilestonesModal from "../project/MilestonesModal";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Id, Milestone, MilestoneType } from "@milo/shared";
import { CopyPasteContext } from "./CopyPasteActions";
import AddButton from "./AddButton";
import { DrawerRegistrationsContext } from "./IndicatorDrawer";
import LabelColorPicker from "./LabelColorPicker";
import {
  ROUNDING,
  RowButton,
  EmptyList,
  Handle,
  ROW_INSET,
  NAME_INSET,
  INPUT_STYLE,
  move,
  pluralize,
  rowStyle,
} from "./DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";

// Les catégories ou les étiquettes du tableau ouvert, dans le tiroir d'un
// widget « Projets » ou « Tâches », sous la même allure que ses colonnes
// (ChampsColonnes) : une ligne par élément, sa poignée pour le glisser, son
// nom à même la ligne, sa couleur et son poids pour une étiquette. Le clic
// droit le retire ; « Ajouter » pose une ligne vide au bout.
//
// Ce ne sont pas des réglages du widget mais des données du tableau : rien ne
// part avant « Sauvegarder » (EnregistrementsDuTiroirContext), et « Fermer »
// laisse tout comme avant. Ce qui sert encore — une catégorie qui range des
// projets, une étiquette posée — ne se retire pas : le serveur le refuse, et
// la notification le dit.
//
// Les types de jalons se règlent ici aussi, sous les catégories, bien qu'ils
// soient communs à tous les tableaux : rangés par nom, ils n'ont pas de
// poignée, et leurs jalons s'ouvrent depuis le menu de leur ligne.

/** Ce que la liste gère : une catégorie, une étiquette de cartes ou de projets. */
export type ListKind = "categories" | "task-labels" | "project-labels" | "milestone-types";

interface Element {
  id: Id;
  name: string;
  color?: string;
  weight?: number;
  milestones?: Milestone[];
}

/** Une ligne du brouillon : « id » absent tant qu'elle n'est pas créée. */
interface Row {
  key: string;
  id?: Id;
  name: string;
  color: string;
  weight: number;
}

interface ListKindInfo {
  title: string;
  add: string;
  /** Ce que la liste partage, dit sous elle. */
  scope: string;
  /** « la catégorie », pour les messages. */
  nounPhrase: string;
  /** L'icône et le message de la liste vide (ListeVide). */
  icon: ComponentType<{ size?: number; color?: string }>;
  empty: string;
  withColor: boolean;
  withWeight: boolean;
  /** Faux quand le serveur range la liste lui-même : pas de poignée. */
  orderable: boolean;
  read: (boardId: Id) => Promise<Element[]>;
  create: (boardId: Id, row: Row) => Promise<{ id: Id }>;
  updateStatement: (id: Id, row: Row) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
  store: (boardId: Id, ids: Id[]) => Promise<unknown>;
}

const NO_REORDER = async () => undefined;

const KINDS: Record<ListKind, ListKindInfo> = {
  categories: {
    title: "Catégories",
    add: "Ajouter une catégorie",
    scope: "Les catégories configurées ci-dessous sont communes à l'ensemble des widgets, de type projet, du tableau actuel et uniquement pour ce tableau.",
    nounPhrase: "la catégorie",
    icon: IconCategory,
    empty: "Aucune catégorie",
    withColor: false,
    withWeight: false,
    orderable: true,
    read: (boardId) => api.getCategories(String(boardId)),
    create: (boardId, l) => api.createCategory(boardId, l.name),
    updateStatement: (id, l) => api.updateCategory(id, { name: l.name }),
    remove: (id) => api.deleteCategory(id),
    store: (boardId, ids) => api.reorderCategories(boardId, ids),
  },
  "task-labels": {
    title: "Étiquettes",
    add: "Ajouter une étiquette",
    scope: "Les étiquettes configurées ci-dessous sont communes à l'ensemble des widgets, de type tâche, du tableau actuel et uniquement pour ce tableau.",
    nounPhrase: "l'étiquette",
    icon: IconTag,
    empty: "Aucune étiquette",
    withColor: true,
    withWeight: false,
    orderable: true,
    read: (boardId) => api.getLabels(boardId),
    create: (boardId, l) => api.createLabel(boardId, l.name, l.color),
    updateStatement: (id, l) => api.updateLabel(id, { name: l.name, color: l.color }),
    remove: (id) => api.deleteLabel(id),
    store: (boardId, ids) => api.reorderLabels(boardId, ids),
  },
  "project-labels": {
    title: "Étiquettes",
    add: "Ajouter une étiquette",
    scope: "Les étiquettes configurées ci-dessous sont communes à l'ensemble des widgets, de type projet, du tableau actuel et uniquement pour ce tableau.",
    nounPhrase: "l'étiquette",
    icon: IconTag,
    empty: "Aucune étiquette",
    withColor: true,
    withWeight: true,
    orderable: true,
    read: (boardId) => api.getProjectLabels(boardId),
    create: (boardId, l) => api.createProjectLabel(boardId, l.name, l.color, l.weight),
    updateStatement: (id, l) =>
      api.updateProjectLabel(id, { name: l.name, color: l.color, weight: l.weight }),
    remove: (id) => api.deleteProjectLabel(id),
    store: (boardId, ids) => api.reorderProjectLabels(boardId, ids),
  },
  "milestone-types": {
    title: "Types de jalons",
    add: "Ajouter un type de jalons",
    scope: "Les types de jalons configurés ci-dessous sont communs à l'ensemble des tableaux de projets.",
    nounPhrase: "le type de jalons",
    icon: IconFlag,
    empty: "Aucun type de jalons",
    withColor: false,
    withWeight: false,
    orderable: false,
    read: () => api.getMilestoneTypes(),
    create: (_boardId, l) => api.createMilestoneType(l.name),
    updateStatement: (id, l) => api.updateMilestoneType(id, { name: l.name }),
    remove: (id) => api.deleteMilestoneType(id),
    store: NO_REORDER,
  },
};

let counter = 0;
const newKey = () => `new-${++counter}`;

const inline = (e: Element): Row => ({
  key: String(e.id),
  id: e.id,
  name: e.name,
  color: e.color ?? DEFAULT_LABEL_COLOR,
  weight: e.weight ?? 0,
});

/**
 * Les jalons qu'un type montre dans sa fenêtre (MilestonesModal) : les siens,
 * et toujours celui de fin, à 100 %.
 */
const milestoneCount = (type: Element | undefined): number =>
  (type?.milestones ?? []).filter((m) => m.value !== 100).length + 1;

export default function BoardListFields({ kind }: { kind: ListKind }) {
  const s = KINDS[kind];
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const boardId = board?.board?.id ?? null;
  // Un collage depuis le menu « Actions » change la liste : elle se relit.
  const pastes = board?.pastes ?? 0;

  /** Ce que le serveur porte, et le brouillon qu'on en fait. */
  const [originals, setOriginals] = useState<Element[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [held, setHeld] = useState<number | null>(null);
  /** La ligne dont un champ a le focus : il prend le fond du tiroir. */
  const [input, setInput] = useState<string | null>(null);
  /** La ligne qu'on vient d'ajouter : son nom prend le focus. */
  const [toName, setToName] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);
  /** Le type dont la fenêtre des jalons est ouverte. */
  const [milestonesOf, setMilestonesOf] = useState<Id | null>(null);

  const reload = useCallback(async () => {
    if (boardId === null) return;
    try {
      const readItems = await s.read(boardId);
      setOriginals(readItems);
      setRows(readItems.map(inline));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId, s]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // « Sauvegarder » : ce qui est parti, ce qui a changé, ce qui est nouveau,
  // puis l'ordre. Un nom vide arrête tout avant le premier envoi.
  const state = useRef({ originals, rows });
  state.current = { originals, rows };
  useEffect(() => {
    if (!register || boardId === null) return;
    return register(async () => {
      const { originals: before, rows: after } = state.current;
      const keptKeys = after.filter((l) => l.id !== undefined || l.name.trim());
      if (keptKeys.some((l) => !l.name.trim())) {
        throw new Error(`${s.title} : chaque ligne demande un nom.`);
      }
      try {
        for (const o of before) {
          if (!keptKeys.some((l) => l.id === o.id)) await s.remove(o.id);
        }
        const ids: Id[] = [];
        for (const l of keptKeys) {
          const row = { ...l, name: l.name.trim() };
          if (l.id === undefined) {
            ids.push((await s.create(boardId, row)).id);
            continue;
          }
          const o = before.find((x) => x.id === l.id);
          const change =
            !o ||
            o.name !== row.name ||
            (s.withColor && (o.color ?? DEFAULT_LABEL_COLOR) !== row.color) ||
            (s.withWeight && (o.weight ?? 0) !== row.weight);
          if (change) await s.updateStatement(l.id, row);
          ids.push(l.id);
        }
        const orderBefore = before.filter((o) => ids.includes(o.id)).map((o) => o.id);
        const sameOrder =
          ids.length === orderBefore.length && ids.every((id, i) => id === orderBefore[i]);
        if (!sameOrder && s.orderable) await s.store(boardId, ids);
      } finally {
        // Ce qui est parti l'est : la liste repart du serveur, même après une
        // erreur.
        await reload();
      }
    });
  }, [register, boardId, s, reload]);

  const change = (rank: number, change: Partial<Row>) =>
    setRows((before) => before.map((l, i) => (i === rank ? { ...l, ...change } : l)));

  const add = () => {
    const key = newKey();
    setRows((before) => [...before, { key, name: "", color: DEFAULT_LABEL_COLOR, weight: 0 }]);
    setToName(key);
  };

  const remove = (rank: number) => setRows((before) => before.filter((_, i) => i !== rank));

  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(rows, held, rank);
    if (!next) return;
    setHeld(rank);
    setRows(next);
  };

  // Le type ouvert, gardé tant qu'il ne change pas : la fenêtre repart de lui
  // à chaque nouvel objet, et perdrait ce qu'on y saisit.
  const openType = useMemo<MilestoneType | null>(() => {
    const original = originals.find((o) => o.id === milestonesOf);
    return original ? { id: original.id, name: original.name, milestones: original.milestones ?? [] } : null;
  }, [originals, milestonesOf]);

  if (boardId === null) return null;

  return (
    // Ce ne sont pas des réglages du widget : le dire sous le libellé, à
    // 20 px de la liste.
    <Input.Wrapper
      label={s.title}
      description={s.scope}
      styles={{ description: { paddingBottom: 20 } }}
    >
      {rows.length === 0 && <EmptyList icon={s.icon} message={s.empty} />}
      {rows.length > 0 && (
        <Stack gap={1}>
          {rows.map((row, rank) => (
            <Group
              key={row.key}
              gap="sm"
              wrap="nowrap"
              onDragOver={(e) => dragHover(e, rank)}
              onDrop={(e) => e.preventDefault()}
              onContextMenu={(e) => setMenu({ rank, position: menuPosition(e) })}
              // Sans poignée, le champ se cale à gauche comme il se cale à
              // droite : à RETRAIT_LIGNE du bord de la ligne.
              style={{
                ...rowStyle(rank, rows.length, held === rank),
                ...(s.orderable ? null : { paddingLeft: ROW_INSET }),
              }}
            >
              {s.orderable && (
                <Handle
                  label={`Déplacer ${row.name || s.nounPhrase}`}
                  onDragStart={() => setHeld(rank)}
                  onDragEnd={() => setHeld(null)}
                />
              )}
              <TextInput
                size="sm"
                radius={ROUNDING}
                // Le nom s'aligne sur la poignée, comme celui d'une colonne.
                style={{ flex: 1, marginLeft: s.orderable ? -NAME_INSET : 0 }}
                styles={{
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    paddingLeft: NAME_INSET,
                    // Sans bordure, le texte tombe sous le nom d'une colonne ;
                    // le contour du focus se pose au bord même du champ.
                    borderWidth: 0,
                    ...(input === `${row.key}-nom`
                      ? INPUT_STYLE
                      : { backgroundColor: "transparent" }),
                  },
                }}
                placeholder="Nom"
                value={row.name}
                onChange={(e) => change(rank, { name: e.currentTarget.value })}
                autoFocus={toName === row.key}
                onFocus={() => setInput(`${row.key}-nom`)}
                onBlur={() => {
                  setInput(null);
                  setToName(null);
                  // Une ligne ajoutée, quittée sans nom, s'efface.
                  if (row.id === undefined && !row.name.trim()) {
                    setRows((before) => before.filter((l) => l.key !== row.key));
                  }
                }}
                aria-label={`Nom de ${row.name || s.nounPhrase}`}
              />
              {s.withColor && (
                <LabelColorPicker
                  color={row.color}
                  onChange={(color) => change(rank, { color })}
                  label={row.name || s.nounPhrase}
                />
              )}
              {s.withWeight && (
                <NumberInput
                  size="xs"
                  radius={ROUNDING}
                  w={100}
                  placeholder="Poids"
                  allowDecimal={false}
                  aria-label={`Poids de ${row.name || s.nounPhrase}`}
                  value={row.weight}
                  onChange={(value) => change(rank, { weight: Number(value) || 0 })}
                  onFocus={() => setInput(`${row.key}-poids`)}
                  onBlur={() => setInput(null)}
                  styles={
                    input === `${row.key}-poids` ? { input: INPUT_STYLE } : undefined
                  }
                />
              )}
              {/* Les jalons d'un type déjà créé : leur nombre, et leur fenêtre
                  au clic. Ils s'enregistrent depuis elle, sans attendre
                  « Sauvegarder ». */}
              {kind === "milestone-types" && row.id !== undefined && (
                <RowButton icon={IconFlag} onClick={() => setMilestonesOf(row.id!)}>
                  {pluralize(milestoneCount(originals.find((o) => o.id === row.id)), "jalon")}
                </RowButton>
              )}
            </Group>
          ))}
        </Stack>
      )}

      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label={s.add} onClick={add} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          {/* Les jalons d'un type déjà créé : ils s'enregistrent depuis leur
              fenêtre, sans attendre « Sauvegarder ». */}
          {kind === "milestone-types" && rows[menu.rank]?.id !== undefined && (
            <Menu.Item
              leftSection={<IconFlag size={16} />}
              onClick={() => setMilestonesOf(rows[menu.rank]!.id!)}
            >
              Jalons
            </Menu.Item>
          )}
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              const row = rows[menu.rank];
              // Une catégorie qui range des projets ne se retire pas : le
              // serveur le refuserait à la sauvegarde.
              const original = originals.find((o) => o.id === row?.id) as
                | (Element & { project_count?: number })
                | undefined;
              if (original?.project_count) {
                notifications.show({
                  color: "orange",
                  title: "Suppression impossible",
                  message: `« ${original.name} » range encore ${original.project_count} projet${
                    original.project_count > 1 ? "s" : ""
                  }.`,
                });
                return;
              }
              remove(menu.rank);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      {kind === "milestone-types" && (
        <MilestonesModal
          type={openType}
          onClose={() => setMilestonesOf(null)}
          onSave={async (milestones) => {
            if (milestonesOf === null) return;
            await api.updateMilestoneType(milestonesOf, { milestones });
            // Le brouillon des noms reste tel quel : seuls les jalons changent.
            setOriginals((before) =>
              before.map((o) => (o.id === milestonesOf ? { ...o, milestones } : o)),
            );
          }}
        />
      )}
    </Input.Wrapper>
  );
}
