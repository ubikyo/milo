import { Box, Menu, Stack, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useRef, useState, type ComponentType, type ReactNode } from "react";
import encart from "../../assets/styles/AccessNumero.module.css";
import { avec } from "../../widgets/types";
import { RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import IndicatorDrawer from "./IndicatorDrawer";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./PointMenu";
import SectionDrawer from "./SectionDrawer";
import SectionsBoard from "./SectionsBoard";
import { CarteIndicateurContext, NOM } from "./TitreIndicateur";
import WidgetPickerModal from "./WidgetPickerModal";
import { TraitInsertion, useWidgetDrop, type WidgetDrag } from "./WidgetDrop";
import type { SectionsDuPanneau } from "../../api";
import type { IndicatorConfigProps } from "../../indicators/types";
import type { Id, IndicatorSection } from "@milo/shared";

/** L'écart entre deux indicateurs d'une section, et entre deux sections. */
const ECART = 20;

/** La hauteur d'un indicateur : son nom en haut, la quantité en bas. */
const HAUTEUR = 120;

/** Un indicateur rangé, quel que soit son panneau. */
export interface Indicateur<Type extends string> {
  id: Id;
  section_id: Id;
  type: Type;
  config: Record<string, unknown>;
}

/** Ce que tout widget d'un panneau porte ; son affichage, lui, dépend du panneau. */
export interface IndicatorWidgetBase<Type extends string> {
  /** Ce que la base range : il ne change jamais. */
  type: Type;
  /** Son nom dans la boîte de choix, et en titre de son tiroir. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** La configuration d'un indicateur neuf. */
  defaultConfig: Record<string, unknown>;
  /**
   * Les champs de son tiroir. Le tiroir lui-même est commun à tous. Sans
   * champs, le widget n'a que son nom à régler : choisi, il s'ajoute
   * aussitôt, sous le nom de son type, et son tiroir ne porte que le nom.
   */
  Config?: ComponentType<IndicatorConfigProps>;
  /**
   * Vrai quand le widget prend ses clics en charge — une liste, dont chaque
   * ligne ouvre ce qu'elle montre. Il se pose alors sans cadre de carte, et
   * son tiroir ne s'ouvre que par le clic droit, hors de ses lignes.
   */
  ownClicks?: boolean;
  /**
   * Vrai quand le widget se nomme à même la section — une catégorie, une
   * sous-catégorie : choisi, il s'ajoute aussitôt, sans tiroir, et attend
   * qu'on le renseigne au double-clic.
   */
  inlineEdit?: boolean;
}

/** Ce que le panneau passe au rendu d'un widget, en plus de sa configuration. */
export interface RenduWidget {
  /** Enregistre une configuration modifiée sur place ; sans effet verrouillé. */
  onChange: (config: Record<string, unknown>) => void | Promise<void>;
  locked: boolean;
}

/** Les écritures d'un panneau, vers ses routes. */
export interface IndicatorsApi<Type extends string> {
  create: (data: {
    section_id: Id;
    type: Type;
    config: Record<string, unknown>;
  }) => Promise<unknown>;
  update: (id: Id, data: { config: Record<string, unknown> }) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
  /** Ce que la section porte désormais, dans l'ordre. */
  reorder: (sectionId: Id, ids: Id[]) => Promise<unknown>;
  sections: SectionsDuPanneau;
}

// Les sections d'un mode qui liste — les demandes du Support, les postes des
// Assets, les projets, les listes de tâches — et ce qu'elles portent. La liste y est un widget comme les
// indicateurs : il n'y a plus de liste à gauche et de panneau à droite, tout
// se range en sections (SectionsBoard), comme au mode Accès. Chaque section a
// sa largeur, se glisse par sa poignée et s'ajoute par le « + » de l'écart.
// Le clic sur un indicateur ouvre son tiroir, le clic droit le modifie ou le
// supprime, et chaque widget se glisse d'une place ou d'une section à
// l'autre. Verrouillé, l'écran se lit seulement.
interface IndicatorsPanelProps<Type extends string, P extends IndicatorWidgetBase<Type>> {
  /** « null » tant que les sections ne sont pas lues. */
  sections: IndicatorSection[] | null;
  indicators: Indicateur<Type>[];
  /** Les widgets du panneau, dans l'ordre de la boîte de choix. */
  widgets: P[];
  widgetOf: (type: Type) => P | undefined;
  /** Ce que le widget montre : c'est le panneau qui sait quoi lui passer. */
  render: (widget: P, config: unknown, rendu: RenduWidget) => ReactNode;
  api: IndicatorsApi<Type>;
  onChanged: () => void | Promise<void>;
  locked: boolean;
}

export default function IndicatorsPanel<Type extends string, P extends IndicatorWidgetBase<Type>>({
  sections,
  indicators,
  widgets,
  widgetOf,
  render,
  api,
  onChanged,
  locked,
}: IndicatorsPanelProps<Type, P>) {
  /** La section dont le « + » a ouvert la boîte de choix. */
  const [sectionPourWidget, setSectionPourWidget] = useState<IndicatorSection | null>(null);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const [modifie, setModifie] = useState<Indicateur<Type> | null>(null);
  const [cree, setCree] = useState<{ widget: P; sectionId: Id } | null>(null);

  const [menu, setMenu] = useState<{
    indicateur: Indicateur<Type>;
    position: PointMenuPosition;
  } | null>(null);
  const [aSupprimer, setASupprimer] = useState<Indicateur<Type> | null>(null);

  /** Le tiroir de section : ouvert à la création (avec son rang) ou sur une section. */
  const [tiroirSection, setTiroirSection] = useState<{
    section: IndicatorSection | null;
    rang: number | null;
  } | null>(null);

  /** Écrire, puis relire quoi qu'il arrive : c'est la lecture qui fait foi. */
  const ecrire = async (ecriture: () => Promise<unknown>) => {
    try {
      await ecriture();
    } finally {
      await onChanged();
    }
  };

  const indicateursDe = (section: IndicatorSection) =>
    indicators.filter((i) => i.section_id === section.id);

  const supprimer = async () => {
    const indicateur = aSupprimer;
    setASupprimer(null);
    if (indicateur) await ecrire(() => api.remove(indicateur.id));
  };

  const choisir = async (widget: P) => {
    const section = sectionPourWidget;
    setSectionPourWidget(null);
    if (!section) return;
    if (!widget.Config || widget.inlineEdit) {
      await ecrire(() =>
        api.create({ section_id: section.id, type: widget.type, config: widget.defaultConfig }),
      );
      return;
    }
    setModifie(null);
    setCree({ widget, sectionId: section.id });
    setTiroirOuvert(true);
  };

  const modifier = (indicateur: Indicateur<Type>) => {
    setCree(null);
    setModifie(indicateur);
    setTiroirOuvert(true);
  };

  return (
    <>
      <SectionsBoard
        sections={sections}
        locked={locked}
        gap={ECART}
        widgetIds={(section) => indicateursDe(section).map((i) => i.id)}
        renderWidgets={(section, drag) => (
          <IndicateursDeSection
            section={section}
            indicateurs={indicateursDe(section)}
            drag={drag}
            locked={locked}
            widgetOf={widgetOf}
            render={render}
            onChange={(indicateur, config) => ecrire(() => api.update(indicateur.id, { config }))}
            onOpen={modifier}
            onRename={(indicateur, nom) =>
              ecrire(() => api.update(indicateur.id, { config: avec(indicateur.config, NOM, nom) }))
            }
            onContextMenu={(indicateur, position) => setMenu({ indicateur, position })}
          />
        )}
        onAddWidget={setSectionPourWidget}
        onReorderWidgets={(sectionId, ids) => ecrire(() => api.reorder(sectionId, ids))}
        onAddSection={(rang) => setTiroirSection({ section: null, rang: rang ?? null })}
        onEditSection={(section) => setTiroirSection({ section, rang: null })}
        onDuplicateSection={(section) => ecrire(() => api.sections.duplicate(section.id))}
        onDeleteSection={(section) => ecrire(() => api.sections.remove(section.id))}
        onReorderSections={(ids) => ecrire(() => api.sections.reorder(ids))}
      />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            leftSection={<IconPencil size={16} />}
            onClick={() => modifier(menu.indicateur)}
          >
            Modifier
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setASupprimer(menu.indicateur)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={supprimer}
        title="Supprimer l'indicateur"
        message={
          <>Voulez-vous vraiment supprimer cet indicateur ? Cette action est irréversible.</>
        }
      />

      <WidgetPickerModal
        opened={sectionPourWidget !== null}
        onClose={() => setSectionPourWidget(null)}
        onChoose={choisir}
        widgets={widgets}
      />

      <IndicatorDrawer
        opened={tiroirOuvert}
        onClose={() => setTiroirOuvert(false)}
        indicator={modifie}
        creating={cree?.widget ?? null}
        sectionId={cree?.sectionId ?? null}
        widgetOf={widgetOf}
        api={api}
        onSaved={async () => {
          setTiroirOuvert(false);
          await onChanged();
        }}
      />

      <SectionDrawer
        opened={tiroirSection !== null}
        onClose={() => setTiroirSection(null)}
        section={tiroirSection?.section ?? null}
        onSave={async (largeur) => {
          const visee = tiroirSection;
          if (!visee) return;
          if (visee.section) await api.sections.update(visee.section.id, largeur);
          else {
            await api.sections.create({
              ...largeur,
              ...(visee.rang !== null ? { index: visee.rang } : {}),
            });
          }
          setTiroirSection(null);
          await onChanged();
        }}
        onDelete={async () => {
          const section = tiroirSection?.section;
          if (section) await api.sections.remove(section.id);
          setTiroirSection(null);
          await onChanged();
        }}
      />
    </>
  );
}

interface IndicateursDeSectionProps<Type extends string, P extends IndicatorWidgetBase<Type>> {
  section: IndicatorSection;
  indicateurs: Indicateur<Type>[];
  drag: WidgetDrag;
  locked: boolean;
  widgetOf: (type: Type) => P | undefined;
  render: (widget: P, config: unknown, rendu: RenduWidget) => ReactNode;
  onChange: (indicateur: Indicateur<Type>, config: Record<string, unknown>) => Promise<void>;
  onOpen: (indicateur: Indicateur<Type>) => void;
  onRename: (indicateur: Indicateur<Type>, nom: string) => Promise<void>;
  onContextMenu: (indicateur: Indicateur<Type>, position: PointMenuPosition) => void;
}

/** Les indicateurs d'une section, en cartes, et le glisser qui les range. */
function IndicateursDeSection<Type extends string, P extends IndicatorWidgetBase<Type>>({
  section,
  indicateurs,
  drag,
  locked,
  widgetOf,
  render,
  onChange,
  onOpen,
  onRename,
  onContextMenu,
}: IndicateursDeSectionProps<Type, P>) {
  const { cible, propsDe } = useWidgetDrop(section.id, drag, locked);
  // Là où le dernier appui a eu lieu. Un widget qui glisse lui-même ce qu'il
  // porte — les listes et les cartes du mode Tâche — le marque
  // « data-no-widget-drag » : le glisser natif du widget n'y part pas.
  const appui = useRef<Element | null>(null);

  if (indicateurs.length === 0) return null;
  return (
    <Stack gap={ECART}>
      {indicateurs.map((indicateur, index) => {
        const widget = widgetOf(indicateur.type);
        // Un type inconnu — rangé par une version plus récente — ne se
        // montre pas : il n'y a personne pour le calculer.
        if (!widget) return null;
        // Verrouillé, un widget qui se modifie sur place ne reçoit rien à
        // enregistrer : son double-clic n'a plus d'effet.
        const rendu: RenduWidget = {
          onChange: locked ? () => {} : (config) => onChange(indicateur, config),
          locked,
        };
        const glisser = propsDe(indicateur.id, index);
        return (
          <Box
            key={indicateur.id}
            {...glisser}
            onPointerDownCapture={(e) => {
              appui.current = e.target as Element;
            }}
            onDragStart={(e) => {
              if (appui.current?.closest("[data-no-widget-drag]")) {
                e.preventDefault();
                return;
              }
              glisser.onDragStart(e);
            }}
            style={{
              position: "relative",
              opacity: drag.dragged === indicateur.id ? 0.4 : 1,
              cursor: locked || widget.ownClicks ? "default" : "grab",
            }}
          >
            {cible?.id === indicateur.id && <TraitInsertion avant={cible.avant} ecart={ECART} />}
            {widget.ownClicks ? (
              // Un widget qui garde ses clics — une liste, un titre — se pose
              // tel quel, sans l'encart des indicateurs.
              <Box onContextMenu={(e) => onContextMenu(indicateur, positionDuMenu(e))}>
                {render(widget, indicateur.config, rendu)}
              </Box>
            ) : (
              <CarteIndicateurContext.Provider
                value={{
                  ouvrir: () => onOpen(indicateur),
                  renommer: (nom) => onRename(indicateur, nom),
                }}
              >
                {/* Une div et non un bouton : le titre s'y change sur place,
                    et une saisie n'a rien à faire dans un bouton. Le fond et
                    le trait sont ceux de l'encart de l'horloge et des
                    numéros du mode Accès. */}
                <UnstyledButton
                  component="div"
                  role="button"
                  tabIndex={0}
                  w="100%"
                  className={encart.encart}
                  onClick={() => onOpen(indicateur)}
                  onContextMenu={(e) => onContextMenu(indicateur, positionDuMenu(e))}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: HAUTEUR,
                    padding: "var(--mantine-spacing-md)",
                  }}
                >
                  {render(widget, indicateur.config, rendu)}
                </UnstyledButton>
              </CarteIndicateurContext.Provider>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
