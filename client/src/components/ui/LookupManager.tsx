import { Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ErrorAlert from "./ErrorAlert";
import ListItems from "./ListItems";
import type { RowAction } from "./ListItems";
import type { ComponentType, ReactNode } from "react";

/**
 * Ce qu'une ligne doit porter. Le nombre de projets rattachés ne vaut que pour
 * les sociétés et les catégories : il dit ce que la suppression emporterait.
 */
export interface LookupItem {
  id: number;
  name: string;
  project_count?: number;
}
import { messageErreur } from "../../lib/errors";

/**
 * Liste éditable pour les ressources qui n'ont qu'un nom : sociétés et
 * catégories. La présentation vient de ListItems ; ce composant n'apporte
 * que l'édition d'un libellé.
 *
 * Tout se passe sur la ligne : cliquer le nom l'édite sur place (Entrée
 * enregistre, Échap annule, quitter le champ enregistre). La dernière ligne est
 * un champ d'ajout permanent qui garde le focus : on enchaîne les saisies.
 */
interface LookupManagerProps {
  items: LookupItem[];
  addTitle: string;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: number, name: string) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText?: ReactNode;
  entityLabel: string;
  maxRows?: number;
  minRows?: number;
  /**
   * Des gestes propres à une ressource, en tête du menu de la ligne, avant
   * « Modifier » et « Supprimer » — les jalons d'un type de jalons, par
   * exemple.
   */
  renderActions?: (item: LookupItem) => RowAction[];
  /**
   * Des étiquettes toujours visibles, au bord droit de la ligne — ce qu'une
   * société a de configuré, par exemple.
   */
  renderTags?: (item: LookupItem) => ReactNode;
  /** Sans elle, tout se supprime ; le rôle administrateur, lui, reste. */
  canDelete?: (item: LookupItem) => boolean;
  /**
   * Ce que la ligne d'ajout porte après le nom — l'évènement d'une réponse
   * par défaut. C'est l'appelant qui en garde la valeur, et la lit à l'ajout.
   */
  addEnd?: ReactNode;
}

/**
 * Ce que la suppression va emporter. Sorti du corps de la liste : le pluriel
 * et un compte facultatif à l'intérieur d'un attribut JSX se lisaient mal, et
 * obligeaient à répéter la vérification du cas « rien à supprimer ».
 */
function SuppressionMessage({ item }: { item: LookupItem | null }) {
  if (!item) return null;
  const projets = item.project_count ?? 0;

  // Un élément encore utilisé ne se supprime pas : le serveur refuse, et dit
  // par combien de ressources. On le dit dès ici quand on le sait déjà.
  return projets > 0 ? (
    <>
      « {item.name} » est utilisé dans{" "}
      <strong>
        {projets} projet{projets > 1 ? "s" : ""}
      </strong>{" "}
      : il ne pourra pas être supprimé tant qu'il leur est rattaché.
    </>
  ) : (
    <>Voulez-vous vraiment supprimer « {item.name} » ? Cette action est irréversible.</>
  );
}

// Hauteur du champ qui renomme une ligne : celle du texte qu'il remplace,
// comme dans la liste des étiquettes (LabelsManager).
const FIELD_HEIGHT = 22;

// Le retrait droit d'une ligne qui porte des étiquettes : serré, pour que
// l'écart au bord se lise comme celui du haut. Réglé à l'œil — le calcul
// ((ligne - étiquette) / 2 = 8 px) paraissait encore trop large.
const TAG_PADDING = 5;

export default function LookupManager({
  items,
  addTitle,
  onCreate,
  onUpdate,
  onDelete,
  emptyIcon,
  emptyText,
  entityLabel,
  maxRows,
  minRows,
  renderActions,
  renderTags,
  canDelete,
  addEnd,
}: LookupManagerProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LookupItem | null>(null);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      setError(messageErreur(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (item: LookupItem) => {
    setError(null);
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    // Un nom vidé ou inchangé : on referme sans rien demander au serveur.
    const nom = editingName.trim();
    const item = items.find((i) => i.id === editingId);
    if (!nom || nom === item?.name || editingId === null) return cancelEdit();
    if (await run(() => onUpdate(editingId, nom))) cancelEdit();
  };

  // Le champ d'ajout garde le focus : la saisie suivante enchaîne.
  const create = async () => {
    if (!newName.trim()) return;
    if (await run(() => onCreate(newName.trim()))) setNewName("");
  };

  return (
    <Stack gap="sm">
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

      <ListItems
        maxRows={maxRows}
        minRows={minRows}
        isEmpty={items.length === 0}
        emptyIcon={emptyIcon}
        emptyText={emptyText}
        add={{
          placeholder: addTitle,
          value: newName,
          onChange: setNewName,
          onSubmit: create,
          onCancel: () => setNewName(""),
          disabled: busy,
          end: addEnd,
        }}
      >
        {items.map((item) => (
          <ListItems.Row
            key={item.id}
            paddingRight={renderTags ? TAG_PADDING : undefined}
            actions={[
              ...(renderActions?.(item) ?? []),
              {
                label: "Modifier",
                icon: IconPencil,
                onClick: () => startEdit(item),
              },
              ...(canDelete && !canDelete(item)
                ? []
                : [
                    {
                      label: "Supprimer",
                      icon: IconTrash,
                      onClick: () => setPendingDelete(item),
                      danger: true,
                    },
                  ]),
            ]}
          >
            <>
              {editingId === item.id ? (
                <TextInput
                  value={editingName}
                  onChange={(e) => setEditingName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    // Consommée : le tiroir qui porte ce champ n'enregistre pas en plus.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEdit();
                    }
                    if (e.key === "Escape") cancelEdit();
                  }}
                  onBlur={saveEdit}
                  // Sans cadre : la ligne ne bouge pas quand elle passe en
                  // édition, seul le curseur signale la saisie.
                  variant="unstyled"
                  size="sm"
                  style={{ flex: 1, minWidth: 0 }}
                  // Un champ « sm » fait 36 px, plus que la ligne (34) : il
                  // débordait sous la dernière, la liste s'allongeait, et le
                  // focus la faisait défiler pour le montrer en entier — tout
                  // montait d'un cran. Ramené à la hauteur du texte, il tient
                  // dans sa ligne.
                  styles={{
                    input: {
                      height: FIELD_HEIGHT,
                      minHeight: FIELD_HEIGHT,
                      lineHeight: `${FIELD_HEIGHT}px`,
                    },
                  }}
                  disabled={busy}
                  autoFocus
                  aria-label={`Renommer ${item.name}`}
                />
              ) : (
                <UnstyledButton
                  onClick={() => startEdit(item)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Text size="sm" truncate>
                    {item.name}
                  </Text>
                </UnstyledButton>
              )}

              {editingId !== item.id && renderTags?.(item)}
            </>
          </ListItems.Row>
        ))}
      </ListItems>

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await run(() => onDelete(pendingDelete.id));
          setPendingDelete(null);
        }}
        title={`Supprimer ${entityLabel}`}
        message={<SuppressionMessage item={pendingDelete} />}
      />
    </Stack>
  );
}
