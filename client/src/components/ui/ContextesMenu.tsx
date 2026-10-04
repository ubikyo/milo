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
import classes from "../../assets/styles/ContextesMenu.module.css";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { AUCUN_CONTEXTE } from "@milo/shared";
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
const PASTILLE = "light-dark(#ededed, var(--mantine-color-dark-4))";

/** Les bornes de la largeur de la liste. */
const LARGEUR_MIN = 240;
const LARGEUR_MAX = 320;

/** La valeur de « Tous les contextes ». */
export const TOUS = "all";

/** Le temps qu'attend un clic avant de choisir : un double clic le devance. */
const DOUBLE_CLIC = 250;

/** Le nom d'un contexte qu'on vient d'ajouter, aussitôt en saisie. */
const NOUVEAU_CONTEXTE = "Nouveau contexte";

export interface GestionDesContextes {
  onAdd: (name: string) => Promise<void>;
  onRename: (id: Id, name: string) => Promise<void>;
  /** Renommer « Tous les contextes ». */
  onRenameAll: (name: string) => Promise<void>;
  onDelete: (id: Id) => Promise<void>;
  onReorder: (ids: Id[]) => Promise<void>;
}

export interface ContextesMenuProps {
  items: Context[];
  /** Le libellé de « Tous les contextes », tel que le tableau le porte. */
  tous: string;
  /** Le contexte regardé, ou « all ». */
  value: string;
  onChange: (value: string) => void;
  /** Sans elle — sans le droit d'organiser les tableaux —, la liste ne fait que choisir. */
  gestion?: GestionDesContextes;
  visibleFrom?: string;
  /**
   * Posée dans l'onglet du tableau, à droite de son nom : l'onglet est déjà
   * un bouton, la cible n'en est pas un autre, et la liste part de sa gauche.
   */
  dansOnglet?: boolean;
}

/** Ce qu'on renomme : un contexte, ou « Tous les contextes ». */
type Renomme = { id: Id | typeof TOUS; name: string };

export default function ContextesMenu({
  items: recus,
  tous: tousRecu,
  value,
  onChange,
  gestion,
  visibleFrom,
  dansOnglet = false,
}: ContextesMenuProps) {
  const [ouvert, setOuvert] = useState(false);
  // Dans l'onglet, la liste tombe sur le filet de la rangée et part du bord
  // gauche de l'onglet. La cible n'a que la hauteur de son texte, à droite du
  // nom : les deux écarts se mesurent à l'ouverture, de la cible à l'onglet.
  const [ecartOnglet, setEcartOnglet] = useState({
    mainAxis: ROW_MENU_OFFSET,
    crossAxis: 0,
  });
  // La largeur de l'onglet, mesurée avec : la liste la prend, et ne
  // s'élargit que si son contenu le demande.
  const [largeurOnglet, setLargeurOnglet] = useState(0);
  /** La cible, relevée à l'ouverture : la mesure la suit tant que la liste est ouverte. */
  const cibleRef = useRef<HTMLElement | null>(null);
  const mesurer = (cible: HTMLElement) => {
    const onglet = cible.closest('[role="tab"]')?.getBoundingClientRect();
    const bouton = cible.getBoundingClientRect();
    if (!onglet) return;
    // Moins un pixel : le trait du haut de la liste se pose sur la ligne du
    // filet, au lieu de tomber dessous.
    setEcartOnglet({
      mainAxis: onglet.bottom - bouton.bottom - 1,
      crossAxis: onglet.left - bouton.left,
    });
    setLargeurOnglet(onglet.width);
  };
  const basculer = (cible: HTMLElement) => {
    if (dansOnglet && !ouvert) {
      cibleRef.current = cible;
      mesurer(cible);
    }
    setOuvert((o) => !o);
  };
  // Liste ouverte, l'onglet peut changer de taille — « Tous les … » renommé,
  // le libellé de la cible qui change : la liste suit.
  useEffect(() => {
    const cible = cibleRef.current;
    const onglet = cible?.closest('[role="tab"]');
    if (!dansOnglet || !ouvert || !cible || !onglet) return;
    const suivi = new ResizeObserver(() => mesurer(cible));
    suivi.observe(onglet);
    // À l'essai : l'onglet prend le fond et la bordure de la liste ouverte
    // (ContextesMenu.module.css, data-contextes-ouvert).
    // La rangée aussi : son filet s'éclaircit avec.
    const rangee = onglet.closest('[role="tablist"]');
    onglet.setAttribute("data-contextes-ouvert", "");
    rangee?.setAttribute("data-contextes-ouvert", "");
    return () => {
      suivi.disconnect();
      onglet.removeAttribute("data-contextes-ouvert");
      rangee?.removeAttribute("data-contextes-ouvert");
    };
  }, [dansOnglet, ouvert]);
  const [renomme, setRenomme] = useState<Renomme | null>(null);
  // Le nom validé, montré le temps que le serveur réponde et que le tableau
  // revienne relu : sans lui, l'ancien nom reparaîtrait un instant.
  const [provisoire, setProvisoire] = useState<Renomme | null>(null);
  const items = provisoire
    ? recus.map((c) => (c.id === provisoire.id ? { ...c, name: provisoire.name } : c))
    : recus;
  const tous = provisoire?.id === TOUS ? provisoire.name : tousRecu;
  const [aSupprimer, setASupprimer] = useState<Context | null>(null);
  /** Le contexte tenu, et le rang où il se poserait. */
  const [glisse, setGlisse] = useState<{ id: Id; cible: number } | null>(null);
  /** Le nouvel ordre, montré sans attendre le serveur ; effacé dès qu'il répond. */
  const [ordreLocal, setOrdreLocal] = useState<Id[] | null>(null);
  /** Vrai entre l'ajout et l'arrivée du contexte ajouté : il passe alors en saisie. */
  const [ajoutEnCours, setAjoutEnCours] = useState<number | null>(null);
  const clic = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const conclu = useRef(false);

  useEffect(() => setOrdreLocal(null), [recus]);
  useEffect(() => () => clearTimeout(clic.current), []);

  // Le contexte qu'on vient d'ajouter passe en saisie de son nom dès qu'il
  // paraît, au bout de la liste.
  useEffect(() => {
    if (ajoutEnCours === null || items.length <= ajoutEnCours) return;
    const dernier = items[items.length - 1];
    setAjoutEnCours(null);
    if (dernier) ouvrirRenommage({ id: dernier.id, name: dernier.name });
  }, [items, ajoutEnCours]);

  const ordonnes = ordreLocal
    ? ordreLocal
        .map((id) => items.find((c) => c.id === id))
        .filter((c): c is Context => c !== undefined)
    : items;

  // Sans contexte, la liste le dit plutôt que d'offrir « Tous » de rien.
  const courant =
    items.length === 0
      ? AUCUN_CONTEXTE
      : value === TOUS
        ? tous
        : (items.find((c) => String(c.id) === value)?.name ?? tous);

  const choisir = (valeur: string) => {
    clearTimeout(clic.current);
    if (valeur !== value) onChange(valeur);
    if (!gestion) return setOuvert(false);
    clic.current = setTimeout(() => setOuvert(false), DOUBLE_CLIC);
  };

  function ouvrirRenommage(cible: Renomme) {
    if (!gestion) return;
    clearTimeout(clic.current);
    conclu.current = false;
    setRenomme(cible);
  }

  const conclureRenommage = async (valider: boolean) => {
    if (!renomme || conclu.current || !gestion) return;
    conclu.current = true;
    const { id, name } = renomme;
    setRenomme(null);
    const nom = name.trim();
    if (!valider || !nom) return;
    if (id === TOUS ? nom === tous : nom === items.find((c) => c.id === id)?.name) return;
    setProvisoire({ id, name: nom });
    try {
      if (id === TOUS) await gestion.onRenameAll(nom);
      else await gestion.onRename(id, nom);
    } finally {
      setProvisoire(null);
    }
  };

  const ajouter = async () => {
    if (!gestion) return;
    setAjoutEnCours(items.length);
    await gestion.onAdd(NOUVEAU_CONTEXTE);
  };

  // --- Le glisser-déposer : la ligne visée se lit à la hauteur du pointeur.
  const rangVise = (e: DragEvent<HTMLElement>, index: number): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? index : index + 1;
  };

  const deposer = async () => {
    if (!glisse || !gestion) return;
    const depart = ordonnes.findIndex((c) => c.id === glisse.id);
    setGlisse(null);
    const cible = glisse.cible > depart ? glisse.cible - 1 : glisse.cible;
    if (depart < 0 || cible === depart) return;
    const ordre = ordonnes.map((c) => c.id).filter((id) => id !== glisse.id);
    ordre.splice(cible, 0, glisse.id);
    setOrdreLocal(ordre);
    try {
      await gestion.onReorder(ordre);
    } catch {
      setOrdreLocal(null);
    }
  };

  /** Une ligne : son nom — ou sa saisie —, et ce qui la complète. */
  const ligne = (
    cle: string,
    nom: string,
    cible: Renomme,
    extras: { poignee?: boolean; corbeille?: () => void; style?: CSSProperties } = {},
  ) => {
    const choisie = value === cle;
    const enSaisie = renomme?.id === cible.id;
    return (
      <Group
        gap={4}
        wrap="nowrap"
        className={classes.ligne}
        data-saisie={enSaisie || undefined}
        onClick={() => !enSaisie && choisir(cle)}
        onDoubleClick={() => ouvrirRenommage(cible)}
        style={{
          padding: gestion ? "4px 8px 4px 4px" : "4px 8px",
          minHeight: 32,
          ...extras.style,
        }}
      >
        {/* La poignée tient sa place sur chaque ligne, « Tous » compris : les
            noms restent alignés. Sans gestion — verrouillé, ou sans le droit
            —, rien ne se glisse : les noms reprennent sa place. */}
        {gestion && (
          <div
            className={extras.poignee ? classes.revele : undefined}
            style={{
              width: 16,
              flexShrink: 0,
              display: "flex",
              color: "var(--mantine-color-dimmed)",
              cursor: extras.poignee ? "grab" : undefined,
            }}
          >
            {extras.poignee && <IconGripVertical size={14} />}
          </div>
        )}
        {enSaisie ? (
          <input
            value={renomme.name}
            onChange={(e) => {
              const name = e.currentTarget.value;
              setRenomme((r) => (r ? { ...r, name } : r));
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                void conclureRenommage(true);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                void conclureRenommage(false);
              }
            }}
            onBlur={() => void conclureRenommage(true)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
            aria-label={`Renommer ${nom}`}
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
          <Text size="sm" fw={choisie ? 600 : undefined} style={{ flex: 1, minWidth: 0 }} truncate>
            {nom}
          </Text>
        )}
        {extras.corbeille && (
          // La corbeille ne paraît qu'au survol, mais tient sa place : la ligne
          // ne bouge pas quand la souris la traverse.
          <ActionIcon
            variant="subtle"
            color={RED}
            size="sm"
            className={classes.revele}
            style={{ flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              clearTimeout(clic.current);
              extras.corbeille?.();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={`Supprimer ${nom}`}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Group>
    );
  };

  /** Le trait qui dit où le contexte tenu se posera. */
  const trait = (
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
        opened={ouvert}
        onChange={setOuvert}
        position={dansOnglet ? "bottom-start" : "bottom-end"}
        withinPortal
        shadow="md"
        offset={dansOnglet ? ecartOnglet : ROW_MENU_OFFSET}
        // Hors de l'onglet, la liste se raccorde au filet : ni bordure haute
        // ni angles hauts. Dans l'onglet, elle garde sa bordure haute — le
        // trait qui la sépare de l'onglet (classes.listeOnglet) —, sans
        // angles hauts.
        styles={
          dansOnglet
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
        closeOnClickOutside={aSupprimer === null}
      >
        <Popover.Target>
          {/* Le même bouton que le menu « Actions » de la rangée. */}
          <Button
            component={dansOnglet ? "span" : "button"}
            role={dansOnglet ? "button" : undefined}
            // Dans l'onglet, plus léger que le nom du tableau ; ni fond ni
            // retrait — le survol change la couleur du texte (cibleOnglet).
            fw={dansOnglet ? 300 : undefined}
            // Le chevron serré contre le libellé.
            styles={dansOnglet ? { section: { marginInlineStart: 2 } } : undefined}
            variant={dansOnglet ? "transparent" : "subtle"}
            color="gray"
            size="xs"
            px={dansOnglet ? 0 : undefined}
            // À la hauteur du texte : les 30 px du bouton agrandiraient
            // l'onglet dès que la liste paraît — en modification, par exemple.
            h={dansOnglet ? "auto" : undefined}
            className={dansOnglet ? classes.cibleOnglet : undefined}
            rightSection={<IconChevronDown size={14} />}
            aria-label="Contexte"
            visibleFrom={visibleFrom}
            onClick={(e: MouseEvent<HTMLElement>) => basculer(e.currentTarget)}
            style={
              dansOnglet ? undefined : ({ "--button-hover": NEUTRAL_HOVER } as CSSProperties)
            }
          >
            {courant}
          </Button>
        </Popover.Target>
        <Popover.Dropdown
          p={4}
          className={dansOnglet ? classes.listeOnglet : undefined}
          // Dans l'onglet, au moins sa largeur : la liste ne s'élargit que si
          // son contenu le demande — sans contexte, il tient toujours. Ailleurs,
          // ses propres bornes.
          {...(dansOnglet && largeurOnglet > 0
            ? { miw: largeurOnglet, maw: Math.max(LARGEUR_MAX, largeurOnglet) }
            : { miw: LARGEUR_MIN, maw: LARGEUR_MAX })}
        >
          {/* Sans contexte, il ne reste que l'ajout. */}
          {items.length > 0 && (
            <>
              {ligne(TOUS, tous, { id: TOUS, name: tous })}
              <Divider my={4} />
            </>
          )}
          <div
            onDragOver={(e) => {
              if (glisse) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              void deposer();
            }}
          >
            {ordonnes.map((contexte, index) => (
              <div
                key={contexte.id}
                draggable={Boolean(gestion) && renomme?.id !== contexte.id}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(contexte.id));
                  setGlisse({ id: contexte.id, cible: index });
                }}
                onDragOver={(e) => {
                  if (!glisse) return;
                  e.preventDefault();
                  const cible = rangVise(e, index);
                  if (cible !== glisse.cible) setGlisse({ ...glisse, cible });
                }}
                onDragEnd={() => setGlisse(null)}
              >
                {glisse?.cible === index && trait}
                {ligne(
                  String(contexte.id),
                  contexte.name,
                  { id: contexte.id, name: contexte.name },
                  {
                    poignee: Boolean(gestion),
                    corbeille: gestion ? () => setASupprimer(contexte) : undefined,
                    style: glisse?.id === contexte.id ? { opacity: 0.4 } : undefined,
                  },
                )}
                {index === ordonnes.length - 1 && glisse?.cible === ordonnes.length && trait}
              </div>
            ))}
          </div>
          {/* Sans contexte : un espace, l'icône des contextes au milieu, au-
              dessus de l'ajout. */}
          {gestion && items.length === 0 && (
            <Center py="md">
              <Center
                w={40}
                h={40}
                style={{ borderRadius: "50%", background: PASTILLE }}
              >
                <IconCategory size={20} color="var(--mantine-color-dimmed)" />
              </Center>
            </Center>
          )}
          {gestion && (
            <>
              {items.length > 0 && <Divider my={4} />}
              <Anchor
                component="button"
                type="button"
                size="sm"
                c={ADD_ACTION.color}
                onClick={() => void ajouter()}
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
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={() => {
          const contexte = aSupprimer;
          setASupprimer(null);
          if (contexte) void gestion?.onDelete(contexte.id);
        }}
        title="Supprimer le contexte"
        message={
          <>
            Voulez-vous vraiment supprimer « {aSupprimer?.name} » ? Ses projets, ses tâches, ses
            tickets et ses assets seront supprimés. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
