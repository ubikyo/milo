import { ActionIcon, Group, Menu, SegmentedControl } from "@mantine/core";
import { IconCheck, IconEyeOff, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { View } from "@milo/shared";
import { ADD_ACTION, RED } from "../../themes/colors";
import { MODE_SWITCH_TOP, PAGE_GUTTER } from "../../themes/layout";
import DeleteConfirmModal from "./DeleteConfirmModal";
import AdjustedInput from "./AdjustedInput";
import PointMenu, { menuAnchor, type PointMenuPosition } from "./PointMenu";
import { useTabReorder } from "./useTabReorder";

// Les vues, en bas à gauche : le pendant du « ? » des raccourcis, même
// retrait, dans le coin opposé. Un « + » au bout en crée une, qui passe
// aussitôt en saisie de son nom ; le clic droit sur l'une la renomme — sur
// place, comme un onglet —, la ferme aux autres ou la supprime ; un glisser
// la range — pour soi seul.

interface ViewSwitchProps {
  /** Les vues que le compte voit, dans l'ordre qu'il a rangé. */
  views: View[];
  /** La vue ouverte, en chaîne. */
  value: string | null;
  onChange: (id: string) => void;
  /**
   * Le nouvel ordre, une fois une vue glissée et déposée. Sans lui — tableau
   * ouvert verrouillé —, les vues ne se glissent pas.
   */
  onReorder?: (ids: number[]) => void | Promise<void>;
  /** Sans lui — sans le droit d'organiser les vues —, ni « + » ni menu. */
  onCreate?: () => void | Promise<void>;
  onRename?: (id: number, name: string) => void | Promise<void>;
  onTogglePrivate?: (id: number) => void | Promise<void>;
  onDelete?: (id: number) => void | Promise<void>;
  /**
   * La vue à passer en saisie de son nom dès qu'elle paraît — celle qu'on
   * vient de créer. « onRenommageOuvert » dit que c'est fait.
   */
  toRename?: number | null;
  onRenameOpened?: () => void;
}

/**
 * Le trait d'insertion, posé dans la case visée : rien ne s'insère entre les
 * cases. Il se place contre la case elle-même (positionnée par Mantine), et
 * non contre son libellé, qui porte une marge intérieure : il tombe ainsi sur
 * le filet qui sépare deux vues.
 */
function Line({ side }: { side: "left" | "right" }) {
  return (
    <span
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [side]: -1,
        borderLeft: "2px solid var(--mantine-color-teal-5)",
      }}
    />
  );
}

// Le sélecteur entier : c'est lui que le glisser parcourt pour trouver le
// rang visé.
const sonSelecteur = (element: HTMLElement) =>
  element.closest<HTMLElement>(".mantine-SegmentedControl-root");

/** Le rayon du cadre, que la pastille et les cases reprennent tel quel. */
const RADIUS = "var(--sc-radius, var(--mantine-radius-default))";

export default function ViewSwitch({
  views,
  value,
  onChange,
  onReorder,
  onCreate,
  onRename,
  onTogglePrivate,
  onDelete,
  toRename,
  onRenameOpened,
}: ViewSwitchProps) {
  // Les vues se glissent comme les onglets d'une rangée (useTabReorder).
  const { ordered, tabProps, guardChange, insertAt } = useTabReorder(
    views,
    (v) => v.id,
    onReorder,
    sonSelecteur,
  );
  // Mantine place la pastille de la vue ouverte d'après la position de sa
  // case, et ne la recalcule pas quand les cases changent d'ordre : le
  // sélecteur est reconstruit à chaque nouvel ordre.
  const order = ordered.map((v) => v.id).join(",");

  const [plusHovered, setMoreHovered] = useState(false);
  const [menu, setMenu] = useState<{ view: View; position: PointMenuPosition } | null>(null);
  // La vue en cours de renommage et le nom qu'on y tape.
  const [renamed, setRenamed] = useState<{ id: number; name: string } | null>(null);
  // Le nom validé, montré le temps que le serveur réponde et que les vues
  // reviennent relues : sans lui, l'ancien nom reparaîtrait un instant.
  const [provisional, setProvisional] = useState<{ id: number; name: string } | null>(null);
  // Vrai dès que la saisie est conclue : Entrée suivie de la perte du focus ne
  // doit pas enregistrer deux fois.
  const finished = useRef(false);
  const [toDelete, setToDelete] = useState<View | null>(null);
  const [toOpen, setToOpen] = useState<View | null>(null);

  // Le contenu de la page s'arrête juste au-dessus : il a besoin de savoir où
  // commence cette commande, et seul le sélecteur le sait. Suivi, car sa
  // hauteur change avec la taille du texte comme avec le nombre de vues.
  const command = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = command.current;
    if (!element) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        MODE_SWITCH_TOP,
        `${Math.round(window.innerHeight - element.getBoundingClientRect().top)}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, [order]);

  const withMenu = Boolean(onRename || onTogglePrivate || onDelete);

  const ouvrirRenommage = (view: View) => {
    if (!onRename) return;
    finished.current = false;
    setRenamed({ id: view.id, name: view.name });
  };

  // La vue qu'on vient de créer passe en saisie de son nom dès qu'elle paraît.
  useEffect(() => {
    if (toRename == null) return;
    const view = views.find((v) => v.id === toRename);
    if (!view) return;
    ouvrirRenommage(view);
    onRenameOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toRename, views]);

  const finishRename = async (validate: boolean) => {
    if (!renamed || finished.current) return;
    finished.current = true;
    const { id, name } = renamed;
    setRenamed(null);
    const trimmedName = name.trim();
    const view = views.find((v) => v.id === id);
    if (!validate || !trimmedName || !view || trimmedName === view.name || !onRename) return;
    setProvisional({ id, name: trimmedName });
    try {
      await onRename(id, trimmedName);
    } finally {
      setProvisional(null);
    }
  };

  return (
    <>
      <Group
        ref={command}
        gap={4}
        wrap="nowrap"
        // Aligné sur le retrait du contenu, comme le « ? » du coin opposé.
        style={{ position: "fixed", left: PAGE_GUTTER, bottom: PAGE_GUTTER, zIndex: 200 }}
      >
        {ordered.length > 0 && (
          <SegmentedControl
            key={order}
            value={value ?? ""}
            onChange={guardChange((id: string) => onChange(id))}
            data={ordered.map((view, index) => ({
              value: String(view.id),
              label: (
                <span
                  // Sans position propre : le trait se pose contre la case.
                  {...tabProps(view.id, index, { display: "inline-block" })}
                  // Un double-clic renomme, comme sur un onglet.
                  onDoubleClick={() => ouvrirRenommage(view)}
                  onContextMenu={(e) => {
                    if (!withMenu) return;
                    // Le menu de la vue se pose au-dessus de son segment.
                    const segment =
                      e.currentTarget.closest(".mantine-SegmentedControl-control") ??
                      e.currentTarget;
                    setMenu({ view, position: menuAnchor(e, segment) });
                  }}
                >
                  {insertAt(index) && <Line side="left" />}
                  {index === ordered.length - 1 && insertAt(ordered.length) && (
                    <Line side="right" />
                  )}
                  {renamed?.id === view.id ? (
                    <AdjustedInput
                      value={renamed.name}
                      onChange={(e) => {
                        const name = e.currentTarget.value;
                        setRenamed((r) => (r ? { ...r, name } : r));
                      }}
                      // Les touches restent au champ : sans cela, Tab
                      // changerait de vue et Entrée enregistrerait deux fois.
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
                      // L'appui dans le champ place le curseur : il ne
                      // commence pas à glisser la vue, et ne la rouvre pas.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      autoFocus
                      aria-label={`Renommer ${view.name}`}
                    />
                  ) : provisional?.id === view.id ? (
                    provisional.name
                  ) : (
                    view.name
                  )}
                </span>
              ),
            }))}
            size="sm"
            // Sans traits de séparation entre les vues, sans fond et sans marge
            // intérieure : seule la pastille de la vue ouverte se voit, posée à
            // même la page.
            withItemsBorders={false}
            styles={{
              root: { backgroundColor: "transparent", padding: 0 },
              // Mantine rogne de 4px le rayon de la pastille et des cases, pour
              // qu'elles se logent dans la marge intérieure du cadre, retirée
              // ici : tous reprennent celui du cadre.
              indicator: { borderRadius: RADIUS },
              label: { borderRadius: RADIUS },
              control: { borderRadius: RADIUS },
              // Mantine positionne l'enveloppe du libellé : le trait
              // d'insertion s'y collerait. Sans elle, il se pose contre la
              // case, entre deux vues ; la case garde le libellé au-dessus de
              // la pastille.
              innerLabel: { position: "static" },
            }}
          />
        )}
        {/* Au bout de la dernière vue : en créer une. Le vert des autres
            gestes « ajouter », un ton plus foncé au survol. */}
        {onCreate && (
          <ActionIcon
            variant="transparent"
            size="sm"
            aria-label="Nouvelle vue"
            onClick={() => void onCreate()}
            onMouseEnter={() => setMoreHovered(true)}
            onMouseLeave={() => setMoreHovered(false)}
            style={{ color: plusHovered ? ADD_ACTION.hover : ADD_ACTION.color }}
          >
            <IconPlus size={16} />
          </ActionIcon>
        )}
      </Group>

      {menu && (
        <PointMenu position={menu.position} placement="top-start" onClose={() => setMenu(null)}>
          {onRename && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() => ouvrirRenommage(menu.view)}
            >
              Renommer
            </Menu.Item>
          )}
          {onTogglePrivate && (
            <Menu.Item
              leftSection={<IconEyeOff size={16} />}
              rightSection={menu.view.is_private ? <IconCheck size={14} /> : null}
              // La rendre privée se fait aussitôt ; l'ouvrir à tous se confirme.
              onClick={() =>
                menu.view.is_private ? setToOpen(menu.view) : onTogglePrivate(menu.view.id)
              }
            >
              Privé
            </Menu.Item>
          )}
          {onDelete && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setToDelete(menu.view)}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={toOpen !== null}
        onClose={() => setToOpen(null)}
        onConfirm={() => {
          const view = toOpen;
          setToOpen(null);
          if (view && onTogglePrivate) void onTogglePrivate(view.id);
        }}
        title="Retirer « Privé »"
        message={
          <>
            « {toOpen?.name} » ne sera plus privée : tous ceux qui ont accès à Milo pourront la
            voir.
          </>
        }
        confirmLabel="Valider"
        cancelLabel="Annuler"
        confirmColor="teal"
      />

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const view = toDelete;
          setToDelete(null);
          if (view && onDelete) void onDelete(view.id);
        }}
        title="Supprimer la vue"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Ses tableaux, leurs projets,
            leurs listes de tâches et leurs widgets seront supprimés. Cette action est
            irréversible.
          </>
        }
      />
    </>
  );
}
