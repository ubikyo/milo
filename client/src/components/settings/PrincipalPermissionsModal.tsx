import { Button, Group, Input, Modal, Select, Stack, Switch, Text } from "@mantine/core";
import { IconBuilding } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert";
import ListItems from "../ui/ListItems";
import { messageErreur } from "../../lib/errors";
import { MODES, SETTINGS_ACCESS, defaultAppPermissions } from "@milo/shared";
import type {
  AppPermissions,
  Company,
  EntraPrincipal,
  PrincipalAssignments,
  Role,
  SettingsAccess,
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

// Le choix sans cadre, à la hauteur du texte, aligné à droite : il tient dans
// sa ligne, comme le renommage d'une société.
const CHOIX_STYLES = {
  input: {
    height: FIELD_HEIGHT,
    minHeight: FIELD_HEIGHT,
    lineHeight: `${FIELD_HEIGHT}px`,
    textAlign: "right" as const,
  },
};

// « Aucun » ne peut pas être la valeur vide d'un Select : il lui faut la sienne.
const PARAMETRAGE_AUCUN = "aucun";

interface PrincipalPermissionsModalProps {
  /** L'utilisateur ou le groupe dont on règle les permissions ; « null » ferme la fenêtre. */
  principal: EntraPrincipal | null;
  /** Ses permissions pour l'application : celles par défaut pour qui arrive de l'annuaire. */
  currentApp: AppPermissions;
  /** Ses rôles actuels : aucun pour celui qu'on vient de choisir dans l'annuaire. */
  current: UserCompanyRole[];
  companies: Company[];
  onClose: () => void;
  /** Les accès de tous, tels que le serveur les rend après l'enregistrement. */
  onSaved: (liste: PrincipalAssignments[]) => void;
}

/**
 * Les permissions d'un utilisateur ou d'un groupe Entra, en deux listes :
 *
 * - pour l'application : le Paramétrage (Aucun, Voir ou Modifier), commun à
 *   toutes les sociétés, puis un interrupteur par mode — un mode éteint ne
 *   s'ouvre par aucun rôle ;
 * - par société : son rôle, choisi dans la liste. « Aucun » le retire de la
 *   société ; « Aucun » partout, sans Paramétrage, lui retire tout accès.
 */
export default function PrincipalPermissionsModal({
  principal,
  currentApp,
  current,
  companies,
  onClose,
  onSaved,
}: PrincipalPermissionsModalProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [app, setApp] = useState<AppPermissions>(defaultAppPermissions);
  // Le rôle choisi pour chaque société, par identifiant de société.
  const [choix, setChoix] = useState<Record<number, string | null>>({});
  const [charge, setCharge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!principal) return;
    setCharge(false);
    setError(null);
    setApp(currentApp);
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
        app,
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
      title={`Permissions — ${principal?.name ?? ""}`}
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {/* Le même espacement que les fiches des tiroirs : « xl » entre deux
          champs, et le libellé de Mantine au-dessus de chacun. */}
      <Stack gap="xl">
        {error && (
          <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>
        )}

        {/* Pour l'application : ce qui ne dépend d'aucune société. La même
            liste que les sociétés, sans ligne d'ajout. */}
        {charge && (
          <Input.Wrapper label="Pour l'application">
            <ListItems maxRows={MODES.length + 1}>
              <ListItems.Row>
                <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                  Paramétrage
                </Text>
                <Select
                  aria-label="Paramétrage"
                  data={SETTINGS_ACCESS.map((a) => ({
                    value: a.value || PARAMETRAGE_AUCUN,
                    label: a.label,
                  }))}
                  value={app.settings || PARAMETRAGE_AUCUN}
                  onChange={(value) =>
                    setApp((a) => ({
                      ...a,
                      settings: (value === PARAMETRAGE_AUCUN ? "" : value) as SettingsAccess,
                    }))
                  }
                  allowDeselect={false}
                  variant="unstyled"
                  size="sm"
                  w={LARGEUR_ROLE}
                  styles={CHOIX_STYLES}
                />
              </ListItems.Row>
              {MODES.map((m) => (
                <ListItems.Row key={m.value}>
                  <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                    {m.label}
                  </Text>
                  <Switch
                    aria-label={m.label}
                    color="teal"
                    checked={app.modes.includes(m.value)}
                    onChange={(e) => {
                      const ouvert = e.currentTarget.checked;
                      setApp((a) => ({
                        ...a,
                        // Dans l'ordre des modes, quel que soit l'ordre des clics.
                        modes: MODES.map((x) => x.value).filter((x) =>
                          x === m.value ? ouvert : a.modes.includes(x),
                        ),
                      }));
                    }}
                  />
                </ListItems.Row>
              ))}
            </ListItems>
          </Input.Wrapper>
        )}

        {/* Par sociétés : une société par ligne, son rôle au bout. */}
        {charge && (
          <Input.Wrapper label="Par sociétés">
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
                    variant="unstyled"
                    size="sm"
                    w={LARGEUR_ROLE}
                    styles={CHOIX_STYLES}
                  />
                </ListItems.Row>
              ))}
            </ListItems>
          </Input.Wrapper>
        )}

        {/* L'écart de la pile (« xl ») suffit : les boutons tombent à la même
            distance que dans les autres fenêtres (MODAL_PADDING). */}
        <Group justify="flex-end">
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
