import { Button, Group, Input, Modal, Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ListItems from "../ui/ListItems";
import { errorMessage, notifyError } from "../../lib/errors";
import type { EntraPrincipal } from "@milo/shared";
import CloseButton from "../ui/CloseButton";

// Le choix de la permission, au bout de la ligne : de quoi lire « Modifier ».
const CHOICE_WIDTH = 200;

// Hauteur du champ : celle du texte, comme le renommage d'une ligne
// (LookupManager).
const FIELD_HEIGHT = 22;

// Le choix sans cadre, à la hauteur du texte, aligné à droite : il tient dans
// sa ligne, comme le renommage d'une société.
const CHOICE_STYLES = {
  input: {
    height: FIELD_HEIGHT,
    minHeight: FIELD_HEIGHT,
    lineHeight: `${FIELD_HEIGHT}px`,
    textAlign: "right" as const,
  },
};

// « Aucun » ne peut pas être la valeur vide d'un Select : il lui faut la sienne.
const NONE = "none";

/** Les choix d'un Select, « Aucun » compris sous sa propre valeur. */
const choice = (options: readonly { value: string; label: string }[]) =>
  options.map((o) => ({ value: o.value || NONE, label: o.label }));

/** Une permission : son nom, et le choix de sa valeur au bout de la ligne. */
export interface PermissionRow {
  name: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** Elle se lit sans se changer. */
  disabled?: boolean;
  /** Sa largeur quand elle se règle à même la ligne (PrincipalsPermissions). */
  width?: number;
}

/** Des permissions qui vont ensemble, sous un libellé. */
export interface SectionPermissions {
  label: string;
  rows: PermissionRow[];
}

interface PrincipalPermissionsModalProps<T> {
  /** L'utilisateur ou le groupe dont on règle les permissions ; « null » ferme la fenêtre. */
  principal: EntraPrincipal | null;
  /** Ses permissions actuelles : aucune pour qui arrive de l'annuaire. */
  initial: T;
  /** Les sections de la fenêtre, pour les permissions en cours de choix. */
  sections: (permissions: T, change: (permissions: T) => void) => SectionPermissions[];
  /** Enregistre ; un refus garde la fenêtre ouverte. */
  onSave: (permissions: T) => Promise<void>;
  onClose: () => void;
}

/**
 * Les permissions d'un utilisateur ou d'un groupe Entra : une liste par
 * section, une permission par ligne, son choix au bout. Ce qu'elles sont —
 * les types de widgets d'un workspace, l'administration de l'application —,
 * l'appelant le dit (`sections`).
 */
export default function PrincipalPermissionsModal<T>({
  principal,
  initial,
  sections,
  onSave,
  onClose,
}: PrincipalPermissionsModalProps<T>) {
  const [permissions, setPermissions] = useState<T>(initial);
  const [saving, setSaving] = useState(false);

  // Les permissions actuelles ne se relisent qu'à l'ouverture : une relecture
  // de la liste pendant qu'on choisit effacerait les choix en cours.
  useEffect(() => {
    if (!principal) return;
    setPermissions(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal]);

  const save = async () => {
    if (!principal) return;
    setSaving(true);
    try {
      await onSave(permissions);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /** Une ligne de la liste : son nom, et le choix de sa permission au bout. */
  const row = ({ name, options, value, onChange, disabled }: PermissionRow) => (
    <ListItems.Row key={name}>
      <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
        {name}
      </Text>
      <Select
        aria-label={name}
        data={choice(options)}
        value={value || NONE}
        onChange={(value) => onChange(value === NONE || !value ? "" : value)}
        allowDeselect={false}
        disabled={disabled}
        variant="unstyled"
        size="sm"
        w={CHOICE_WIDTH}
        styles={CHOICE_STYLES}
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
        {sections(permissions, setPermissions).map((section) => (
          <Input.Wrapper key={section.label} label={section.label}>
            <ListItems maxRows={section.rows.length}>{section.rows.map(row)}</ListItems>
          </Input.Wrapper>
        ))}

        {/* L'écart de la pile (« xl ») suffit : les boutons tombent à la même
            distance que dans les autres fenêtres (MODAL_PADDING). */}
        <Group justify="flex-end">
          <CloseButton onClick={onClose} />
          <Button color="teal" onClick={save} loading={saving}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
