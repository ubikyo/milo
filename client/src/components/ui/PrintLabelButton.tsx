import { ActionIcon, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPrinter } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { Id, LabelTemplate, LabelTemplateKind, LabelTestPrint, ListRef } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";

// An asset's label, printed from its widget's templates of the kind (Settings,
// "Modèles d'impression"): with a single template, the click prints it; with
// several, it opens their list. Without any, there is nothing to show.
// A green button, at the head of a supervised device's summary as in the
// right section of a declared asset's field. A location's place prints its
// own (LocationDrawer): its templates read once for all its places, its print
// given.

interface PrintLabelButtonProps {
  kind: LabelTemplateKind;
  /** The list widget whose templates are offered. */
  list: ListRef;
  assetId: Id;
  /** The button's size: the height of what it stands beside. */
  size?: number;
  /** The templates, already read: they are not read again. */
  templates?: LabelTemplate[];
  /** Prints the template of this name, instead of the asset's label. */
  print?: (name: string) => Promise<LabelTestPrint>;
}

export default function PrintLabelButton({
  kind,
  list,
  assetId,
  size,
  templates: given,
  print: printWith,
}: PrintLabelButtonProps) {
  const [read, setTemplates] = useState<LabelTemplate[]>([]);
  const [printing, setPrinting] = useState(false);
  const templates = given ?? read;

  useEffect(() => {
    if (given) return;
    let current = true;
    api
      .getLabelTemplates(kind, list)
      .then((list) => current && setTemplates(list.templates))
      .catch((e) => current && notifyError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [kind, list, given]);

  const print = async (name: string) => {
    setPrinting(true);
    try {
      const sent = await (printWith ? printWith(name) : api.printAssetLabel(kind, assetId, name));
      notifications.show({
        color: "teal",
        title: "Étiquette envoyée",
        message: `« ${name} » imprimée sur « ${sent.printer} ».`,
      });
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setPrinting(false);
    }
  };

  if (templates.length === 0) return null;

  const button = (onClick?: () => void) => (
    <ActionIcon
      variant="filled"
      color="green"
      size={size ?? "md"}
      radius="sm"
      loading={printing}
      onClick={onClick}
      aria-label="Imprimer l'étiquette"
      title="Imprimer l'étiquette"
    >
      <IconPrinter size={size && size > 28 ? 20 : 16} />
    </ActionIcon>
  );

  const [only] = templates;
  if (templates.length === 1 && only) return button(() => void print(only.name));

  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>{button()}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Imprimer l'étiquette</Menu.Label>
        {templates.map((t) => (
          <Menu.Item
            key={t.name}
            leftSection={<IconPrinter size={14} />}
            onClick={() => void print(t.name)}
          >
            {t.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
