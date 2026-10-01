import { Box, Menu, UnstyledButton } from "@mantine/core";
import {
  IconCopyPlus,
  IconHeadset,
  IconPencil,
  IconSquarePlus,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { widgetDe } from "../../widgets";
import { margesDe } from "../../widgets/marges";
import { ACCESS_BLOCK_CONVERSIONS } from "@milo/shared";
import { RED } from "../../themes/colors";
import PointMenu, {
  positionDuMenu,
  type PointMenuPosition,
} from "../ui/PointMenu";
import {
  TraitInsertion,
  useWidgetDrop,
  type WidgetDrag,
} from "../ui/WidgetDrop";
import type { AccessBlock, AccessBlockType, Id } from "@milo/shared";

// Ce qu'une colonne du mode Accès porte. Le glisser qui range ses widgets —
// d'une place à l'autre, d'une colonne à l'autre — est celui de toutes les
// sections (components/ui/WidgetDrop).
interface SectionBlocksProps {
  /** Les éléments de cette colonne, dans l'ordre. */
  blocks: AccessBlock[];
  sectionId: Id;
  /** Le glisser des widgets, tenu par la rangée des sections. */
  drag: WidgetDrag;
  onEditBlock: (block: AccessBlock) => void;
  onConfigChange: (
    block: AccessBlock,
    config: Record<string, unknown>,
  ) => void | Promise<void>;
  /** La copie se pose juste sous l'original. */
  onDuplicateBlock: (block: AccessBlock) => void | Promise<void>;
  /** Le clic droit demande la suppression ; la page pose la question. */
  onDeleteBlock: (block: AccessBlock) => void;
  /** Une catégorie devient sous-catégorie, et l'inverse (ACCESS_BLOCK_CONVERSIONS). */
  onConvertBlock: (
    block: AccessBlock,
    type: AccessBlockType,
  ) => void | Promise<void>;
  /** « Créer une tâche », pour un lien seulement : offert même verrouillé, il ne touche pas à l'élément. */
  onCreateTask: (block: AccessBlock) => void;
  /** « Créer une demande de support », pour un lien seulement, au même titre. */
  onCreateSupportRequest: (block: AccessBlock) => void;
  /** Catégorie verrouillée : on lit, on ne remanie plus. */
  locked: boolean;
}

export default function SectionBlocks({
  blocks,
  sectionId,
  drag,
  onEditBlock,
  onConfigChange,
  onDuplicateBlock,
  onDeleteBlock,
  onConvertBlock,
  onCreateTask,
  onCreateSupportRequest,
  locked,
}: SectionBlocksProps) {
  const { cible, propsDe } = useWidgetDrop(sectionId, drag, locked);
  /** L'élément dont le menu du clic droit est ouvert, et le point du clic. */
  const [menu, setMenu] = useState<{
    bloc: AccessBlock;
    position: PointMenuPosition;
  } | null>(null);

  // Les éléments montrés dans la colonne, avec leur place dans « blocks » —
  // celle que le dépôt attend. Un type que cette version ne connaît pas est
  // passé plutôt que de faire tomber la colonne ; un élément que son widget
  // dit caché ne paraît pas non plus, n'occupe aucune place, et ne précède ni
  // ne suit personne.
  const visibles = blocks.flatMap((bloc, index) => {
    const widget = widgetDe(bloc.type);
    if (!widget || widget.hidden?.(bloc.config, locked)) return [];
    return [{ bloc, index, widget }];
  });

  // Ce que l'élément du menu peut devenir, s'il le peut.
  const typeConverti = menu
    ? ACCESS_BLOCK_CONVERSIONS[menu.bloc.type]
    : undefined;
  const converti = typeConverti ? widgetDe(typeConverti) : undefined;

  return (
    <>
      {visibles.map(({ bloc, index, widget }, rang) => {
        // L'air autour de l'élément se pose ici, sur ce qui l'enveloppe : le
        // trait d'insertion suit ainsi l'élément lui-même, pas sa marge.
        const marges = margesDe(widget, bloc.config, {
          previousType: visibles[rang - 1]?.bloc.type ?? null,
          nextType: visibles[rang + 1]?.bloc.type ?? null,
        });

        // Verrouillé, un widget qui se modifie sur place ne reçoit rien à
        // enregistrer : son double-clic n'a plus d'effet.
        const affichage = (
          <widget.Display
            blockId={bloc.id}
            config={bloc.config}
            onChange={
              locked ? () => {} : (config) => onConfigChange(bloc, config)
            }
            onEdit={() => onEditBlock(bloc)}
            locked={locked}
          />
        );

        const vise = cible?.id === bloc.id;

        return (
          // Le clic droit ouvre, au point cliqué, ce que l'on peut faire de
          // l'élément.
          <Box
            key={bloc.id}
            {...propsDe(bloc.id, index)}
            // Verrouillé, le menu reste : il n'y offre plus que ce qui ne
            // remanie rien — et rien du tout hors d'un lien : on n'ouvre
            // pas un menu vide.
            onContextMenu={(e) => {
              if (locked && bloc.type !== "link") {
                e.preventDefault();
                return;
              }
              setMenu({ bloc, position: positionDuMenu(e) });
            }}
            style={{
              position: "relative",
              marginTop: marges.haute,
              marginBottom: marges.basse,
              cursor: locked ? "default" : "grab",
              // L'élément pris s'efface : on suit le trait, pas lui.
              opacity: drag.dragged === bloc.id ? 0.4 : 1,
            }}
          >
            {vise && <TraitInsertion avant={cible.avant} />}

            {/* Un widget qui se modifie sur place n'ouvre pas de tiroir
                au clic : il a son propre geste, le double-clic. */}
            {widget.ownClicks || locked ? (
              affichage
            ) : (
              <UnstyledButton
                onClick={() => onEditBlock(bloc)}
                style={{ display: "block", width: "100%" }}
              >
                {affichage}
              </UnstyledButton>
            )}
          </Box>
        );
      })}

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          {!locked && (
            <>
              {/* Le tiroir de l'élément. C'est le seul chemin qui y mène
                    pour un widget qui garde ses clics — le lien ouvre son
                    adresse au clic simple et se renomme au double — et le
                    reste de sa configuration se règle là. */}
              <Menu.Item
                leftSection={<IconPencil size={16} />}
                onClick={() => {
                  setMenu(null);
                  onEditBlock(menu.bloc);
                }}
              >
                Modifier
              </Menu.Item>
              <Menu.Item
                leftSection={<IconCopyPlus size={16} />}
                onClick={() => {
                  setMenu(null);
                  void onDuplicateBlock(menu.bloc);
                }}
              >
                Dupliquer
              </Menu.Item>
              {converti && typeConverti && (
                <Menu.Item
                  leftSection={<converti.icon size={16} />}
                  onClick={() => {
                    setMenu(null);
                    void onConvertBlock(menu.bloc, typeConverti);
                  }}
                >
                  Convertir en {converti.label.toLowerCase()}
                </Menu.Item>
              )}
            </>
          )}
          {/* Seul un lien désigne quelque chose sur quoi travailler : une
                catégorie, un numéro ou une horloge n'appellent ni tâche ni
                demande de support. */}
          {menu.bloc.type === "link" && (
            <>
              <Menu.Item
                leftSection={<IconSquarePlus size={16} />}
                onClick={() => {
                  setMenu(null);
                  onCreateTask(menu.bloc);
                }}
              >
                Créer une tâche
              </Menu.Item>
              <Menu.Item
                leftSection={<IconHeadset size={16} />}
                onClick={() => {
                  setMenu(null);
                  onCreateSupportRequest(menu.bloc);
                }}
              >
                Créer une demande de support
              </Menu.Item>
            </>
          )}
          {!locked && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => {
                  setMenu(null);
                  onDeleteBlock(menu.bloc);
                }}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}
    </>
  );
}
