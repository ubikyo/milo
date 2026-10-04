import {
  ActionIcon,
  Anchor,
  Button,
  Center,
  Divider,
  Group,
  Popover,
  Text,
  getDefaultZIndex,
} from "@mantine/core";
import {
  IconCategory,
  IconChevronDown,
  IconGripVertical,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { ADD_ACTION, NEUTRAL_HOVER, RED } from "../../themes/colors";
import { ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import classes from "../../assets/styles/ContextsMenu.module.css";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { NO_CONTEXT } from "@milo/shared";
import type { Context, Id } from "@milo/shared";

// Les contextes du tableau ouvert : la liste du bout de la rangée. En tête,
// « Tous les contextes », qui ne se range ni ne se supprime mais se renomme ;
// puis les contextes, qu'un double clic renomme, qu'on glisse pour les ranger
// et que la corbeille supprime — avec tout ce qui leur appartient. Au bout,
// « Ajouter un contexte ».
//
// Un clic choisit aussitôt le contexte qu'on regarde. La liste, elle, attend
// un instant avant de se refermer, pour qu'un double clic puisse encore
// renommer ; sans le droit de renommer, elle se referme tout de suite.

/** Le fond de la pastille de l'icône, sans contexte : un gris neutre, pas bleuté. */
const DOT = "light-dark(#ededed, var(--mantine-color-dark-4))";

/** Les bornes de la largeur de la liste. */
const WIDTH_MIN = 240;
const WIDTH_MAX = 320;

/** La valeur de « Tous les contextes ». */
export const ALL = "all";

/** Le temps qu'attend un clic avant de choisir : un double clic le devance. */
const DOUBLE_CLICK_THRESHOLD = 250;

/** Le nom d'un contexte qu'on vient d'ajouter, aussitôt en saisie. */
const NEW_CONTEXT = "Nouveau contexte";

export interface ContextManagement {
  onAdd: (name: string) => Promise<void>;
  onRename: (id: Id, name: string) => Promise<void>;
  /** Renommer « Tous les contextes ». */
  onRenameAll: (name: string) => Promise<void>;
  onDelete: (id: Id) => Promise<void>;
  onReorder: (ids: Id[]) => Promise<void>;
}

export interface ContextsMenuProps {
  items: Context[];
  /** Le libellé de « Tous les contextes », tel que le tableau le porte. */
  all: string;
  /** Le contexte regardé, ou « all ». */
  value: string;
  onChange: (value: string) => void;
  /** Sans elle — sans le droit d'organiser les tableaux —, la liste ne fait que choisir. */
  management?: ContextManagement;
  visibleFrom?: string;
  /**
   * Posée dans l'onglet du tableau, à droite de son nom : l'onglet est déjà
   * un bouton, la cible n'en est pas un autre, et la liste part de sa gauche.
   */
  inTab?: boolean;
}

/** Ce qu'on renomme : un contexte, ou « Tous les contextes ». */
type Renamed = { id: Id | typeof ALL; name: string };

export default function ContextsMenu({
  items: received,
  all: receivedAll,
  value,
  onChange,
  management,
  visibleFrom,
  inTab = false,
}: ContextsMenuProps) {
  const [isOpen, setOpened] = useState(false);
  // Dans l'onglet, la liste tombe sur le filet de la rangée et part du bord
  // gauche de l'onglet. La cible n'a que la hauteur de son texte, à droite du
  // nom : les deux écarts se mesurent à l'ouverture, de la cible à l'onglet.
  const [tabGap, setTabOffset] = useState({
    mainAxis: ROW_MENU_OFFSET,
    crossAxis: 0,
  });
  // La largeur de l'onglet, mesurée avec : la liste la prend, et ne
  // s'élargit que si son contenu le demande.
  const [tabWidth, setTabWidth] = useState(0);
  /** La cible, relevée à l'ouverture : la mesure la suit tant que la liste est ouverte. */
  const targetRef = useRef<HTMLElement | null>(null);
  const measure = (target: HTMLElement) => {
    const tab = target.closest('[role="tab"]')?.getBoundingClientRect();
    const button = target.getBoundingClientRect();
    if (!tab) return;
    // Moins un pixel : le trait du haut de la liste se pose sur la ligne du
    // filet, au lieu de tomber dessous.
    setTabOffset({
      mainAxis: tab.bottom - button.bottom - 1,
      crossAxis: tab.left - button.left,
    });
    setTabWidth(tab.width);
  };
  const toggle = (target: HTMLElement) => {
    if (inTab && !isOpen) {
      targetRef.current = target;
      measure(target);
    }
    setOpened((o) => !o);
  };
  // Liste ouverte, l'onglet peut changer de taille — « Tous les … » renommé,
  // le libellé de la cible qui change : la liste suit.
  useEffect(() => {
    const target = targetRef.current;
    const tab = target?.closest('[role="tab"]');
    if (!inTab || !isOpen || !target || !tab) return;
    const following = new ResizeObserver(() => measure(target));
    following.observe(tab);
    // À l'essai : l'onglet prend le fond et la bordure de la liste ouverte
    // (ContextsMenu.module.css, data-contexts-open).
    // La rangée aussi : son filet s'éclaircit avec.
    const band = tab.closest('[role="tablist"]');
    tab.setAttribute("data-contexts-open", "");
    band?.setAttribute("data-contexts-open", "");
    return () => {
      following.disconnect();
      tab.removeAttribute("data-contexts-open");
      band?.removeAttribute("data-contexts-open");
    };
  }, [inTab, isOpen]);
  const [renamed, setRenamed] = useState<Renamed | null>(null);
  // Le nom validé, montré le temps que le serveur réponde et que le tableau
  // revienne relu : sans lui, l'ancien nom reparaîtrait un instant.
  const [provisional, setProvisional] = useState<Renamed | null>(null);
  const items = provisional
    ? received.map((c) => (c.id === provisional.id ? { ...c, name: provisional.name } : c))
    : received;
  const all = provisional?.id === ALL ? provisional.name : receivedAll;
  const [toDelete, setToDelete] = useState<Context | null>(null);
  /** Le contexte tenu, et le rang où il se poserait. */
  const [dragging, setDragged] = useState<{ id: Id; target: number } | null>(null);
  /** Le nouvel ordre, montré sans attendre le serveur ; effacé dès qu'il répond. */
  const [localOrder, setLocalOrder] = useState<Id[] | null>(null);
  /** Vrai entre l'ajout et l'arrivée du contexte ajouté : il passe alors en saisie. */
  const [addInProgress, setAddInProgress] = useState<number | null>(null);
  const click = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finished = useRef(false);

  useEffect(() => setLocalOrder(null), [received]);
  useEffect(() => () => clearTimeout(click.current), []);

  // Le contexte qu'on vient d'ajouter passe en saisie de son nom dès qu'il
  // paraît, au bout de la liste.
  useEffect(() => {
    if (addInProgress === null || items.length <= addInProgress) return;
    const last = items[items.length - 1];
    setAddInProgress(null);
    if (last) openRename({ id: last.id, name: last.name });
  }, [items, addInProgress]);

  const ordered = localOrder
    ? localOrder
        .map((id) => items.find((c) => c.id === id))
        .filter((c): c is Context => c !== undefined)
    : items;

  // Sans contexte, la liste le dit plutôt que d'offrir « Tous » de rien.
  const current =
    items.length === 0
      ? NO_CONTEXT
      : value === ALL
        ? all
        : (items.find((c) => String(c.id) === value)?.name ?? all);

  const select = (picked: string) => {
    clearTimeout(click.current);
    if (picked !== value) onChange(picked);
    if (!management) return setOpened(false);
    click.current = setTimeout(() => setOpened(false), DOUBLE_CLICK_THRESHOLD);
  };

  function openRename(target: Renamed) {
    if (!management) return;
    clearTimeout(click.current);
    finished.current = false;
    setRenamed(target);
  }

  const finishRename = async (validate: boolean) => {
    if (!renamed || finished.current || !management) return;
    finished.current = true;
    const { id, name } = renamed;
    setRenamed(null);
    const trimmedName = name.trim();
    if (!validate || !trimmedName) return;
    if (id === ALL ? trimmedName === all : trimmedName === items.find((c) => c.id === id)?.name) return;
    setProvisional({ id, name: trimmedName });
    try {
      if (id === ALL) await management.onRenameAll(trimmedName);
      else await management.onRename(id, trimmedName);
    } finally {
      setProvisional(null);
    }
  };

  const add = async () => {
    if (!management) return;
    setAddInProgress(items.length);
    await management.onAdd(NEW_CONTEXT);
  };

  // --- Le glisser-déposer : la ligne visée se lit à la hauteur du pointeur.
  const targetRank = (e: DragEvent<HTMLElement>, index: number): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? index : index + 1;
  };

  const drop = async () => {
    if (!dragging || !management) return;
    const start = ordered.findIndex((c) => c.id === dragging.id);
    setDragged(null);
    const target = dragging.target > start ? dragging.target - 1 : dragging.target;
    if (start < 0 || target === start) return;
    const order = ordered.map((c) => c.id).filter((id) => id !== dragging.id);
    order.splice(target, 0, dragging.id);
    setLocalOrder(order);
    try {
      await management.onReorder(order);
    } catch {
      setLocalOrder(null);
    }
  };

  /** Une ligne : son nom — ou sa saisie —, et ce qui la complète. */
  const row = (
    key: string,
    trimmedName: string,
    target: Renamed,
    extras: { handle?: boolean; trash?: () => void; style?: CSSProperties } = {},
  ) => {
    const selected = value === key;
    const inInput = renamed?.id === target.id;
    return (
      <Group
        gap={4}
        wrap="nowrap"
        className={classes.row}
        data-editing={inInput || undefined}
        onClick={() => !inInput && select(key)}
        onDoubleClick={() => openRename(target)}
        style={{
          padding: management ? "4px 8px 4px 4px" : "4px 8px",
          minHeight: 32,
          ...extras.style,
        }}
      >
        {/* La poignée tient sa place sur chaque ligne, « Tous » compris : les
            noms restent alignés. Sans gestion — verrouillé, ou sans le droit
            —, rien ne se glisse : les noms reprennent sa place. */}
        {management && (
          <div
            className={extras.handle ? classes.reveal : undefined}
            style={{
              width: 16,
              flexShrink: 0,
              display: "flex",
              color: "var(--mantine-color-dimmed)",
              cursor: extras.handle ? "grab" : undefined,
            }}
          >
            {extras.handle && <IconGripVertical size={14} />}
          </div>
        )}
        {inInput ? (
          <input
            value={renamed.name}
            onChange={(e) => {
              const name = e.currentTarget.value;
              setRenamed((r) => (r ? { ...r, name } : r));
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                void finishRename(true);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                void finishRename(false);
              }
            }}
            onBlur={() => void finishRename(true)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
            aria-label={`Renommer ${trimmedName}`}
            // « size » à 1 : sans lui, le champ réclame d'office la place de
            // vingt caractères, et la liste s'élargirait d'autant. Il prend
            // la ligne par « flex ».
            size={1}
            style={{
              flex: 1,
              minWidth: 0,
              font: "inherit",
              fontSize: "var(--mantine-font-size-sm)",
              color: "inherit",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
          />
        ) : (
          <Text size="sm" fw={selected ? 600 : undefined} style={{ flex: 1, minWidth: 0 }} truncate>
            {trimmedName}
          </Text>
        )}
        {extras.trash && (
          // La corbeille ne paraît qu'au survol, mais tient sa place : la ligne
          // ne bouge pas quand la souris la traverse.
          <ActionIcon
            variant="subtle"
            color={RED}
            size="sm"
            className={classes.reveal}
            style={{ flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              clearTimeout(click.current);
              extras.trash?.();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={`Supprimer ${trimmedName}`}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Group>
    );
  };

  /** Le trait qui dit où le contexte tenu se posera. */
  const line = (
    <div style={{ height: 0, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: 4,
          right: 4,
          top: -1,
          borderTop: "2px solid var(--mantine-color-teal-5)",
        }}
      />
    </div>
  );

  return (
    <>
      <Popover
        opened={isOpen}
        onChange={setOpened}
        position={inTab ? "bottom-start" : "bottom-end"}
        withinPortal
        shadow="md"
        offset={inTab ? tabGap : ROW_MENU_OFFSET}
        // Hors de l'onglet, la liste se raccorde au filet : ni bordure haute
        // ni angles hauts. Dans l'onglet, elle garde sa bordure haute — le
        // trait qui la sépare de l'onglet (classes.tabDropdown) —, sans
        // angles hauts.
        styles={
          inTab
            ? {
                dropdown: {
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                  borderTopStyle: "dotted",
                },
              }
            : TAB_MENU_STYLES
        }
        // La fenêtre de confirmation est un clic « au dehors » : la liste
        // s'en irait, et l'on y reviendrait sitôt la question répondue.
        closeOnClickOutside={toDelete === null}
      >
        <Popover.Target>
          {/* Le même bouton que le menu « Actions » de la rangée. */}
          <Button
            component={inTab ? "span" : "button"}
            role={inTab ? "button" : undefined}
            // Dans l'onglet, plus léger que le nom du tableau ; ni fond ni
            // retrait — le survol change la couleur du texte (cibleOnglet).
            fw={inTab ? 300 : undefined}
            // Le chevron serré contre le libellé.
            styles={inTab ? { section: { marginInlineStart: 2 } } : undefined}
            variant={inTab ? "transparent" : "subtle"}
            color="gray"
            size="xs"
            px={inTab ? 0 : undefined}
            // À la hauteur du texte : les 30 px du bouton agrandiraient
            // l'onglet dès que la liste paraît — en modification, par exemple.
            h={inTab ? "auto" : undefined}
            className={inTab ? classes.tabTarget : undefined}
            rightSection={<IconChevronDown size={14} />}
            aria-label="Contexte"
            visibleFrom={visibleFrom}
            onClick={(e: MouseEvent<HTMLElement>) => toggle(e.currentTarget)}
            style={
              inTab ? undefined : ({ "--button-hover": NEUTRAL_HOVER } as CSSProperties)
            }
          >
            {current}
          </Button>
        </Popover.Target>
        <Popover.Dropdown
          p={4}
          className={inTab ? classes.tabDropdown : undefined}
          // Dans l'onglet, au moins sa largeur : la liste ne s'élargit que si
          // son contenu le demande — sans contexte, il tient toujours. Ailleurs,
          // ses propres bornes.
          {...(inTab && tabWidth > 0
            ? { miw: tabWidth, maw: Math.max(WIDTH_MAX, tabWidth) }
            : { miw: WIDTH_MIN, maw: WIDTH_MAX })}
        >
          {/* Sans contexte, il ne reste que l'ajout. */}
          {items.length > 0 && (
            <>
              {row(ALL, all, { id: ALL, name: all })}
              <Divider my={4} />
            </>
          )}
          <div
            onDragOver={(e) => {
              if (dragging) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              void drop();
            }}
          >
            {ordered.map((context, index) => (
              <div
                key={context.id}
                draggable={Boolean(management) && renamed?.id !== context.id}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(context.id));
                  setDragged({ id: context.id, target: index });
                }}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  const target = targetRank(e, index);
                  if (target !== dragging.target) setDragged({ ...dragging, target });
                }}
                onDragEnd={() => setDragged(null)}
              >
                {dragging?.target === index && line}
                {row(
                  String(context.id),
                  context.name,
                  { id: context.id, name: context.name },
                  {
                    handle: Boolean(management),
                    trash: management ? () => setToDelete(context) : undefined,
                    style: dragging?.id === context.id ? { opacity: 0.4 } : undefined,
                  },
                )}
                {index === ordered.length - 1 && dragging?.target === ordered.length && line}
              </div>
            ))}
          </div>
          {/* Sans contexte : un espace, l'icône des contextes au milieu, au-
              dessus de l'ajout. */}
          {management && items.length === 0 && (
            <Center py="md">
              <Center
                w={40}
                h={40}
                style={{ borderRadius: "50%", background: DOT }}
              >
                <IconCategory size={20} color="var(--mantine-color-dimmed)" />
              </Center>
            </Center>
          )}
          {management && (
            <>
              {items.length > 0 && <Divider my={4} />}
              <Anchor
                component="button"
                type="button"
                size="sm"
                c={ADD_ACTION.color}
                onClick={() => void add()}
                px={8}
                py={6}
              >
                <Group gap={PLUS_GAP} wrap="nowrap">
                  <IconPlus size={PLUS_SIZE} />
                  <span>Ajouter un contexte</span>
                </Group>
              </Anchor>
            </>
          )}
        </Popover.Dropdown>
      </Popover>

      {/* Posée hors de la liste, qui l'emporterait en se refermant. */}
      <DeleteConfirmModal
        // La liste reste ouverte pendant la question : la fenêtre passe devant.
        zIndex={getDefaultZIndex("popover") + 1}
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const context = toDelete;
          setToDelete(null);
          if (context) void management?.onDelete(context.id);
        }}
        title="Supprimer le contexte"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Ses projets, ses tâches, ses
            tickets et ses assets seront supprimés. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
