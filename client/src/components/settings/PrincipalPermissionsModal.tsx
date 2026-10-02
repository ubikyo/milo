import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { IconBuilding } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert";
import ListItems from "../ui/ListItems";
import { messageErreur } from "../../lib/errors";
import type {
  Company,
  EntraPrincipal,
  PrincipalAssignments,
  Role,
  UserCompanyRole,
} from "@milo/shared";
import BoutonFermer from "../ui/BoutonFermer";

// La valeur de « Aucun » : aucune attribution n'est envoyée pour la société.
const AUCUN = "aucun";

// Le choix du rôle, au bout de la ligne : de quoi lire « Administrateur ».
const LARGEUR_ROLE = 200;

// Hauteur du champ : celle du texte, comme le renommage d'une ligne
// (LookupManager).
const FIELD_HEIGHT = 22;

interface PrincipalRolesModalProps {
  /** L'utilisateur ou le groupe dont on règle les rôles ; « null » ferme la fenêtre. */
  principal: EntraPrincipal | null;
  /** Ses rôles actuels : aucun pour celui qu'on vient de choisir dans l'annuaire. */
  current: UserCompanyRole[];
  companies: Company[];
  onClose: () => void;
  /** Les accès de tous, tels que le serveur les rend après l'enregistrement. */
  onSaved: (liste: PrincipalAssignments[]) => void;
}

/**
 * Le rôle d'un utilisateur ou d'un groupe Entra, société par société : une
 * ligne par société, et son rôle choisi dans la liste. « Aucun » le retire
 * de la société ; « Aucun » partout lui retire tout accès.
 */
export default function PrincipalRolesModal({
  principal,
  current,
  companies,
  onClose,
  onSaved,
}: PrincipalRolesModalProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  // Le rôle choisi pour chaque société, par identifiant de société.
  const [choix, setChoix] = useState<Record<number, string | null>>({});
  const [charge, setCharge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!principal) return;
    setCharge(false);
    setError(null);
    setChoix(
      Object.fromEntries(current.map((a) => [a.company_id, String(a.role_id)])),
    );
    // Relus à chaque ouverture : l'onglet des rôles a pu les changer.
    api
      .getRoles()
      .then(setRoles)
      .catch((e) => setError(messageErreur(e)))
      .finally(() => setCharge(true));
    // Les rôles actuels ne se relisent qu'à l'ouverture : une relecture de la
    // liste pendant qu'on choisit effacerait les choix en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal]);

  const enregistrer = async () => {
    if (!principal) return;
    setError(null);
    setSaving(true);
    try {
      const liste = await api.setAssignments(
        principal,
        Object.entries(choix)
          .filter(([, role]) => role && role !== AUCUN)
          .map(([company, role]) => ({
            company_id: Number(company),
            role_id: Number(role),
          })),
      );
      onSaved(liste);
      onClose();
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  // « Aucun » en tête de liste, à la place d'une croix pour vider le champ :
  // c'est ainsi qu'on retire le compte d'une société.
  const options = [
    { value: AUCUN, label: "Aucun" },
    ...roles.map((r) => ({ value: String(r.id), label: r.name })),
  ];

  return (
    <Modal
      opened={principal !== null}
      onClose={onClose}
      title={`Rôles — ${principal?.name ?? ""}`}
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

        {/* La même liste que les étiquettes et les catégories (ListItems),
            sans ligne d'ajout : une société par ligne, son rôle au bout. */}
        {charge && (
          <ListItems
            maxRows={8}
            isEmpty={companies.length === 0}
            emptyIcon={IconBuilding}
            emptyText="Aucune société pour le moment"
          >
            {companies.map((c) => (
              <ListItems.Row key={c.id}>
                <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                  {c.name}
                </Text>
                <Select
                  aria-label={`Rôle pour ${c.name}`}
                  data={options}
                  value={choix[c.id] || AUCUN}
                  onChange={(value) =>
                    setChoix((ch) => ({ ...ch, [c.id]: value }))
                  }
                  allowDeselect={false}
                  // Sans cadre, à la hauteur du texte : le champ tient dans
                  // sa ligne, comme le renommage d'une société.
                  variant="unstyled"
                  size="sm"
                  w={LARGEUR_ROLE}
                  styles={{
                    input: {
                      height: FIELD_HEIGHT,
                      minHeight: FIELD_HEIGHT,
                      lineHeight: `${FIELD_HEIGHT}px`,
                      textAlign: "right",
                    },
                  }}
                />
              </ListItems.Row>
            ))}
          </ListItems>
        )}

        <Group justify="flex-end" mt={MODAL_PADDING - 16}>
          <BoutonFermer onClick={onClose} />
          <Button
            color="teal"
            onClick={enregistrer}
            loading={saving}
            disabled={!charge}
          >
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
