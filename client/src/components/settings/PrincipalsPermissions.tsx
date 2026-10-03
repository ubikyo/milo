import { Avatar, Stack, Text } from "@mantine/core";
import {
  IconShieldLock,
  IconTrash,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useElementSize } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ListItems, { ADD_ROW_HEIGHT, ROW_PADDING } from "../ui/ListItems";
import DirectoryPicker from "./DirectoryPicker";
import PrincipalPermissionsModal from "./PrincipalPermissionsModal";
import type { SectionPermissions } from "./PrincipalPermissionsModal";
import { messageErreur, notifierErreur } from "../../lib/errors";
import type { EntraPrincipal, PrincipalPermissions } from "@milo/shared";

// Un utilisateur ou un groupe tient sur deux lignes : son nom, puis son
// adresse ou « Groupe ».
const ROW_HEIGHT = 66;

// Hauteur du champ de recherche dans la ligne d'ajout : celle du texte.
const FIELD_HEIGHT = 22;

// L'écart entre un champ et sa liste déroulante : celui de Mantine.
const DROPDOWN_GAP = 8;

const cle = (p: EntraPrincipal) => `${p.type}:${p.id}`;

interface PrincipalsPermissionsProps<T> {
  load: () => Promise<PrincipalPermissions<T>[]>;
  /** Enregistre les permissions d'un principal ; rend la liste à jour. */
  save: (principal: EntraPrincipal, permissions: T) => Promise<PrincipalPermissions<T>[]>;
  /** Lui retire tout ; rend la liste à jour. */
  remove: (principal: EntraPrincipal) => Promise<PrincipalPermissions<T>[]>;
  /** Celles de qui arrive de l'annuaire : aucune. */
  vide: () => T;
  /** Ce qu'il a, d'un coup d'œil, au bout de sa ligne. */
  resume: (permissions: T) => string;
  /** La fenêtre des permissions (PrincipalPermissionsModal). */
  sections: (permissions: T, changer: (permissions: T) => void) => SectionPermissions[];
  emptyText: string;
  /** Le geste qui lui retire tout, et sa confirmation. */
  retirer: { label: string; message: (nom: string) => ReactNode };
  /**
   * Après un enregistrement ou un retrait : ses propres droits ont pu changer
   * — un workspace de plus dans son sélecteur, par exemple.
   */
  onChange?: () => void;
}

/**
 * Des utilisateurs et des groupes Entra et leurs permissions : les accès
 * d'un workspace (WorkspaceAccess), l'administration de l'application
 * (AdministrationTab). La même liste que les sociétés (ListItems) ; la ligne
 * d'ajout cherche dans l'annuaire, et choisir ouvre aussitôt la fenêtre des
 * permissions.
 */
export default function PrincipalsPermissions<T>({
  load,
  save,
  remove,
  vide,
  resume,
  sections,
  emptyText,
  retirer,
  onChange,
}: PrincipalsPermissionsProps<T>) {
  const [acces, setAcces] = useState<PrincipalPermissions<T>[]>([]);
  // Celui dont la fenêtre des permissions est ouverte : un principal de la
  // liste, ou celui qu'on vient de choisir dans l'annuaire.
  const [permissionsDe, setPermissionsDe] = useState<EntraPrincipal | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EntraPrincipal | null>(
    null,
  );
  // La largeur de la liste : celle que prend la liste déroulante de la
  // recherche, qui s'aligne sur la ligne d'ajout entière et non sur le champ
  // de texte, plus étroit qu'elle de ses retraits.
  const { ref: cadre, width: largeur } = useElementSize();

  const reload = useCallback(async () => {
    try {
      setAcces(await load());
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  const actuel = permissionsDe
    ? acces.find((a) => cle(a.principal) === cle(permissionsDe))
    : undefined;
  // Qui arrive de l'annuaire n'en a pas encore : aucune.
  const initiales = actuel?.permissions ?? vide();

  return (
    <Stack gap="sm" ref={cadre}>

      <ListItems
        rowHeight={ROW_HEIGHT}
        maxRows={8}
        isEmpty={acces.length === 0}
        emptyIcon={IconUsersGroup}
        emptyText={emptyText}
        add={{
          input: (
            <DirectoryPicker
              aria-label="Ajouter un utilisateur ou un groupe"
              placeholder="Ajouter un utilisateur ou un groupe Entra"
              // Toujours vide : choisir ouvre la fenêtre des permissions, et
              // le champ est aussitôt prêt pour le suivant.
              value={null}
              resetOnSelect
              onChange={(principal) => principal && setPermissionsDe(principal)}
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
        {acces.map(({ principal, permissions }) => (
          <ListItems.Row
            key={cle(principal)}
            height={ROW_HEIGHT}
            actions={[
              {
                label: "Permissions",
                icon: IconShieldLock,
                onClick: () => setPermissionsDe(principal),
              },
              {
                label: retirer.label,
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

              {/* Ce qu'il a, d'un coup d'œil. */}
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {resume(permissions)}
              </Text>
            </>
          </ListItems.Row>
        ))}
      </ListItems>

      <PrincipalPermissionsModal
        principal={permissionsDe}
        initial={initiales}
        sections={sections}
        onSave={async (permissions) => {
          if (!permissionsDe) return;
          setAcces(await save(permissionsDe, permissions));
          onChange?.();
        }}
        onClose={() => setPermissionsDe(null)}
      />

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            try {
              setAcces(await remove(pendingDelete));
              onChange?.();
            } catch (e) {
              notifierErreur(messageErreur(e));
            }
          }
          setPendingDelete(null);
        }}
        title={retirer.label}
        message={retirer.message(pendingDelete?.name ?? "")}
      />
    </Stack>
  );
}
