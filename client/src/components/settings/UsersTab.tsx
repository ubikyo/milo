import { ActionIcon, Badge, Group, Stack, Text, TextInput } from "@mantine/core";
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { RED } from "../../themes/colors";
import { PersonAvatar } from "../ui/ActorAvatars";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import ListItems from "../ui/ListItems";
import { messageErreur } from "../../lib/errors";
import type { PublicUser } from "@milo/shared";
import type { KeyboardEvent, ReactNode } from "react";

/** Le compte en cours de modification : les trois champs, et l'identifiant visé. */
type Edition = Pick<PublicUser, "id" | "first_name" | "last_name" | "email">;

// L'administrateur n'invite qu'une adresse : le profil est complété par la
// personne lors de sa première connexion.
const emptyDraft = { email: "" };

// Une personne tient sur deux lignes — son nom, puis son adresse — là où les
// autres listes n'ont qu'un libellé : sa ligne est donc plus haute.
const USER_ROW_HEIGHT = 60;

// Deux ActionIcon « sm » (22 px chacune) et leur écart : la colonne d'actions
// garde cette largeur même sur son propre compte, qui n'en propose aucune, sans
// quoi la pastille d'état de cette ligne-là se décalerait vers la droite.
const ACTIONS_WIDTH = 46;

// Même présentation que les sociétés et les catégories (ListItems).
//
// Une personne a trois champs (prénom, nom, e-mail) : ils passent tous les
// trois sur la ligne en édition. Contrairement aux listes à un seul nom,
// l'enregistrement ne se fait pas en quittant le champ — on passerait de
// « prénom » à « nom » en fermant l'édition. Entrée enregistre, Échap annule.
export default function UsersTab({ currentUser }: { currentUser: PublicUser | null }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<Edition | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setUsers(await api.getUsers()), []);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      await action();
      await reload();
      return true;
    } catch (e) {
      setError(messageErreur(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!draft.email.trim()) return;
    if (await run(() => api.createUser({ email: draft.email.trim() }))) setDraft(emptyDraft);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const payload = {
      first_name: editing.first_name.trim(),
      last_name: editing.last_name.trim(),
      email: editing.email.trim(),
    };
    if (await run(() => api.updateUser(editing.id, payload))) setEditing(null);
  };

  const touchesEdition = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditing(null);
  };

  // Champ d'un des trois attributs, sans cadre : la ligne ne bouge pas quand
  // elle passe en édition.
  const champ = (
    cle: "first_name" | "last_name" | "email",
    placeholder: string,
    flex: number,
  ): ReactNode => (
    <TextInput
      placeholder={placeholder}
      value={editing?.[cle] ?? ""}
      onChange={(e) => {
        const { value } = e.currentTarget;
        setEditing((u) => (u ? { ...u, [cle]: value } : u));
      }}
      onKeyDown={touchesEdition}
      variant="unstyled"
      size="sm"
      style={{ flex, minWidth: 0 }}
      disabled={busy}
      autoFocus={cle === "first_name"}
      aria-label={placeholder}
    />
  );

  return (
    <Stack gap="sm">
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

      <ListItems
        rowHeight={USER_ROW_HEIGHT}
        add={{
          placeholder: "Nouvel utilisateur (e-mail)",
          type: "email",
          value: draft.email,
          onChange: (value) => setDraft((d) => ({ ...d, email: value })),
          onSubmit: create,
          onCancel: () => setDraft(emptyDraft),
          disabled: busy,
        }}
      >
        {users.map((user) => (
          <ListItems.Row key={user.id} height={USER_ROW_HEIGHT}>
            {(active) =>
              editing?.id === user.id ? (
                <>
                  {champ("first_name", "Prénom", 1)}
                  {champ("last_name", "Nom", 1)}
                  {champ("email", "E-mail", 1.5)}
                  <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => setEditing(null)}
                      aria-label="Annuler"
                    >
                      <IconX size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="teal"
                      size="sm"
                      onClick={saveEdit}
                      loading={busy}
                      aria-label="Valider"
                    >
                      <IconCheck size={14} />
                    </ActionIcon>
                  </Group>
                </>
              ) : (
                <>
                  <PersonAvatar person={user} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {user.first_name || user.last_name ? user.name : "—"}
                      {user.id === currentUser?.id && (
                        <Text span size="xs" c="dimmed">
                          {" "}
                          (vous)
                        </Text>
                      )}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {user.email}
                    </Text>
                  </div>

                  {/* L'état du compte se lit à droite du nom, sans dépendre
                      du survol : orange tant que la première connexion n'a pas
                      eu lieu — le compte est ouvert mais pas encore pris —,
                      vert une fois la personne validée. */}
                  <Badge
                    color={user.activated ? "green" : "orange"}
                    variant="filled"
                    size="sm"
                    radius="sm"
                    tt="none"
                    fw={600}
                    style={{ flexShrink: 0 }}
                  >
                    {user.activated ? "Actif" : "En attente"}
                  </Badge>

                  {/* Son propre compte se gère depuis les préférences : aucune
                      action n'est proposée ici, mais la colonne garde sa
                      largeur pour que les pastilles restent alignées d'une
                      ligne à l'autre. Les icônes restent montées pour le
                      clavier, visibles sur la ligne en cours. */}
                  <Group
                    gap={2}
                    wrap="nowrap"
                    justify="flex-end"
                    style={{ width: ACTIONS_WIDTH, flexShrink: 0, opacity: active ? 1 : 0 }}
                  >
                    {user.id !== currentUser?.id && (
                      <>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => setEditing({ ...user })}
                          aria-label={`Modifier ${user.name}`}
                        >
                          <IconPencil size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color={RED}
                          size="sm"
                          onClick={() => setPendingDelete(user)}
                          aria-label={`Supprimer ${user.name}`}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </>
                    )}
                  </Group>
                </>
              )
            }
          </ListItems.Row>
        ))}
      </ListItems>

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await run(() => api.deleteUser(pendingDelete.id));
          setPendingDelete(null);
        }}
        title="Supprimer l'utilisateur"
        message={
          <>
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ? Cette personne perdra l'accès à Milo.
            Cette action est irréversible.
          </>
        }
      />
    </Stack>
  );
}
