import { Box, Menu, Stack, UnstyledButton } from "@mantine/core";
import { IconCopy, IconCopyPlus, IconPencil, IconTrash } from "@tabler/icons-react";
import { useRef, useState, type ComponentType, type ReactNode } from "react";
import encart from "../../assets/styles/AccessNumero.module.css";
import { avec } from "../../widgets/types";
import { useAccesWidget } from "../../lib/droits";
import { RED } from "../../themes/colors";
import { copierWidget, useWidgetCopie } from "../../lib/presse-papiers";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { notifications } from "@mantine/notifications";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { ELEMENTS_DE_LA_LISTE } from "../../lib/listes";
import IndicatorDrawer from "./IndicatorDrawer";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./PointMenu";
import SectionsBoard from "./SectionsBoard";
import { CarteIndicateurContext, NOM } from "./TitreIndicateur";
import { TraitInsertion, useWidgetDrop, type WidgetDrag } from "./WidgetDrop";
import type { SectionsDuPanneau } from "../../api";
import type { IndicatorConfigProps } from "../../indicators/types";
import { isListWidgetType } from "@milo/shared";
import type { Id, IndicatorSection } from "@milo/shared";
import type { WidgetKind } from "../../widgets/genres";

/** L'écart entre deux indicateurs d'une section. */
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

/** Le nom d'un widget : celui qu'on lui a donné, sinon celui de son type. */
const titreDe = (indicateur: { config: Record<string, unknown> }, defaut: string): string => {
  const nom = indicateur.config[NOM];
  return (typeof nom === "string" && nom.trim()) || defaut;
};

/** Ce que tout widget d'un panneau porte ; son affichage, lui, dépend du panneau. */
export interface IndicatorWidgetBase<Type extends string> {
  /** Ce que la base range : il ne change jamais. */
  type: Type;
  /** Son type : le groupe où le tiroir des widgets le range (widgets/genres.ts). */
  kind: WidgetKind;
  /** Son nom dans le tiroir des widgets, et en titre de son tiroir. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** La configuration d'un indicateur neuf. */
  defaultConfig: Record<string, unknown>;
  /**
   * Les champs de son tiroir. Le tiroir lui-même est commun à tous. Sans
   * champs, le widget n'a que son nom à régler : choisi, il s'ajoute
   * aussitôt, sous le nom de son type, et n'a pas de tiroir : son nom se
   * change au double-clic sur son titre.
   */
  Config?: ComponentType<IndicatorConfigProps>;
  /**
   * Vrai quand le widget prend ses clics en charge — une liste, dont chaque
   * ligne ouvre ce qu'elle montre. Il se pose alors sans cadre de carte, et
   * son tiroir ne s'ouvre que par le clic droit, hors de ses lignes.
   */
  ownClicks?: boolean;
  /**
   * Vrai quand le widget occupe toute la hauteur que sa section lui laisse —
   * les listes de projets, de tâches, de demandes, de postes —, s'il est le
   * dernier de sa section ; suivi d'un autre, il s'en tient à son contenu.
   */
  fill?: boolean;
  /**
   * Vrai quand le widget se nomme à même la section — une catégorie, une
   * sous-catégorie : choisi, il s'ajoute aussitôt, sans tiroir, et attend
   * qu'on le renseigne au double-clic.
   */
  inlineEdit?: boolean;
  /**
   * L'air qu'il laisse au-dessus et au-dessous de lui, selon le type de ses
   * voisins — les widgets du mode Accès (widgets/en-section.tsx), serrés entre
   * eux comme dans une colonne d'accès. Entre deux widgets qui le disent,
   * c'est leur air qui les sépare ; sinon, l'écart des indicateurs.
   */
  marges?: (
    config: unknown,
    previousType: string | null,
    nextType: string | null,
  ) => { haute: number; basse: number };
  /** Vrai quand il ne doit pas paraître — un lien éteint, une fois verrouillé. */
  hidden?: (config: unknown, locked: boolean) => boolean;
  /** La largeur de son tiroir, quand ses champs ne tiennent pas dans celle de tous. */
  drawerSize?: number;
}

/** Ce que le panneau passe au rendu d'un widget, en plus de sa configuration. */
export interface RenduWidget {
  /** L'identifiant du widget : ceux que le serveur relève (RSS) se lisent par lui. */
  id: Id;
  /** Enregistre une configuration modifiée sur place ; sans effet verrouillé. */
  onChange: (config: Record<string, unknown>) => void | Promise<void>;
  locked: boolean;
}

/** Les écritures d'un panneau, vers ses routes. */
export interface IndicatorsApi<Type extends string> {
  /** Rend l'indicateur créé : il se pose au bout de sa section. */
  create: (data: {
    section_id: Id;
    type: Type;
    config: Record<string, unknown>;
  }) => Promise<{ id: Id }>;
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
  /** Les widgets du panneau, dans l'ordre du tiroir des widgets. */
  widgets: P[];
  widgetOf: (type: Type) => P | undefined;
  /** Ce que le widget montre : c'est le panneau qui sait quoi lui passer. */
  render: (widget: P, config: unknown, rendu: RenduWidget) => ReactNode;
  api: IndicatorsApi<Type>;
  onChanged: () => void | Promise<void>;
  locked: boolean;
  /** Déverrouiller l'écran : voir SectionsBoard. */
  onUnlock?: () => void | Promise<void>;
  /** Dupliquer un widget : la copie se pose sous l'original. Sans lui, le menu ne le propose pas. */
  onDuplicate?: (indicateur: Indicateur<Type>) => Promise<unknown>;
  /**
   * Ce en quoi un type se convertit — la catégorie en sous-catégorie —, et
   * de quoi le faire. Sans lui, le menu ne propose pas de conversion.
   */
  conversion?: {
    vers: Partial<Record<string, Type>>;
    convertir: (indicateur: Indicateur<Type>, type: Type) => Promise<unknown>;
  };
  /**
   * Des gestes de plus au clic droit d'un widget, qui ne le remanient pas :
   * créer une tâche depuis un lien. Ils restent proposés quand le widget est
   * figé. Rien à proposer : « null ».
   */
  menuEnPlus?: (indicateur: Indicateur<Type>, fermer: () => void) => ReactNode;
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
  onUnlock,
  onDuplicate,
  conversion,
  menuEnPlus,
}: IndicatorsPanelProps<Type, P>) {
  const acces = useAccesWidget();
  // Le widget copié, qu'on colle au bout d'une section : seulement un type
  // que ce panneau connaît et que le compte peut poser.
  const copie = useWidgetCopie();
  const aColler = copie ? widgetOf(copie.type as Type) : undefined;
  const collable = copie && aColler && acces(aColler.kind) === "update" ? copie : null;
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const [modifie, setModifie] = useState<Indicateur<Type> | null>(null);
  /** Le widget posé depuis le tiroir de gauche, en attente de ses réglages. */
  const [cree, setCree] = useState<{ widget: P; sectionId: Id; index: number } | null>(null);

  const [menu, setMenu] = useState<{
    indicateur: Indicateur<Type>;
    position: PointMenuPosition;
  } | null>(null);
  const [aSupprimer, setASupprimer] = useState<Indicateur<Type> | null>(null);

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

  /**
   * Créer, puis ranger à la place visée : la création pose au bout de la
   * section.
   */
  const creerA = async (
    data: { section_id: Id; type: Type; config: Record<string, unknown> },
    index: number,
  ) => {
    const cree = await api.create(data);
    const ids = indicators.filter((i) => i.section_id === data.section_id).map((i) => i.id);
    if (index < ids.length) {
      await api.reorder(data.section_id, [...ids.slice(0, index), cree.id, ...ids.slice(index)]);
    }
    return cree;
  };

  /**
   * Un widget posé depuis le tiroir de gauche. Sans réglages, ou nommé sur
   * place, il est créé aussitôt ; sinon son tiroir s'ouvre, et il ne naît
   * qu'à l'enregistrement — à la place où il a été posé.
   */
  const poser = async (section: IndicatorSection, type: string, index: number) => {
    const widget = widgets.find((w) => w.type === type);
    if (!widget) return;
    if (!widget.Config || widget.inlineEdit) {
      await ecrire(() =>
        creerA({ section_id: section.id, type: widget.type, config: widget.defaultConfig }, index),
      );
      return;
    }
    setModifie(null);
    setCree({ widget, sectionId: section.id, index });
    setTiroirOuvert(true);
  };

  // Un widget sans champs n'a que son nom, qui se change au double-clic sur
  // son titre : il n'a pas de tiroir.
  const aUnTiroir = (indicateur: Indicateur<Type>) => Boolean(widgetOf(indicateur.type)?.Config);

  const modifier = (indicateur: Indicateur<Type>) => {
    if (!aUnTiroir(indicateur)) return;
    setCree(null);
    setModifie(indicateur);
    setTiroirOuvert(true);
  };

  return (
    <>
      <SectionsBoard
        sections={sections}
        locked={locked}
        onUnlock={onUnlock}
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
            avecMenuFige={(indicateur) => Boolean(menuEnPlus?.(indicateur, () => {}))}
          />
        )}
        widgets={widgets}
        onCreateWidget={poser}
        onReorderWidgets={(sectionId, ids) => ecrire(() => api.reorder(sectionId, ids))}
        onAddSection={(rang) =>
          ecrire(() => api.sections.create(rang !== undefined ? { index: rang } : {}))
        }
        onDuplicateSection={(section) => ecrire(() => api.sections.duplicate(section.id))}
        // Lâché sur la corbeille : la même question que « Supprimer », pour
        // un widget que le compte peut modifier.
        onDeleteWidget={(id) => {
          const indicateur = indicators.find((i) => i.id === id);
          const widget = indicateur ? widgetOf(indicateur.type) : undefined;
          if (indicateur && widget && acces(widget.kind) === "update") setASupprimer(indicateur);
        }}
        coller={
          collable
            ? {
                libelle: collable.label,
                onColler: (section) =>
                  ecrire(() =>
                    api.create({
                      section_id: section.id,
                      type: collable.type as Type,
                      config: collable.config,
                    }),
                  )
                    .then(() => {
                      notifications.show({
                        color: "teal",
                        message: `Widget « ${collable.label} » collé`,
                      });
                    })
                    .catch((e: unknown) => notifierErreur(messageErreur(e))),
              }
            : undefined
        }
        onDeleteSection={(section) => ecrire(() => api.sections.remove(section.id))}
        onReorderSections={(ids) => ecrire(() => api.sections.reorder(ids))}
        onChangeSection={(section, modif) => ecrire(() => api.sections.update(section.id, modif))}
      />

      {menu &&
        (() => {
          const { indicateur } = menu;
          const widget = widgetOf(indicateur.type);
          // Figé — l'écran verrouillé, ou un type que le compte ne fait que
          // lire —, le widget ne propose que les gestes qui ne le remanient pas.
          const fige = locked || !widget || acces(widget.kind) !== "update";
          const fermer = () => setMenu(null);
          const enPlus = menuEnPlus?.(indicateur, fermer) ?? null;
          const versType = conversion?.vers[indicateur.type];
          const converti = versType ? widgetOf(versType) : undefined;
          return (
            <PointMenu position={menu.position} onClose={fermer}>
              {!fige && aUnTiroir(indicateur) && (
                <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => modifier(indicateur)}>
                  Modifier
                </Menu.Item>
              )}
              {/* Un widget de liste possède ses éléments : il ne se duplique pas. */}
              {!fige && onDuplicate && !isListWidgetType(String(indicateur.type)) && (
                <Menu.Item
                  leftSection={<IconCopyPlus size={16} />}
                  onClick={() => {
                    fermer();
                    void ecrire(() => onDuplicate(indicateur));
                  }}
                >
                  Dupliquer
                </Menu.Item>
              )}
              {/* Copier, en modification seulement. Un widget de liste
                  possède ses éléments : il ne se copie pas plus qu'il ne se
                  duplique. */}
              {!locked && widget && !isListWidgetType(String(indicateur.type)) && (
                <Menu.Item
                  leftSection={<IconCopy size={16} />}
                  onClick={() => {
                    fermer();
                    copierWidget({
                      type: String(indicateur.type),
                      config: indicateur.config,
                      label: titreDe(indicateur, widget.label),
                    });
                  }}
                >
                  Copier
                </Menu.Item>
              )}
              {!fige && conversion && versType && converti && (
                <Menu.Item
                  leftSection={<converti.icon size={16} />}
                  onClick={() => {
                    fermer();
                    void ecrire(() => conversion.convertir(indicateur, versType));
                  }}
                >
                  Convertir en {converti.label.toLowerCase()}
                </Menu.Item>
              )}
              {enPlus}
              {!fige && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    color={RED}
                    leftSection={<IconTrash size={16} />}
                    onClick={() => setASupprimer(indicateur)}
                  >
                    Supprimer
                  </Menu.Item>
                </>
              )}
            </PointMenu>
          );
        })()}

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={supprimer}
        title="Supprimer l'indicateur"
        message={
          <>
            Voulez-vous vraiment supprimer cet indicateur ?
            {aSupprimer && ELEMENTS_DE_LA_LISTE[String(aSupprimer.type)] && (
              <> {ELEMENTS_DE_LA_LISTE[String(aSupprimer.type)]} seront supprimés avec lui.</>
            )}{" "}
            Cette action est irréversible.
          </>
        }
      />

      <IndicatorDrawer
        opened={tiroirOuvert}
        onClose={() => setTiroirOuvert(false)}
        indicator={modifie}
        creating={cree?.widget ?? null}
        sectionId={cree?.sectionId ?? null}
        widgetOf={widgetOf}
        // La création passe par la place visée.
        api={{ ...api, create: (data) => creerA(data, cree?.index ?? Number.MAX_SAFE_INTEGER) }}
        onSaved={async () => {
          setTiroirOuvert(false);
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
  /** Vrai quand un widget figé a tout de même des gestes à proposer. */
  avecMenuFige: (indicateur: Indicateur<Type>) => boolean;
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
  avecMenuFige,
}: IndicateursDeSectionProps<Type, P>) {
  const { cible, propsDe } = useWidgetDrop(section.id, drag, locked);
  // La permission du compte sur le type de chaque widget.
  const acces = useAccesWidget();
  // Là où le dernier appui a eu lieu. Un widget qui glisse lui-même ce qu'il
  // porte — les listes et les cartes du mode Tâche — le marque
  // « data-no-widget-drag » : le glisser natif du widget n'y part pas.
  const appui = useRef<Element | null>(null);

  // Un widget caché, d'un type inconnu — rangé par une version plus
  // récente — ou d'un type que le compte ne lit pas ne paraît pas, et ne
  // précède ni ne suit personne.
  const visibles = indicateurs.flatMap((indicateur) => {
    const widget = widgetOf(indicateur.type);
    return widget && acces(widget.kind) !== "" && !widget.hidden?.(indicateur.config, locked)
      ? [{ indicateur, widget }]
      : [];
  });

  /** L'écart entre deux widgets visibles qui se suivent. */
  const ecartEntre = (rang: number): number => {
    const avant = visibles[rang - 1];
    const apres = visibles[rang];
    if (!avant?.widget.marges || !apres?.widget.marges) return ECART;
    const typeDe = (r: number) => visibles[r]?.indicateur.type ?? null;
    return (
      avant.widget.marges(avant.indicateur.config, typeDe(rang - 2), apres.indicateur.type).basse +
      apres.widget.marges(apres.indicateur.config, avant.indicateur.type, typeDe(rang + 1)).haute
    );
  };

  if (visibles.length === 0) return null;
  // Un widget qui veut toute la hauteur l'obtient de proche en proche : la
  // pile s'étire dans la colonne, et lui dans la pile. Seulement en bas de sa
  // section : suivi d'un autre widget, il s'en tient à son contenu, sans
  // laisser de vide entre eux.
  const remplit = (rang: number) =>
    rang === visibles.length - 1 && Boolean(visibles[rang]?.widget.fill);
  const etire = remplit(visibles.length - 1);
  return (
    <Stack gap={0} style={etire ? { flex: 1, minHeight: 0 } : undefined}>
      {visibles.map(({ indicateur, widget }, rang) => {
        // Le rang parmi tous : c'est lui que le dépôt range.
        const index = indicateurs.indexOf(indicateur);
        const ecartAvant = rang === 0 ? 0 : ecartEntre(rang);
        // Figé — l'écran verrouillé, ou un type que le compte ne fait que
        // lire —, un widget ne se glisse, ne s'ouvre ni ne se modifie : un
        // widget qui se modifie sur place ne reçoit rien à enregistrer.
        const fige = locked || acces(widget.kind) !== "update";
        const rendu: RenduWidget = {
          id: indicateur.id,
          onChange: fige ? () => {} : (config) => onChange(indicateur, config),
          locked: fige,
        };
        const glisser = { ...propsDe(indicateur.id, index), ...(fige ? { draggable: false } : {}) };
        // Le menu du clic droit — modifier, supprimer — n'est qu'aux widgets
        // qu'on peut modifier, ou qui ont d'autres gestes à proposer.
        const menuDe = (e: React.MouseEvent<HTMLElement>) => {
          if (fige && !avecMenuFige(indicateur)) return;
          onContextMenu(indicateur, positionDuMenu(e));
        };
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
              marginTop: ecartAvant,
              opacity: drag.dragged === indicateur.id ? 0.4 : 1,
              cursor: fige || widget.ownClicks ? "default" : "grab",
              ...(remplit(rang)
                ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                : {}),
            }}
          >
            {cible?.id === indicateur.id && (
              <TraitInsertion
                avant={cible.avant}
                ecart={cible.avant ? ecartAvant : ecartEntre(rang + 1)}
              />
            )}
            {widget.ownClicks ? (
              // Un widget qui garde ses clics — une liste, un titre — se pose
              // tel quel, sans l'encart des indicateurs.
              <Box
                onContextMenu={menuDe}
                style={
                  remplit(rang)
                    ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                    : undefined
                }
              >
                {render(widget, indicateur.config, rendu)}
              </Box>
            ) : (
              <CarteIndicateurContext.Provider
                value={{
                  ouvrir: () => !fige && onOpen(indicateur),
                  renommer: (nom) => (fige ? Promise.resolve() : onRename(indicateur, nom)),
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
                  onClick={() => !fige && onOpen(indicateur)}
                  onContextMenu={menuDe}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: HAUTEUR,
                    padding: "var(--mantine-spacing-md)",
                    border: "none",
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
