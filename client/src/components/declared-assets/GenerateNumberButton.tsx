import { ActionIcon, Menu } from "@mantine/core";
import { IconWand } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { AssetNumberTemplate, DeclaredAssetKind, Label, ListRef } from "@milo/shared";
import { api } from "../../api";
import { runAssetNumberCode } from "../../lib/assetNumber";
import { errorMessage, notifyError } from "../../lib/errors";

// An asset's number, drawn from its widget's asset number templates of the
// kind (the list widget's drawer, "Formats de numéro d'asset"): with a single
// template, the click runs it; with several, it opens their list. Without
// any, there is nothing to show. Each "{{label.Groupe}}" takes the labels
// chosen in the form in that group — several, one after the other —, as the
// printed label does. Beside the print button, in the asset field.

interface GenerateNumberButtonProps {
  kind: DeclaredAssetKind;
  /** The list widget whose templates are offered. */
  list: ListRef;
  /** The labels chosen in the form, with their group's name. */
  labels: Label[];
  onGenerated: (number: string) => void;
  disabled?: boolean;
}

/** Each group's value: its chosen labels, one after the other, by group in lower case. */
const valuesOf = (labels: Label[]): Map<string, string> => {
  const values = new Map<string, string[]>();
  for (const label of labels) {
    const group = (label.group_name ?? "").trim().toLowerCase();
    values.set(group, [...(values.get(group) ?? []), label.name]);
  }
  return new Map([...values].map(([group, names]) => [group, names.join(", ")]));
};

export default function GenerateNumberButton({
  kind,
  list,
  labels,
  onGenerated,
  disabled,
}: GenerateNumberButtonProps) {
  const [templates, setTemplates] = useState<AssetNumberTemplate[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .getAssetNumberTemplates(kind, list)
      .then((list) => current && setTemplates(list.templates))
      .catch((e) => current && notifyError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [kind, list]);

  const generate = async (template: AssetNumberTemplate) => {
    setRunning(true);
    try {
      const run = await runAssetNumberCode(template.code, valuesOf(labels));
      if (run.error !== null || run.result === null) {
        notifyError(`Format « ${template.name} » : ${run.error ?? "aucun numéro renvoyé"}`);
      } else {
        onGenerated(run.result);
      }
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  if (templates.length === 0) return null;

  const button = (onClick?: () => void) => (
    <ActionIcon
      variant="filled"
      color="green"
      radius="sm"
      loading={running}
      disabled={disabled}
      onClick={onClick}
      aria-label="Générer un numéro d'asset"
      title="Générer un numéro d'asset"
    >
      <IconWand size={16} />
    </ActionIcon>
  );

  const [only] = templates;
  if (templates.length === 1 && only) return button(() => void generate(only));

  return (
    <Menu position="bottom-end" withinPortal shadow="md" disabled={disabled}>
      <Menu.Target>{button()}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Générer un numéro d'asset</Menu.Label>
        {templates.map((t) => (
          <Menu.Item key={t.name} leftSection={<IconWand size={14} />} onClick={() => void generate(t)}>
            {t.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
