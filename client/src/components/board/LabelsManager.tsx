import { NumberInput, Stack, TextInput, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTags, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import LabelChip from "../ui/LabelChip";
import { DEFAULT_LABEL_COLOR, LABEL_HUES } from "@milo/shared";
import type { Label, LabelHue, ProjectLabel, SupportLabel } from "@milo/shared";

// Hauteur d'une ligne d'étiquette : un peu plus haute que les autres listes,
// l'étiquette y tenant un rectangle plein.
const LABEL_ROW_HEIGHT = 40;

// Hauteur de l'étiquette et de son champ de saisie. La même pour les deux :
// sans quoi passer en modification ferait sauter la ligne.
const LABEL_FIELD_HEIGHT = 22;

// Largeur du poids : de quoi écrire trois chiffres, comme le pourcentage des
// jalons (MilestonesModal).
const LARGEUR_POIDS = 52;

/** Le poids d'une étiquette, sans cadre : la liste en est le cadre. */
function ChampPoids({
  value,
  onChange,
  onBlur,
  label,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
  onBlur?: () => void;
  label: string;
}) {
  return (
    <NumberInput
      value={value}
      onChange={(v) => onChange(v === "" ? "" : Number(v))}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      allowDecimal={false}
      hideControls
      placeholder="Poids"
      title="Poids : les plus lourdes passent devant dans les grilles"
      variant="unstyled"
      size="sm"
      w={LARGEUR_POIDS}
      style={{ flexShrink: 0 }}
      styles={{
        input: {
          height: LABEL_FIELD_HEIGHT,
          minHeight: LABEL_FIELD_HEIGHT,
          lineHeight: `${LABEL_FIELD_HEIGHT}px`,
        },
      }}
      aria-label={label}
    />
  );
}
import LabelColorPicker from "../ui/LabelColorPicker";
import ListItems from "../ui/ListItems";
import { DragHandle, InsertLine, usePileGlissante } from "../ui/PileGlissante";
import { messageErreur, notifierErreur } from "../../lib/errors";

/**
 * Les étiquettes d'un tableau, gérées en ligne comme les sociétés ou les
 * catégories (LookupManager) : cliquer le nom l'édite sur place, la pastille
 * ouvre le choix des couleurs, la dernière ligne ajoute. Quand l'ordre se
 * règle (« onReorder »), chaque ligne se glisse par sa poignée.
 */
/** Les étiquettes des trois modes se gèrent exactement pareil. */
type Etiquette = Label | ProjectLabel | SupportLabel;

interface LabelsManagerProps {
  labels: Etiquette[];
  onCreate: (name: string, color: string, weight: number) => Promise<unknown>;
  onUpdate: (
    id: number,
    data: { name?: string; color?: string; weight?: number },
  ) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  /** Ce que dit la liste quand elle est vide : tout n'est pas un tableau. */
  emptyText?: string;
  /** Ce que la suppression emporte, dit dans les mots du mode. */
  porteurs?: string;
  /** Vrai quand les étiquettes portent un poids : le support seul en a un. */
  avecPoids?: boolean;
  /** L'ordre complet, une fois une ligne glissée. Sans elle, pas de poignée. */
  onReorder?: (ids: number[]) => Promise<unknown>;
}

export default function LabelsManager({
  labels,
  onCreate,
  onUpdate,
  onDelete,
  emptyText = "Aucune étiquette sur ce tableau",
  porteurs = "des cartes qui la portent",
  avecPoids = false,
  onReorder,
}: LabelsManagerProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  // Couleur de l'étiquette en cours de saisie, choisie dans la ligne d'ajout.
  const [newColor, setNewColor] = useState(DEFAULT_LABEL_COLOR);
  const [newWeight, setNewWeight] = useState<number | "">(0);
  // Les poids en cours de saisie, par étiquette : enregistrés en quittant le champ.
  const [poids, setPoids] = useState<Record<number, number | "">>({});
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Etiquette | null>(null);
  // L'ordre qu'on vient de poser, le temps que la liste relue le rapporte :
  // sans lui, la ligne lâchée reviendrait un instant à sa place d'avant.
  const [ordrePose, setOrdrePose] = useState<number[] | null>(null);
  useEffect(() => setOrdrePose(null), [labels]);
  const rangees = ordrePose
    ? ordrePose.flatMap((id) => labels.find((l) => l.id === id) ?? [])
    : labels;

  const { zoneRef, drag, onPointerDown } = usePileGlissante({
    ids: rangees.map((l) => l.id),
    selector: "[data-ligne-etiquette]",
    onReorder: async (ordre) => {
      if (!onReorder) return;
      const ids = ordre.map(Number);
      setOrdrePose(ids);
      if (!(await run(() => onReorder(ids)))) setOrdrePose(null);
    },
  });

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      notifierErreur(messageErreur(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (label: Etiquette) => {
    setEditingId(label.id);
    setEditingName(label.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    const nom = editingName.trim();
    const label = labels.find((l) => l.id === editingId);
    if (!nom || nom === label?.name || editingId === null) return cancelEdit();
    if (await run(() => onUpdate(editingId, { name: nom }))) cancelEdit();
  };

  // La couleur est celle choisie dans la ligne d'ajout ; une fois l'étiquette
  // créée, la suivante passe à la teinte voisine, dans la même nuance, pour
  // qu'on les distingue sans y penser.
  const create = async () => {
    if (!newName.trim()) return;
    if (await run(() => onCreate(newName.trim(), newColor, Number(newWeight) || 0))) {
      setNewName("");
      setNewWeight(0);
      const [teinte, nuance] = newColor.split(".");
      const rang = LABEL_HUES.indexOf(teinte as LabelHue);
      const suivante = LABEL_HUES[(rang + 1) % LABEL_HUES.length];
      setNewColor(`${suivante}.${nuance}`);
    }
  };

  // Un poids vidé revient à celui enregistré ; inchangé, il ne part pas.
  const savePoids = async (label: Etiquette) => {
    const saisi = poids[label.id];
    const oublier = () =>
      setPoids(({ [label.id]: _, ...reste }) => reste);
    const actuel = "weight" in label ? label.weight : 0;
    if (saisi === undefined || saisi === "" || saisi === actuel) return oublier();
    if (await run(() => onUpdate(label.id, { weight: saisi }))) oublier();
  };

  return (
    <Stack gap="sm">

      <ListItems
        maxRows={8}
        rowHeight={LABEL_ROW_HEIGHT}
        isEmpty={labels.length === 0}
        emptyIcon={IconTags}
        emptyText={emptyText}
        add={{
          placeholder: "Nouvelle étiquette",
          value: newName,
          onChange: setNewName,
          onSubmit: create,
          onCancel: () => setNewName(""),
          disabled: busy,
          section: (
            <>
              <LabelColorPicker
                color={newColor}
                onChange={setNewColor}
                label="la nouvelle étiquette"
              />
              {avecPoids && (
                <ChampPoids
                  value={newWeight}
                  onChange={setNewWeight}
                  label="Poids de la nouvelle étiquette"
                />
              )}
            </>
          ),
        }}
      >
        <div ref={zoneRef}>
          {rangees.map((label, rang) => (
            <div
              key={label.id}
              data-ligne-etiquette
              style={{ opacity: drag?.id === label.id ? 0.4 : 1 }}
            >
              {drag?.target === rang && <InsertLine />}
              <ListItems.Row
                height={LABEL_ROW_HEIGHT}
                actions={[
                  {
                    label: "Modifier",
                    icon: IconPencil,
                    onClick: () => startEdit(label),
                  },
                  {
                    label: "Supprimer",
                    icon: IconTrash,
                    onClick: () => setPendingDelete(label),
                    danger: true,
                  },
                ]}
              >
                {(active) => (
                  <>
                    {/* Seule la poignée déplace la ligne : la pastille et le nom
                        gardent leurs clics. */}
                    {onReorder && (
                      <DragHandle
                        onPointerDown={onPointerDown(label.id, rang)}
                        visible={active}
                        label="Glisser pour réordonner"
                      />
                    )}
                    <LabelColorPicker
                      color={label.color}
                      label={label.name}
                      onChange={(color) => run(() => onUpdate(label.id, { color }))}
                    />

                    {avecPoids && (
                      <ChampPoids
                        value={poids[label.id] ?? ("weight" in label ? label.weight : 0)}
                        onChange={(v) => setPoids((p) => ({ ...p, [label.id]: v }))}
                        onBlur={() => void savePoids(label)}
                        label={`Poids de ${label.name}`}
                      />
                    )}

                    {editingId === label.id ? (
                      <TextInput
                        value={editingName}
                        onChange={(e) => setEditingName(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEdit();
                          }
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={saveEdit}
                        variant="unstyled"
                        size="sm"
                        style={{ flex: 1, minWidth: 0 }}
                        // Le champ occupe exactement la place de l'étiquette qu'il
                        // remplace : la ligne ne bouge pas d'un pixel.
                        styles={{
                          input: {
                            height: LABEL_FIELD_HEIGHT,
                            minHeight: LABEL_FIELD_HEIGHT,
                            lineHeight: `${LABEL_FIELD_HEIGHT}px`,
                          },
                        }}
                        disabled={busy}
                        autoFocus
                        aria-label={`Renommer ${label.name}`}
                      />
                    ) : (
                      <UnstyledButton
                        onClick={() => startEdit(label)}
                        // En bloc, l'étiquette se poserait sur la ligne de base du
                        // bouton et retomberait sous le milieu de la ligne.
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          height: LABEL_FIELD_HEIGHT,
                        }}
                      >
                        {/* L'étiquette se montre telle qu'elle se posera sur une
                              carte, pas en texte nu. */}
                        <LabelChip label={label} height={LABEL_FIELD_HEIGHT} />
                      </UnstyledButton>
                    )}
                  </>
                )}
              </ListItems.Row>
            </div>
          ))}
          {drag && drag.target >= rangees.length && <InsertLine />}
        </div>
      </ListItems>

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await run(() => onDelete(pendingDelete.id));
          setPendingDelete(null);
        }}
        title="Supprimer l'étiquette"
        message={
          <>
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ? Elle sera
            retirée {porteurs}. Cette action est irréversible.
          </>
        }
      />
    </Stack>
  );
}
