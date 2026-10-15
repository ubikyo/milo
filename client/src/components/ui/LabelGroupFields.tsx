import {
  DECLARED_ASSET_DEFAULT_LABELS,
  PROJECT_PRIORITY_GROUP,
  PROJECT_PRIORITY_LABELS,
  SUPPORT_CHANNEL_GROUP,
  SUPPORT_CHANNEL_LABELS,
  SUPPORT_URGENCY_GROUP,
  SUPPORT_URGENCY_LABELS,
} from "@milo/shared";
import type { LabelsBase } from "@milo/shared";
import { useContext } from "react";
import { CopyPasteContext } from "./CopyPasteActions";
import { DrawerRegistrationsContext } from "./IndicatorDrawer";
import { useListRef } from "../../lib/list-ref";
import LabelGroupsEditor from "./LabelGroupsEditor";
import type { LabelDefaults } from "./LabelGroupsEditor";

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

// "defaults": the labels the server gives a new widget (repositories/list-seeds.ts),
// which its title offers to put back.
const KINDS: Record<Kind, { base: LabelsBase; hint?: string; defaults?: LabelDefaults }> = {
  "task-labels": {
    base: "/labels",
  },
  "project-labels": {
    base: "/project-labels",
    defaults: [{ group: PROJECT_PRIORITY_GROUP, labels: PROJECT_PRIORITY_LABELS }],
  },
  "managed-device-asset-labels": {
    base: "/managed-device-asset-labels",
    hint: "Une étiquette nommée comme le tag d'un poste s'affiche sur ce poste.",
  },
  "unmanaged-device-asset-labels": {
    base: "/unmanaged-device-asset-labels",
    defaults: DECLARED_ASSET_DEFAULT_LABELS.unmanaged_device_asset,
  },
  "application-asset-labels": {
    base: "/application-asset-labels",
    defaults: DECLARED_ASSET_DEFAULT_LABELS.application_asset,
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
    defaults: [
      { group: SUPPORT_URGENCY_GROUP, labels: SUPPORT_URGENCY_LABELS },
      { group: SUPPORT_CHANNEL_GROUP, labels: SUPPORT_CHANNEL_LABELS },
    ],
  },
};

export default function LabelGroupFields({ kind }: { kind: Kind }) {
  const s = KINDS[kind];
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();

  if (!list || !register) return null;

  return (
    <LabelGroupsEditor
      label="Étiquettes"
      description={s.hint}
      defaults={s.defaults}
      base={s.base}
      list={list}
      register={register}
      // A paste from the "Actions" menu changes the list: it is re-read.
      version={board?.pastes ?? 0}
    />
  );
}
