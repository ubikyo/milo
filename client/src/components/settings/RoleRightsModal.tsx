import { Button, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { AREAS, RIGHTS, rightsFor } from "@milo/shared";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert";
import ListItems from "../ui/ListItems";
import { messageErreur } from "../../lib/errors";
import type { Area, Permissions, Right, Role } from "@milo/shared";
import BoutonFermer from "../ui/BoutonFermer";

// La colonne d'un droit : de quoi loger sa case et « Supprimer », le plus long.
const LARGEUR_DROIT = 96;

interface RoleRightsModalProps {
  /** Le rôle dont on règle les droits ; « null » ferme la fenêtre. */
  role: Role | null;
  onClose: () => void;
  onSave: (permissions: Permissions) => Promise<unknown>;
}

/**
 * Les droits d'un rôle : une ligne par mode, une colonne par droit. Un mode
 * qui ne propose pas un droit laisse sa case vide (les assets ne se lisent
 * que). L'administrateur a tout, et sa grille ne se modifie pas.
 */
export default function RoleRightsModal({
  role,
  onClose,
  onSave,
}: RoleRightsModalProps) {
  const [droits, setDroits] = useState<Permissions>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!role) return;
    setDroits(role.permissions);
    setError(null);
  }, [role]);

  const figee = role?.is_admin ?? false;
  const accorde = (mode: Area, droit: Right) =>
    droits[mode]?.includes(droit) ?? false;

  /**
   * Cocher un droit sans « Voir » n'aurait pas de sens : on ne modifie pas ce
   * qu'on ne voit pas. Cocher un droit coche donc « Voir », et décocher
   * « Voir » retire tout le mode.
   */
  const basculer = (mode: Area, droit: Right, coche: boolean) => {
    setDroits((d) => {
      const actuels = new Set(d[mode] ?? []);
      if (coche) {
        actuels.add(droit);
        actuels.add("view");
      } else if (droit === "view") {
        actuels.clear();
      } else {
        actuels.delete(droit);
      }
      return {
        ...d,
        [mode]: rightsFor(mode).filter((r) => actuels.has(r)),
      };
    });
  };

  const enregistrer = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave(droits);
      onClose();
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={role !== null}
      onClose={onClose}
      title={`Permissions — ${role?.name ?? ""}`}
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        {error && (
          <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>
        )}

        {figee && (
          <Text size="sm" c="dimmed">
            L'administrateur a tous les droits, dans tous les modes et le
            Paramétrage.
          </Text>
        )}

        {/* La même liste que les étiquettes et les catégories (ListItems),
            sans ligne d'ajout : un mode par ligne, ses droits au bout. Chaque
            droit a sa colonne, de sorte que « Voir » s'aligne d'un mode à
            l'autre — les assets n'en proposent pas d'autre. */}
        <ListItems maxRows={AREAS.length}>
          {AREAS.map((m) => (
            <ListItems.Row key={m.value}>
              <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                {m.label}
              </Text>
              {RIGHTS.map((r) => (
                <div
                  key={r.value}
                  style={{ width: LARGEUR_DROIT, flexShrink: 0 }}
                >
                  {rightsFor(m.value).includes(r.value) && (
                    <Checkbox
                      size="xs"
                      color="teal"
                      label={r.label}
                      checked={accorde(m.value, r.value)}
                      disabled={figee}
                      onChange={(e) =>
                        basculer(m.value, r.value, e.currentTarget.checked)
                      }
                      aria-label={`${m.label} — ${r.label}`}
                    />
                  )}
                </div>
              ))}
            </ListItems.Row>
          ))}
        </ListItems>

        <Group justify="flex-end" mt={MODAL_PADDING - 16}>
          <BoutonFermer onClick={onClose} />
          {!figee && (
            <Button color="teal" onClick={enregistrer} loading={saving}>
              Enregistrer
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
