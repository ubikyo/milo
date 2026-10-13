import { Input } from "@mantine/core";
import type { LabelsBase } from "@milo/shared";
import { useContext } from "react";
import { CopyPasteContext } from "./CopyPasteActions";
import { DrawerRegistrationsContext } from "./IndicatorDrawer";
import { useListRef } from "../../lib/list-ref";
import LabelGroupsEditor from "./LabelGroupsEditor";

// A list widget's labels, in its drawer — "Tâches", "Projets", "Assets",
// "Tickets"… —, gathered in their groups (LabelGroupsEditor). They are not
// its configuration but its own data (lib/list-ref.tsx): they go with
// "Sauvegarder", like the categories.

type Kind =
  | "task-labels"
  | "project-labels"
  | "managed-device-asset-labels"
  | "unmanaged-device-asset-labels"
  | "application-asset-labels"
  | "contact-labels"
  | "product-labels"
  | "order-labels"
  | "warehouse-labels"
  | "location-labels"
  | "support-labels";

const KINDS: Record<Kind, { base: LabelsBase; hint?: string }> = {
  "task-labels": {
    base: "/labels",
  },
  "project-labels": {
    base: "/project-labels",
  },
  "managed-device-asset-labels": {
    base: "/managed-device-asset-labels",
    hint: "Une étiquette nommée comme le tag d'un poste s'affiche sur ce poste.",
  },
  "unmanaged-device-asset-labels": {
    base: "/unmanaged-device-asset-labels",
  },
  "application-asset-labels": {
    base: "/application-asset-labels",
  },
  "contact-labels": {
    base: "/contact-labels",
  },
  "product-labels": {
    base: "/product-labels",
  },
  "order-labels": {
    base: "/order-labels",
  },
  "warehouse-labels": {
    base: "/warehouse-labels",
  },
  "location-labels": {
    base: "/location-labels",
  },
  "support-labels": {
    base: "/support-labels",
  },
};

export default function LabelGroupFields({ kind }: { kind: Kind }) {
  const s = KINDS[kind];
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();

  if (!list || !register) return null;

  return (
    <Input.Wrapper
      label="Étiquettes"
      description={s.hint}
      styles={{ description: { paddingBottom: s.hint ? 20 : 0 } }}
    >
      <LabelGroupsEditor
        base={s.base}
        list={list}
        register={register}
        // A paste from the "Actions" menu changes the list: it is re-read.
        version={board?.pastes ?? 0}
      />
    </Input.Wrapper>
  );
}
