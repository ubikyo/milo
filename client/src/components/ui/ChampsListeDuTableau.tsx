import { Group, Input, Menu, NumberInput, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFlag, IconTrash } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { api } from "../../api";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { RED } from "../../themes/colors";
import MilestonesModal from "../project/MilestonesModal";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Id, Milestone, MilestoneType } from "@milo/shared";
import { CopierCollerContext } from "./ActionsCopierColler";
import AddButton from "./AddButton";
import { EnregistrementsDuTiroirContext } from "./IndicatorDrawer";
import LabelColorPicker from "./LabelColorPicker";
import {
  ARRONDI,
  Poignee,
  RETRAIT_LIGNE,
  RETRAIT_NOM,
  STYLE_SAISIE,
  deplacer,
  styleLigne,
} from "./LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./PointMenu";

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
export type SorteDeListe = "categories" | "task-labels" | "project-labels" | "milestone-types";

interface Element {
  id: Id;
  name: string;
  color?: string;
  weight?: number;
  milestones?: Milestone[];
}

/** Une ligne du brouillon : « id » absent tant qu'elle n'est pas créée. */
interface Ligne {
  cle: string;
  id?: Id;
  name: string;
  color: string;
  weight: number;
}

interface Sorte {
  titre: string;
  ajouter: string;
  /** Ce que la liste partage, dit sous elle. */
  portee: string;
  /** « la catégorie », pour les messages. */
  une: string;
  avecCouleur: boolean;
  avecPoids: boolean;
  /** Faux quand le serveur range la liste lui-même : pas de poignée. */
  ordonnable: boolean;
  lire: (boardId: Id) => Promise<Element[]>;
  creer: (boardId: Id, ligne: Ligne) => Promise<{ id: Id }>;
  modifier: (id: Id, ligne: Ligne) => Promise<unknown>;
  supprimer: (id: Id) => Promise<unknown>;
  ranger: (boardId: Id, ids: Id[]) => Promise<unknown>;
}

const AUCUN_RANGEMENT = async () => undefined;

const SORTES: Record<SorteDeListe, Sorte> = {
  categories: {
    titre: "Catégories",
    ajouter: "Ajouter une catégorie",
    portee: "Les catégories configurées ci-dessous sont communes à l'ensemble des widgets, de type projet, du tableau actuel et uniquement pour ce tableau.",
    une: "la catégorie",
    avecCouleur: false,
    avecPoids: false,
    ordonnable: true,
    lire: (boardId) => api.getCategories(String(boardId)),
    creer: (boardId, l) => api.createCategory(boardId, l.name),
    modifier: (id, l) => api.updateCategory(id, { name: l.name }),
    supprimer: (id) => api.deleteCategory(id),
    ranger: (boardId, ids) => api.reorderCategories(boardId, ids),
  },
  "task-labels": {
    titre: "Étiquettes",
    ajouter: "Ajouter une étiquette",
    portee: "Les étiquettes configurées ci-dessous sont communes à l'ensemble des widgets, de type tâche, du tableau actuel et uniquement pour ce tableau.",
    une: "l'étiquette",
    avecCouleur: true,
    avecPoids: false,
    ordonnable: true,
    lire: (boardId) => api.getLabels(boardId),
    creer: (boardId, l) => api.createLabel(boardId, l.name, l.color),
    modifier: (id, l) => api.updateLabel(id, { name: l.name, color: l.color }),
    supprimer: (id) => api.deleteLabel(id),
    ranger: (boardId, ids) => api.reorderLabels(boardId, ids),
  },
  "project-labels": {
    titre: "Étiquettes",
    ajouter: "Ajouter une étiquette",
    portee: "Les étiquettes configurées ci-dessous sont communes à l'ensemble des widgets, de type projet, du tableau actuel et uniquement pour ce tableau.",
    une: "l'étiquette",
    avecCouleur: true,
    avecPoids: true,
    ordonnable: true,
    lire: (boardId) => api.getProjectLabels(boardId),
    creer: (boardId, l) => api.createProjectLabel(boardId, l.name, l.color, l.weight),
    modifier: (id, l) =>
      api.updateProjectLabel(id, { name: l.name, color: l.color, weight: l.weight }),
    supprimer: (id) => api.deleteProjectLabel(id),
    ranger: (boardId, ids) => api.reorderProjectLabels(boardId, ids),
  },
  "milestone-types": {
    titre: "Jalons",
    ajouter: "Ajouter un type de jalons",
    portee: "Les types de jalons configurés ci-dessous sont communs à l'ensemble des tableaux de projets. Le clic droit sur un type règle ses jalons.",
    une: "le type de jalons",
    avecCouleur: false,
    avecPoids: false,
    ordonnable: false,
    lire: () => api.getMilestoneTypes(),
    creer: (_boardId, l) => api.createMilestoneType(l.name),
    modifier: (id, l) => api.updateMilestoneType(id, { name: l.name }),
    supprimer: (id) => api.deleteMilestoneType(id),
    ranger: AUCUN_RANGEMENT,
  },
};

let compteur = 0;
const nouvelleCle = () => `nouvelle-${++compteur}`;

const enLigne = (e: Element): Ligne => ({
  cle: String(e.id),
  id: e.id,
  name: e.name,
  color: e.color ?? DEFAULT_LABEL_COLOR,
  weight: e.weight ?? 0,
});

export default function ChampsListeDuTableau({ sorte }: { sorte: SorteDeListe }) {
  const s = SORTES[sorte];
  const tableau = useContext(CopierCollerContext);
  const inscrire = useContext(EnregistrementsDuTiroirContext);
  const boardId = tableau?.board?.id ?? null;
  // Un collage depuis le menu « Actions » change la liste : elle se relit.
  const collages = tableau?.collages ?? 0;

  /** Ce que le serveur porte, et le brouillon qu'on en fait. */
  const [originaux, setOriginaux] = useState<Element[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [tenue, setTenue] = useState<number | null>(null);
  /** La ligne dont un champ a le focus : il prend le fond du tiroir. */
  const [saisie, setSaisie] = useState<string | null>(null);
  /** La ligne qu'on vient d'ajouter : son nom prend le focus. */
  const [aNommer, setANommer] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ rang: number; position: PointMenuPosition } | null>(null);
  /** Le type dont la fenêtre des jalons est ouverte. */
  const [jalonsDe, setJalonsDe] = useState<Id | null>(null);

  const relire = useCallback(async () => {
    if (boardId === null) return;
    try {
      const lus = await s.lire(boardId);
      setOriginaux(lus);
      setLignes(lus.map(enLigne));
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  }, [boardId, s]);

  useEffect(() => {
    void relire();
  }, [relire, collages]);

  // « Sauvegarder » : ce qui est parti, ce qui a changé, ce qui est nouveau,
  // puis l'ordre. Un nom vide arrête tout avant le premier envoi.
  const etat = useRef({ originaux, lignes });
  etat.current = { originaux, lignes };
  useEffect(() => {
    if (!inscrire || boardId === null) return;
    return inscrire(async () => {
      const { originaux: avant, lignes: apres } = etat.current;
      const gardees = apres.filter((l) => l.id !== undefined || l.name.trim());
      if (gardees.some((l) => !l.name.trim())) {
        throw new Error(`${s.titre} : chaque ligne demande un nom.`);
      }
      try {
        for (const o of avant) {
          if (!gardees.some((l) => l.id === o.id)) await s.supprimer(o.id);
        }
        const ids: Id[] = [];
        for (const l of gardees) {
          const ligne = { ...l, name: l.name.trim() };
          if (l.id === undefined) {
            ids.push((await s.creer(boardId, ligne)).id);
            continue;
          }
          const o = avant.find((x) => x.id === l.id);
          const change =
            !o ||
            o.name !== ligne.name ||
            (s.avecCouleur && (o.color ?? DEFAULT_LABEL_COLOR) !== ligne.color) ||
            (s.avecPoids && (o.weight ?? 0) !== ligne.weight);
          if (change) await s.modifier(l.id, ligne);
          ids.push(l.id);
        }
        const ordreAvant = avant.filter((o) => ids.includes(o.id)).map((o) => o.id);
        const memeOrdre =
          ids.length === ordreAvant.length && ids.every((id, i) => id === ordreAvant[i]);
        if (!memeOrdre && s.ordonnable) await s.ranger(boardId, ids);
      } finally {
        // Ce qui est parti l'est : la liste repart du serveur, même après une
        // erreur.
        await relire();
      }
    });
  }, [inscrire, boardId, s, relire]);

  const changer = (rang: number, modif: Partial<Ligne>) =>
    setLignes((avant) => avant.map((l, i) => (i === rang ? { ...l, ...modif } : l)));

  const ajouter = () => {
    const cle = nouvelleCle();
    setLignes((avant) => [...avant, { cle, name: "", color: DEFAULT_LABEL_COLOR, weight: 0 }]);
    setANommer(cle);
  };

  const retirer = (rang: number) => setLignes((avant) => avant.filter((_, i) => i !== rang));

  const survoler = (e: DragEvent<HTMLElement>, rang: number) => {
    if (tenue === null) return;
    e.preventDefault();
    const suivante = deplacer(lignes, tenue, rang);
    if (!suivante) return;
    setTenue(rang);
    setLignes(suivante);
  };

  // Le type ouvert, gardé tant qu'il ne change pas : la fenêtre repart de lui
  // à chaque nouvel objet, et perdrait ce qu'on y saisit.
  const typeOuvert = useMemo<MilestoneType | null>(() => {
    const original = originaux.find((o) => o.id === jalonsDe);
    return original ? { id: original.id, name: original.name, milestones: original.milestones ?? [] } : null;
  }, [originaux, jalonsDe]);

  if (boardId === null) return null;

  return (
    // Ce ne sont pas des réglages du widget : le dire sous le libellé, à
    // 20 px de la liste.
    <Input.Wrapper
      label={s.titre}
      description={s.portee}
      styles={{ description: { paddingBottom: 20 } }}
    >
      {lignes.length > 0 && (
        <Stack gap={1}>
          {lignes.map((ligne, rang) => (
            <Group
              key={ligne.cle}
              gap="sm"
              wrap="nowrap"
              onDragOver={(e) => survoler(e, rang)}
              onDrop={(e) => e.preventDefault()}
              onContextMenu={(e) => setMenu({ rang, position: positionDuMenu(e) })}
              // Sans poignée, le champ se cale à gauche comme il se cale à
              // droite : à RETRAIT_LIGNE du bord de la ligne.
              style={{
                ...styleLigne(rang, lignes.length, tenue === rang),
                ...(s.ordonnable ? null : { paddingLeft: RETRAIT_LIGNE }),
              }}
            >
              {s.ordonnable && (
                <Poignee
                  label={`Déplacer ${ligne.name || s.une}`}
                  onDragStart={() => setTenue(rang)}
                  onDragEnd={() => setTenue(null)}
                />
              )}
              <TextInput
                size="sm"
                radius={ARRONDI}
                // Le nom s'aligne sur la poignée, comme celui d'une colonne.
                style={{ flex: 1, marginLeft: s.ordonnable ? -RETRAIT_NOM : 0 }}
                styles={{
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    paddingLeft: RETRAIT_NOM,
                    // Sans bordure, le texte tombe sous le nom d'une colonne ;
                    // le contour du focus se pose au bord même du champ.
                    borderWidth: 0,
                    ...(saisie === `${ligne.cle}-nom`
                      ? STYLE_SAISIE
                      : { backgroundColor: "transparent" }),
                  },
                }}
                placeholder="Nom"
                value={ligne.name}
                onChange={(e) => changer(rang, { name: e.currentTarget.value })}
                autoFocus={aNommer === ligne.cle}
                onFocus={() => setSaisie(`${ligne.cle}-nom`)}
                onBlur={() => {
                  setSaisie(null);
                  setANommer(null);
                  // Une ligne ajoutée, quittée sans nom, s'efface.
                  if (ligne.id === undefined && !ligne.name.trim()) {
                    setLignes((avant) => avant.filter((l) => l.cle !== ligne.cle));
                  }
                }}
                aria-label={`Nom de ${ligne.name || s.une}`}
              />
              {s.avecCouleur && (
                <LabelColorPicker
                  color={ligne.color}
                  onChange={(color) => changer(rang, { color })}
                  label={ligne.name || s.une}
                />
              )}
              {s.avecPoids && (
                <NumberInput
                  size="xs"
                  radius={ARRONDI}
                  w={100}
                  placeholder="Poids"
                  allowDecimal={false}
                  aria-label={`Poids de ${ligne.name || s.une}`}
                  value={ligne.weight}
                  onChange={(valeur) => changer(rang, { weight: Number(valeur) || 0 })}
                  onFocus={() => setSaisie(`${ligne.cle}-poids`)}
                  onBlur={() => setSaisie(null)}
                  styles={
                    saisie === `${ligne.cle}-poids` ? { input: STYLE_SAISIE } : undefined
                  }
                />
              )}
            </Group>
          ))}
        </Stack>
      )}

      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label={s.ajouter} onClick={ajouter} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          {/* Les jalons d'un type déjà créé : ils s'enregistrent depuis leur
              fenêtre, sans attendre « Sauvegarder ». */}
          {sorte === "milestone-types" && lignes[menu.rang]?.id !== undefined && (
            <Menu.Item
              leftSection={<IconFlag size={16} />}
              onClick={() => setJalonsDe(lignes[menu.rang]!.id!)}
            >
              Jalons
            </Menu.Item>
          )}
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              const ligne = lignes[menu.rang];
              // Une catégorie qui range des projets ne se retire pas : le
              // serveur le refuserait à la sauvegarde.
              const original = originaux.find((o) => o.id === ligne?.id) as
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
              retirer(menu.rang);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      {sorte === "milestone-types" && (
        <MilestonesModal
          type={typeOuvert}
          onClose={() => setJalonsDe(null)}
          onSave={async (milestones) => {
            if (jalonsDe === null) return;
            await api.updateMilestoneType(jalonsDe, { milestones });
            // Le brouillon des noms reste tel quel : seuls les jalons changent.
            setOriginaux((avant) =>
              avant.map((o) => (o.id === jalonsDe ? { ...o, milestones } : o)),
            );
          }}
        />
      )}
    </Input.Wrapper>
  );
}
