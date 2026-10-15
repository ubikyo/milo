import { Badge, Group, Input, Stack, Text } from "@mantine/core";
import { IconTemplate } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { WIDGET_MAIL_TEMPLATE_KEYS } from "@milo/shared";
import type { MailTemplate, MailTemplateKey } from "@milo/shared";
import { api } from "../../api";
import type { ListRef } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import { RowButton, rowStyle } from "../ui/DrawerRows";
import { Reset } from "../ui/SettingRows";
import MailTemplateModal from "./MailTemplateModal";

// The e-mails Milo sends, one row each, and the button that opens its MJML
// template. The list is fixed: there is nothing to add or delete. The
// widgets' e-mails are set from their drawer, as this list ("only"): the
// Tickets', the Tâches', the Calendar's and the Mail's.

// As the references' tags (ReferenceTag).
const TAG_HEIGHT = 20;

interface MailTemplatesProps {
  canEdit: boolean;
  /** The templates listed; by default, all but the widgets'. */
  only?: readonly MailTemplateKey[];
  /** The Tickets widget whose own templates these are; without one, the Settings'. */
  list?: ListRef | null;
}

export default function MailTemplates({ canEdit, only, list }: MailTemplatesProps) {
  const [all, setAll] = useState<MailTemplate[]>([]);
  const templates = all.filter((t) =>
    only ? only.includes(t.key) : !WIDGET_MAIL_TEMPLATE_KEYS.includes(t.key),
  );
  const [editedKey, setEditedKey] = useState<MailTemplateKey | null>(null);
  const [toReset, setToReset] = useState<MailTemplate | null>(null);

  const reset = async (template: MailTemplate) => {
    setToReset(null);
    try {
      setAll(await api.updateMailTemplate(template.key, "", list));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  useEffect(() => {
    api.getMailTemplates(list).then(setAll, (e) => notifyError(errorMessage(e)));
  }, [list]);

  const edited = templates.find((t) => t.key === editedKey) ?? null;

  return (
    // In the Settings, their editable lists' look ("Formulaire" > "Liste").
    <Input.Wrapper label="Modèles d'e-mail" data-settings-list>
      <Stack gap={1}>
        {templates.map((t, rank) => (
          // As the appearance rows (SettingRows): at the start, the button
          // that goes back to Milo's own — green once the template is modified.
          <Group
            key={t.key}
            gap="sm"
            wrap="nowrap"
            style={rowStyle(rank, templates.length, false, "simple")}
          >
            <Reset active={canEdit && t.custom} what="du modèle" onClick={() => setToReset(t)} />
            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" truncate data-row-name>
                {t.label}
              </Text>
              {t.custom && (
                <Badge color="green" variant="filled" radius="sm" h={TAG_HEIGHT} data-list-tag="filled">
                  Modifié
                </Badge>
              )}
            </Group>
            <RowButton icon={IconTemplate} onClick={() => setEditedKey(t.key)} rightMargin={0}>
              Modèle
            </RowButton>

          </Group>
        ))}
      </Stack>

      <MailTemplateModal
        template={edited}
        onClose={() => setEditedKey(null)}
        onSave={async (mjml) => {
          if (!edited) return;
          setAll(await api.updateMailTemplate(edited.key, mjml, list));
        }}
        canEdit={canEdit}
      />

      <DeleteConfirmModal
        opened={toReset !== null}
        onClose={() => setToReset(null)}
        onConfirm={() => toReset && void reset(toReset)}
        title="Réinitialiser le modèle"
        message={`Le modèle « ${toReset?.label ?? ""} » reprendra sa version d'origine. Ses modifications seront perdues.`}
        confirmLabel="Réinitialiser"
      />
    </Input.Wrapper>
  );
}
