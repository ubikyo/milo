import { IconDeviceLaptop, IconNetwork } from "@tabler/icons-react";
import { useListRef } from "../../lib/list-ref";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { MANAGED_DEVICE_ASSET_MODEL_MAX, VLAN_NAME_MAX } from "@milo/shared";
import type { ManagedDeviceAssetSettings } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import type { Column, Row } from "../ui/EditableRows";

// The open board's managed device asset tables, in the drawer of an "Assets" widget:
// - "Modèles": the commercial name of the identifier a workstation reports —
//   Apple only reports "Mac14,6";
// - "VLAN": the VLAN carrying each subnet ("10.1.106.0/24" → 106).
// They are not widget settings but board data, shared by all its managed
// device asset widgets: they go with "Sauvegarder", like the asset labels
// (LabelGroupFields). They are lists with several fields per row
// (EditableRows).
// VLANs can also be pasted in batches into an added row: one
// "subnet VLAN name" line each, the name optional — or imported from a CSV
// file ("Importer un CSV").


/** The width of the identifier column. */
const IDENTIFIER_WIDTH = 160;

/** The width of the subnet column. */
const SUBNET_WIDTH = 150;

/** Enough for "4094". */
const VLAN_LENGTH = 4;

/** The width of the VLAN number column. */
const VLAN_WIDTH = 50;

const MODEL_COLUMNS: Column[] = [
  {
    label: "Identifiant",
    maxLength: MANAGED_DEVICE_ASSET_MODEL_MAX,
    width: IDENTIFIER_WIDTH,
  },
  { label: "Nom commercial", maxLength: MANAGED_DEVICE_ASSET_MODEL_MAX },
];

// The subnet on the right, after the name.
const VLAN_COLUMNS: Column[] = [
  {
    label: "VLAN",
    maxLength: VLAN_LENGTH,
    width: VLAN_WIDTH,
    digital: true,
  },
  { label: "Nom", maxLength: VLAN_NAME_MAX, optional: true },
  { label: "Sous-réseau", maxLength: 18, width: SUBNET_WIDTH },
];

/**
 * "10.1.106.0/24 106 Wi-Fi invités": the subnet, the VLAN, then the optional
 * name — separated by spaces, a tab, a ";" or a ",".
 */
const VLAN_ROW = /^(\S+\/\d+)[\s;,]+(\d+)(?:[\s;,]+(.*))?$/;

const splitVlan = (row: string): Row | null => {
  const m = VLAN_ROW.exec(row);
  if (!m) return null;
  return [m[2] ?? "", (m[3] ?? "").trim(), m[1] ?? ""];
};

/**
 * The cells of a CSV text: its lines, each cut at the delimiter — ";" if the
 * first line holds one outside quotes, "," otherwise. A cell may be quoted,
 * a quote doubled inside it ("Salle ""A""").
 */
const csvCells = (text: string): string[][] => {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.replace(/"[^"]*"/g, "").includes(";") ? ";" : ",";
  const lines: string[][] = [];
  let line: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      line.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line.push(cell);
      lines.push(line);
      line = [];
      cell = "";
    } else cell += c;
  }
  line.push(cell);
  lines.push(line);
  return lines.map((l) => l.map((v) => v.trim())).filter((l) => l.some(Boolean));
};

/**
 * A VLAN CSV: "VLAN, intitulé, sous-réseau" on each line, the name optional.
 * A first line whose VLAN is not a number is a header, skipped. An
 * unreadable line stops everything: its message comes back instead.
 */
const readVlanCsv = (text: string): Row[] | string => {
  const lines = csvCells(text.replace(/^\uFEFF/, ""));
  const read: Row[] = [];
  for (const [rank, cells] of lines.entries()) {
    const [vlan = "", name = "", subnet = ""] = cells;
    if (!/^\d+$/.test(vlan) || !subnet) {
      if (rank === 0) continue;
      return `Ligne ${rank + 1} illisible : « ${cells.join(" ; ")} »`;
    }
    read.push([vlan, name.slice(0, VLAN_NAME_MAX), subnet]);
  }
  return read.length > 0 ? read : "Aucun VLAN dans ce fichier";
};

/** Nothing recorded yet: the models come from the server, the VLANs are empty. */
const NOTHING: ManagedDeviceAssetSettings = { models: [], vlans: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function ManagedDeviceAssetTablesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<ManagedDeviceAssetSettings>(NOTHING);
  const [settings, setSettings] = useState<ManagedDeviceAssetSettings>(NOTHING);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      const read = await api.getManagedDeviceAssetSettings(list);
      setOriginal(read);
      setSettings(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": only the changed tables go, each whole. The server checks
  // them; an error stops the drawer's save, the draft kept.
  const state = useRef({ original, settings });
  useEffect(() => {
    state.current = { original, settings };
  }, [original, settings]);
  useEffect(() => {
    if (!register || list === null) return;
    return register(async () => {
      const { original: before, settings: after } = state.current;
      const data: Partial<ManagedDeviceAssetSettings> = {};
      if (!same(before.models, after.models)) data.models = after.models;
      if (!same(before.vlans, after.vlans)) data.vlans = after.vlans;
      if (data.models === undefined && data.vlans === undefined) return;
      const saved = await api.updateManagedDeviceAssetSettings(list, data);
      setOriginal(saved);
      setSettings(saved);
    });
  }, [register, list]);

  if (list === null || !register) return null;

  /** A table changes in the draft only: "Sauvegarder" sends it. */
  const save = async (data: Partial<ManagedDeviceAssetSettings>): Promise<boolean> => {
    setSettings((before) => ({ ...before, ...data }));
    return true;
  };

  return (
    <>
      <ListRows
        title="Modèles"
        description="Ils donnent le nom commercial de l'identifiant que déclare un poste."
        columns={MODEL_COLUMNS}
        rows={settings.models.map((m) => [m.identifier, m.name])}
        save={(list) =>
          save({
            models: list.map(([identifier = "", name = ""]) => ({
              identifier,
              name,
            })),
          })
        }
        emptyIcon={IconDeviceLaptop}
        emptyText="Aucun modèle"
        addLabel="Ajouter un modèle"
        deleteTitle="Supprimer le modèle"
        several={(n) => pluralize(n, "modèle")}
      />
      <ListRows
        title="VLAN"
        description="Chacun nomme le VLAN qui porte un sous-réseau."
        columns={VLAN_COLUMNS}
        rows={settings.vlans.map((v) => [String(v.vlan), v.name, v.subnet])}
        save={(list) =>
          save({
            vlans: list.map(([vlan = "", name = "", subnet = ""]) => ({
              subnet,
              vlan: Number(vlan),
              name,
            })),
          })
        }
        emptyIcon={IconNetwork}
        emptyText="Aucun VLAN"
        addLabel="Ajouter un VLAN"
        deleteTitle="Supprimer le VLAN"
        // "VLAN" does not take an "s".
        several={(n) => `${n} VLAN`}
        split={splitVlan}
        readCsv={readVlanCsv}
      />
    </>
  );
}
