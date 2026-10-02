import { Avatar, Stack, Text } from "@mantine/core";
import {
  IconShieldLock,
  IconTrash,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useElementSize } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import ListItems, { ADD_ROW_HEIGHT, ROW_PADDING } from "../ui/ListItems";
import DirectoryPicker from "./DirectoryPicker";
import PrincipalPermissionsModal from "./PrincipalPermissionsModal";
import { messageErreur } from "../../lib/errors";
import { defaultAppPermissions } from "@milo/shared";
import type {
  Company,
  EntraPrincipal,
  PrincipalAssignments,
} from "@milo/shared";

// Un utilisateur ou un groupe tient sur deux lignes : son nom, puis son
// adresse ou le nombre de sociétés.
const ROW_HEIGHT = 66;

// Hauteur du champ de recherche dans la ligne d'ajout : celle du texte.
const FIELD_HEIGHT = 22;

// L'écart entre un champ et sa liste déroulante : celui de Mantine.
const DROPDOWN_GAP = 8;

const cle = (p: EntraPrincipal) => `${p.type}:${p.id}`;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Les accès à Milo : les utilisateurs et les groupes Entra qui ont un rôle
 * dans au moins une société. La même liste que les sociétés et les rôles
 * (ListItems) ; la ligne d'ajout cherche dans l'annuaire, et choisir ouvre
 * aussitôt la fenêtre des rôles. Les administrateurs, eux, se désignent par
 * leur groupe, dans l'onglet Entra.
 */
export default function AccessTab({ companies }: { companies: Company[] }) {
  const [acces, setAcces] = useState<PrincipalAssignments[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Celui dont la fenêtre des rôles est ouverte : un principal de la liste, ou
  // celui qu'on vient de choisir dans l'annuaire.
  const [rolesDe, setRolesDe] = useState<EntraPrincipal | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EntraPrincipal | null>(
    null,
  );
  // La largeur de la liste : celle que prend la liste déroulante de la
  // recherche, qui s'aligne sur la ligne d'ajout entière et non sur le champ
  // de texte, plus étroit qu'elle de ses retraits.
  const { ref: cadre, width: largeur } = useElementSize();

  const reload = useCallback(async () => {
    try {
      setAcces(await api.getAssignments());
    } catch (e) {
      setError(messageErreur(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const actuel = rolesDe ? acces.find((a) => cle(a.principal) === cle(rolesDe)) : undefined;
  const rolesActuels = actuel?.roles ?? [];
  // Qui arrive de l'annuaire n'en a pas encore : tous les modes, pas de Paramétrage.
  const appActuelle = actuel?.app ?? defaultAppPermissions();

  return (
    <Stack gap="sm" ref={cadre}>
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

      <ListItems
        rowHeight={ROW_HEIGHT}
        maxRows={8}
        isEmpty={acces.length === 0}
        emptyIcon={IconUsersGroup}
        emptyText="Aucun accès pour le moment"
        add={{
          input: (
            <DirectoryPicker
              aria-label="Ajouter un utilisateur ou un groupe"
              placeholder="Ajouter un utilisateur ou un groupe Entra"
              // Toujours vide : choisir ouvre la fenêtre des rôles, et le
              // champ est aussitôt prêt pour le suivant.
              value={null}
              resetOnSelect
              onChange={(principal) => principal && setRolesDe(principal)}
              variant="unstyled"
              size="sm"
              style={{ flex: 1, minWidth: 0 }}
              styles={{
                input: {
                  height: FIELD_HEIGHT,
                  minHeight: FIELD_HEIGHT,
                  lineHeight: `${FIELD_HEIGHT}px`,
                },
              }}
              // Le champ de texte est centré dans une ligne plus haute que
              // lui, et en retrait de ses bords : la liste descend sous la
              // ligne, à l'écart habituel, et en prend toute la largeur.
              comboboxProps={{
                position: "bottom-start",
                width: largeur || "target",
                offset: {
                  mainAxis: (ADD_ROW_HEIGHT - FIELD_HEIGHT) / 2 + DROPDOWN_GAP,
                  crossAxis: -ROW_PADDING,
                },
              }}
            />
          ),
        }}
      >
        {acces.map(({ principal, roles }) => (
          <ListItems.Row
            key={cle(principal)}
            height={ROW_HEIGHT}
            actions={[
              {
                label: "Permissions",
                icon: IconShieldLock,
                onClick: () => setRolesDe(principal),
              },
              {
                label: "Retirer l'accès",
                icon: IconTrash,
                onClick: () => setPendingDelete(principal),
                danger: true,
              },
            ]}
          >
            <>
              <Avatar size={28} radius="xl" color="gray" variant="light">
                {principal.type === "group" ? (
                  <IconUsersGroup size={16} />
                ) : (
                  <IconUser size={16} />
                )}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" truncate>
                  {principal.name || principal.email}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {principal.type === "group" ? "Groupe" : principal.email}
                </Text>
              </div>

              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {pluriel(roles.length, "société")}
              </Text>
            </>
          </ListItems.Row>
        ))}
      </ListItems>

      <PrincipalPermissionsModal
        principal={rolesDe}
        currentApp={appActuelle}
        current={rolesActuels}
        companies={companies}
        onClose={() => setRolesDe(null)}
        onSaved={setAcces}
      />

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            try {
              setAcces(await api.deleteAssignments(pendingDelete));
            } catch (e) {
              setError(messageErreur(e));
            }
          }
          setPendingDelete(null);
        }}
        title="Retirer l'accès"
        message={
          <>
            Voulez-vous vraiment retirer à « {pendingDelete?.name} » son accès à
            toutes les sociétés ?
          </>
        }
      />
    </Stack>
  );
}
