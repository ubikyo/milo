import { Button, Group, Input, Modal, Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert";
import ListItems from "../ui/ListItems";
import { messageErreur } from "../../lib/errors";
import { SETTINGS_ACCESS, WIDGET_ACCESS, WIDGET_KINDS, defaultAppPermissions } from "@milo/shared";
import type {
  AppPermissions,
  EntraPrincipal,
  PrincipalAssignments,
  SettingsAccess,
  WidgetAccess,
} from "@milo/shared";
import BoutonFermer from "../ui/BoutonFermer";

// Le choix de la permission, au bout de la ligne : de quoi lire « Modifier ».
const LARGEUR_CHOIX = 200;

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
const AUCUN = "aucun";

/** Les choix d'un Select, « Aucun » compris sous sa propre valeur. */
const choix = (options: readonly { value: string; label: string }[]) =>
  options.map((o) => ({ value: o.value || AUCUN, label: o.label }));

interface PrincipalPermissionsModalProps {
  /** L'utilisateur ou le groupe dont on règle les permissions ; « null » ferme la fenêtre. */
  principal: EntraPrincipal | null;
  /** Ses permissions actuelles : aucune pour qui arrive de l'annuaire. */
  currentApp: AppPermissions;
  onClose: () => void;
  /** Les accès de tous, tels que le serveur les rend après l'enregistrement. */
  onSaved: (liste: PrincipalAssignments[]) => void;
}

/**
 * Les permissions d'un utilisateur ou d'un groupe Entra, communes à toutes les
 * sociétés : le Paramétrage (Aucun, Voir ou Modifier), puis une permission par
 * type de widget (Aucun, Lire ou Modifier), qui vaut pour le widget comme pour
 * ses données. Rien nulle part lui retire tout accès.
 */
export default function PrincipalPermissionsModal({
  principal,
  currentApp,
  onClose,
  onSaved,
}: PrincipalPermissionsModalProps) {
  const [app, setApp] = useState<AppPermissions>(defaultAppPermissions);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Les permissions actuelles ne se relisent qu'à l'ouverture : une relecture
  // de la liste pendant qu'on choisit effacerait les choix en cours.
  useEffect(() => {
    if (!principal) return;
    setError(null);
    setApp(currentApp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal]);

  const enregistrer = async () => {
    if (!principal) return;
    setError(null);
    setSaving(true);
    try {
      onSaved(await api.setAssignments(principal, app));
      onClose();
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  /** Une ligne de la liste : son nom, et le choix de sa permission au bout. */
  const ligne = (
    nom: string,
    options: readonly { value: string; label: string }[],
    valeur: string,
    onChange: (valeur: string) => void,
  ) => (
    <ListItems.Row key={nom}>
      <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
        {nom}
      </Text>
      <Select
        aria-label={nom}
        data={choix(options)}
        value={valeur || AUCUN}
        onChange={(value) => onChange(value === AUCUN || !value ? "" : value)}
        allowDeselect={false}
        variant="unstyled"
        size="sm"
        w={LARGEUR_CHOIX}
        styles={CHOIX_STYLES}
      />
    </ListItems.Row>
  );

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
        {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

        <Input.Wrapper label="Pour l'application">
          <ListItems maxRows={1}>
            {ligne("Paramétrage", SETTINGS_ACCESS, app.settings, (valeur) =>
              setApp((a) => ({ ...a, settings: valeur as SettingsAccess })),
            )}
          </ListItems>
        </Input.Wrapper>

        {/* Un type de widget par ligne, sa permission au bout. */}
        <Input.Wrapper label="Par type de widget">
          <ListItems maxRows={WIDGET_KINDS.length}>
            {WIDGET_KINDS.map((k) =>
              ligne(k.label, WIDGET_ACCESS, app.widgets[k.value], (valeur) =>
                setApp((a) => ({
                  ...a,
                  widgets: { ...a.widgets, [k.value]: valeur as WidgetAccess },
                })),
              ),
            )}
          </ListItems>
        </Input.Wrapper>

        {/* L'écart de la pile (« xl ») suffit : les boutons tombent à la même
            distance que dans les autres fenêtres (MODAL_PADDING). */}
        <Group justify="flex-end">
          <BoutonFermer onClick={onClose} />
          <Button color="teal" onClick={enregistrer} loading={saving}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
