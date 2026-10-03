import { ActionIcon, Anchor, Group, NumberInput, TextInput } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../../api";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { ADD_ACTION, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import ChipPicker from "./ChipPicker";
import DeleteConfirmModal from "./DeleteConfirmModal";
import LabelChip from "./LabelChip";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Label, ProjectLabel, SupportLabel } from "@milo/shared";
import type { ReactNode } from "react";

/** Les étiquettes des trois modes ont la même forme ici. */
type Etiquette = Label | ProjectLabel | SupportLabel;

/**
 * Ce qu'il faut savoir faire pour gérer un jeu d'étiquettes. Les routes
 * changent d'un mode à l'autre, les gestes non.
 *
 * `parentId` est ce à quoi les étiquettes pendent : un tableau pour les cartes
 * et les projets, une société pour les demandes de support.
 */
export interface LabelsApi {
  create: (parentId: number, name: string, color: string, weight: number) => Promise<Etiquette>;
  update: (
    id: number,
    data: { name?: string; color?: string; weight?: number },
  ) => Promise<Etiquette>;
  remove: (id: number) => Promise<unknown>;
  /** Ce que la suppression emporte, dit dans les mots du mode. */
  porteurs: string;
  /** Vrai quand les étiquettes portent un poids : celles des projets et du support. */
  avecPoids?: boolean;
}

/** Une étiquette en cours de saisie : son nom et sa couleur, avant validation. */
interface Brouillon {
  id?: number;
  name: string;
  color: string;
  weight: number | "";
}

/** Le poids d'une étiquette ; celles qui n'en portent pas pèsent zéro. */
const poidsDe = (label: Etiquette): number => ("weight" in label ? label.weight : 0);

// Largeur du poids : de quoi écrire trois chiffres.
const LARGEUR_POIDS = 40;
import LabelColorPicker from "./LabelColorPicker";

// Décalage de l'étiquette dans la liste : elle respire de deux pixels après sa
// case à cocher.
const LABEL_INDENT = 2;

// Les étiquettes des cartes et celles des projets se choisissent, se
// renomment, se recolorent et se suppriment de la même façon : seules les
// routes changent. On les nomme ici plutôt que d'appeler « api » directement,
// pour que le même composant serve aux deux modes.
export const CARD_LABELS_API: LabelsApi = {
  create: api.createLabel,
  update: api.updateLabel,
  remove: api.deleteLabel,
  // Ce que la suppression emporte, dit dans les mots du mode.
  porteurs: "des cartes qui la portent",
};

export const PROJECT_LABELS_API: LabelsApi = {
  create: api.createProjectLabel,
  update: api.updateProjectLabel,
  remove: api.deleteProjectLabel,
  porteurs: "des projets qui la portent",
  avecPoids: true,
};

// Celles du support sont communes à toutes les sociétés : elles ne pendent à
// rien, et « boardId » n'a pas cours ici.
export const SUPPORT_LABELS_API: LabelsApi = {
  create: (_boardId, name, color, weight) => api.createSupportLabel(name, color, weight),
  update: api.updateSupportLabel,
  remove: api.deleteSupportLabel,
  porteurs: "des demandes qui la portent",
  avecPoids: true,
};

/**
 * Les étiquettes d'une carte : un clic les coche pour les poser, un double
 * clic ouvre l'une d'elles pour la renommer ou la recolorer, la corbeille au bout de la ligne
 * la supprime, et le lien du bas en ajoute une sans quitter la liste. Renommer,
 * recolorer ou supprimer touche l'étiquette du tableau, donc toutes les cartes
 * qui la portent.
 */
interface LabelPickerProps {
  labels: Etiquette[];
  /** Les identifiants retenus, en chaînes. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Ce à quoi ces étiquettes pendent : un tableau, ou une société en Support. */
  boardId: string | number;
  /** Sans argument : relire. Avec un correctif : l'appliquer sur place. */
  onLabelsChanged: (patch?: { id: number; data: Partial<Etiquette> }) => void | Promise<void>;
  chipHeight?: number;
  /** Le mode auquel ces étiquettes appartiennent : les cartes par défaut. */
  labelsApi?: LabelsApi;
  /** Ce que dit la liste quand il n'y a encore aucune étiquette où choisir. */
  emptyText?: string;
  /** Le titre du champ : « Étiquettes » par défaut. */
  label?: string;
}

export default function LabelPicker({
  labels,
  value,
  onChange,
  boardId,
  onLabelsChanged,
  chipHeight,
  // Le mode auquel ces étiquettes appartiennent : les cartes par défaut.
  labelsApi = CARD_LABELS_API,
  emptyText = "Aucune étiquette sur ce tableau",
  label = "Étiquettes",
}: LabelPickerProps) {
  // Étiquette en cours de modification — son nom et sa couleur y vivent tant
  // qu'on n'a pas validé — et celle qu'on est en train d'ajouter.
  const [edite, setEdite] = useState<Brouillon | null>(null);
  const [ajout, setAjout] = useState<Brouillon | null>(null);
  // Étiquette survolée — sa corbeille seule se montre — et celle dont on
  // attend la confirmation de suppression.
  const [survole, setSurvole] = useState<number | null>(null);
  const [aSupprimer, setASupprimer] = useState<Etiquette | null>(null);

  const ouvrirEdition = (label: Etiquette) => {
    setAjout(null);
    setEdite({ id: label.id, name: label.name, color: label.color, weight: poidsDe(label) });
  };

  const fermerEdition = () => setEdite(null);

  // Choisir une couleur est un geste qui se suffit : elle s'applique aussitôt,
  // partout où l'étiquette se montre. Le nom, lui, attend d'être validé — on
  // ne veut pas le voir changer à chaque lettre tapée.
  const appliquerCouleur = async (label: Etiquette, color: string) => {
    setEdite((e) => (e ? { ...e, color } : e));
    if (color === label.color) return;
    // La couleur se pose d'abord à l'écran, puis part au serveur : sans cela,
    // les cartes attendraient l'aller-retour pour changer de teinte.
    onLabelsChanged({ id: label.id, data: { color } });
    await labelsApi.update(label.id, { color });
    await onLabelsChanged();
  };

  // Le nom ne part au serveur qu'à la validation : ailleurs — la liste, les
  // vignettes de la carte, les cartes du tableau — l'étiquette le garde tant
  // qu'il n'a pas changé pour de bon.
  const enregistrer = async (label: Etiquette) => {
    const courant = edite;
    fermerEdition();
    if (!courant) return;
    const nom = courant.name.trim();
    if (!nom) return;
    // Un poids vidé garde celui enregistré.
    const weight = courant.weight === "" ? poidsDe(label) : courant.weight;
    if (nom === label.name && courant.color === label.color && weight === poidsDe(label)) return;
    await labelsApi.update(label.id, {
      name: nom,
      color: courant.color,
      ...(labelsApi.avecPoids ? { weight } : {}),
    });
    await onLabelsChanged();
  };

  const ouvrirAjout = () => {
    fermerEdition();
    setAjout({ name: "", color: DEFAULT_LABEL_COLOR, weight: 0 });
  };

  // La liste se referme : ce qui était en cours de saisie se conclut, sans
  // quoi le champ disparaîtrait avec elle et la couleur choisie serait perdue
  // — le champ démonté n'a pas d'occasion de rendre la main.
  const conclure = () => {
    if (edite) {
      const label = labels.find((l) => l.id === edite.id);
      if (label) enregistrer(label);
      return;
    }
    if (ajout) creer();
  };

  // L'étiquette créée se pose aussitôt sur la carte : on vient de la demander.
  const creer = async () => {
    const nouveau = (ajout?.name ?? "").trim();
    if (!nouveau || !ajout) {
      setAjout(null);
      return;
    }
    const creee = await labelsApi.create(
      Number(boardId),
      nouveau,
      ajout.color,
      Number(ajout.weight) || 0,
    );
    setAjout(null);
    await onLabelsChanged();
    onChange([...value, String(creee.id)]);
  };

  // Supprimer se demande avant de se faire : l'étiquette quitte le tableau, et
  // donc tout ce qui la porte, pas seulement la fiche ouverte.
  const demanderSuppression = (label: Etiquette) => {
    fermerEdition();
    setAjout(null);
    setASupprimer(label);
  };

  const supprimer = async () => {
    const label = aSupprimer;
    setASupprimer(null);
    if (!label) return;
    try {
      await labelsApi.remove(label.id);
    } catch (e) {
      // Une étiquette encore portée ne se supprime pas : le serveur dit par
      // combien de ressources.
      notifierErreur(messageErreur(e), "Suppression impossible");
      return;
    }
    // La carte ouverte la perd aussitôt : sans cela, l'enregistrement la lui
    // reposerait, alors que le serveur ne la connaît plus.
    onChange(value.filter((v) => v !== String(label.id)));
    await onLabelsChanged();
  };

  // Une ligne de saisie : la pastille de couleur, le nom, puis le poids quand
  // le mode en porte un. Sert à la modification comme à l'ajout.
  interface SaisieProps {
    color: string;
    name: string;
    weight: number | "";
    onColor: (color: string) => void;
    onName: (name: string) => void;
    onWeight: (weight: number | "") => void;
    onSubmit: () => void;
    onCancel: () => void;
    aria: string;
  }

  const saisie = ({
    color,
    name,
    weight,
    onColor,
    onName,
    onWeight,
    onSubmit,
    onCancel,
    aria,
  }: SaisieProps): ReactNode => (
    <Group
      data-label-editor="true"
      gap={6}
      wrap="nowrap"
      style={{ flex: 1, minWidth: 0 }}
      // Les clics de la saisie restent à elle : placer le curseur ou choisir
      // une couleur ne doit pas cocher ni décocher l'étiquette.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <LabelColorPicker
        color={color}
        onChange={onColor}
        label={name || "l'étiquette"}
        withinPortal={false}
      />
      <TextInput
        value={name}
        onChange={(e) => onName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === "Escape") onCancel();
        }}
        // Le focus qui passe à la pastille ou à sa palette reste dans la
        // saisie : sans cela, aller choisir une couleur la refermerait.
        onBlur={(e) => {
          if (e.relatedTarget?.closest("[data-label-editor]")) return;
          onSubmit();
        }}
        variant="unstyled"
        size="xs"
        autoFocus
        style={{ flex: 1, minWidth: 0 }}
        aria-label={aria}
      />
      {labelsApi.avecPoids && (
        <NumberInput
          value={weight}
          onChange={(v) => onWeight(v === "" ? "" : Number(v))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
            if (e.key === "Escape") onCancel();
          }}
          onBlur={(e) => {
            if (e.relatedTarget?.closest("[data-label-editor]")) return;
            onSubmit();
          }}
          allowDecimal={false}
          hideControls
          placeholder="Poids"
          title="Poids : les plus lourdes passent devant dans les grilles"
          variant="unstyled"
          size="xs"
          w={LARGEUR_POIDS}
          style={{ flexShrink: 0 }}
          aria-label={`Poids de ${name || "l'étiquette"}`}
        />
      )}
    </Group>
  );

  return (
    <>
      <ChipPicker
        chipHeight={chipHeight}
        // Le « + » d'une étiquette est rectangulaire, comme elle : même rayon.
        plusRadius={4}
        onClose={conclure}
        // La fenêtre de confirmation est un clic « au dehors » : la liste s'en
        // irait, et l'on reviendrait à la carte sitôt la question répondue.
        closeBlocked={aSupprimer !== null}
        label={label}
        options={labels}
        value={value}
        onChange={onChange}
        emptyText={emptyText}
        fullWidthOptions
        // Une étiquette déjà ouverte reste en saisie : le double clic dans son champ ne
        // doit pas la rouvrir et effacer ce qu'on est en train d'écrire.
        onOptionClick={(l) => edite?.id !== l.id && ouvrirEdition(l)}
        // La vignette de la carte ne suit pas la modification : elle montre
        // l'étiquette telle qu'elle est enregistrée, et ne changera qu'une fois
        // la saisie validée. Seule la ligne de la liste passe en saisie.
        renderChip={(l) => <LabelChip label={l} height={chipHeight} />}
        render={(l) => (
          // La ligne : l'étiquette — ou sa saisie — et, au bout, la corbeille.
          <Group
            gap={4}
            wrap="nowrap"
            style={{ flex: 1, minWidth: 0 }}
            onMouseEnter={() => setSurvole(l.id)}
            onMouseLeave={() => setSurvole((id) => (id === l.id ? null : id))}
          >
            {edite?.id === l.id ? (
              // En modification seulement : la pastille de couleur rejoint le
              // nom. Au repos, l'étiquette se suffit à elle-même.
              saisie({
                color: edite.color,
                name: edite.name,
                weight: edite.weight,
                onColor: (color) => appliquerCouleur(l, color),
                onName: (name) => setEdite((e) => (e ? { ...e, name } : e)),
                onWeight: (weight) => setEdite((e) => (e ? { ...e, weight } : e)),
                onSubmit: () => enregistrer(l),
                onCancel: fermerEdition,
                aria: `Renommer ${l.name}`,
              })
            ) : (
              // L'étiquette tient toute la largeur de la liste, comme un bandeau.
              <div style={{ flex: 1, minWidth: 0, paddingLeft: LABEL_INDENT }}>
                <LabelChip label={l} height={chipHeight} fullWidth />
              </div>
            )}

            {/* La corbeille ne paraît qu'au survol ou pendant la modification,
                mais tient sa place en tout temps : la ligne ne bouge pas quand
                la souris la traverse. */}
            <ActionIcon
              variant="subtle"
              color={RED}
              size="sm"
              style={{
                flexShrink: 0,
                opacity: survole === l.id || edite?.id === l.id ? 1 : 0,
              }}
              // Le clic s'arrête ici : il ne doit pas cocher ni ouvrir
              // l'étiquette qu'on s'apprête à supprimer.
              onClick={(e) => {
                e.stopPropagation();
                demanderSuppression(l);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              aria-label={`Supprimer ${l.name}`}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        )}
        footer={
          <div style={{ paddingTop: 6 }}>
            {ajout ? (
              <div style={{ padding: 4 }}>
                {saisie({
                  color: ajout.color,
                  name: ajout.name,
                  weight: ajout.weight,
                  onColor: (color) => setAjout((a) => (a ? { ...a, color } : a)),
                  onName: (name) => setAjout((a) => (a ? { ...a, name } : a)),
                  onWeight: (weight) => setAjout((a) => (a ? { ...a, weight } : a)),
                  onSubmit: creer,
                  onCancel: () => setAjout(null),
                  aria: "Nom de la nouvelle étiquette",
                })}
              </div>
            ) : (
              <Anchor
                component="button"
                type="button"
                size="sm"
                c={ADD_ACTION.color}
                onClick={ouvrirAjout}
                px={4}
              >
                <Group gap={PLUS_GAP} wrap="nowrap">
                  <IconPlus size={PLUS_SIZE} />
                  <span>Ajouter une étiquette</span>
                </Group>
              </Anchor>
            )}
          </div>
        }
      />

      {/* Posée hors de la liste, qui l'emporterait en se refermant : la
          question survit ainsi, et la liste reste ouverte derrière elle. */}
      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={supprimer}
        title="Supprimer l'étiquette"
        message={
          <>
            Voulez-vous vraiment supprimer « {aSupprimer?.name} » ? Elle sera
            retirée {labelsApi.porteurs}. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
