import dayjs from "dayjs";
import { useMemo } from "react";
import type { AccessMailFolderCounts, MailMetric } from "@milo/shared";
import { api } from "../../../api";
import { useSources } from "../../../lib/sources";
import { FoldersField, colorOfFolder, ownerName, pendingOf, useMailRead } from "../../m365/mail-counts";
import type { IndicatorSource, SourceContext } from "../types";

// What the mailboxes give the indicators: the folders the Mail widgets named
// read — or those chosen in the drawer —, each with its counts, which
// Exchange keeps; the e-mails received today and those flagged, which Graph
// counts. No e-mail is read.

/** A folder and its counts; its name says whose it is when several mailboxes are read. */
type Folder = AccessMailFolderCounts["folders"][number] & { label: string };

/** A count Graph makes itself, summed over the folders read: "Nombre" only. */
const remote = (metric: MailMetric) =>
  function useRemoteTotal({ widgetId, config }: SourceContext): number | null {
    const state = useMailRead(
      widgetId,
      config,
      // The start of the viewer's day: "today" is theirs, not the server's.
      () => api.getMailCount(widgetId, metric, dayjs().startOf("day").toISOString()),
      metric,
    );
    return state.phase === "ready" ? state.data.value : null;
  };

export const mailSource: IndicatorSource<Folder> = {
  data: "mail",
  label: "E-mails",
  sourceType: "mail",
  unit: "e-mails",
  none: "Aucun e-mail",
  useItems: function useFolders({ widgetId, config }) {
    const state = useMailRead(widgetId, config, () => api.getMailFolderCounts(widgetId), "");
    return useMemo(() => {
      if (state.phase !== "ready") return null;
      const { folders } = state.data;
      const several = new Set(folders.map((f) => f.owner)).size > 1;
      return folders.map((f) => ({ ...f, label: several ? `${ownerName(f.owner)} · ${f.name}` : f.name }));
    }, [state]);
  },
  usePending: function usePending({ config }) {
    // Without a Mail widget, or one that reads no mailbox: nothing will come.
    const sources = useSources("mail", config);
    return pendingOf({ phase: "loading", orphan: sources.length === 0, empty: false });
  },
  measures: [
    { value: "unread", label: "E-mails non lus", weight: (f) => f.unread },
    { value: "total", label: "E-mails au total", weight: (f) => f.total },
    { value: "today", label: "E-mails reçus aujourd'hui", weight: () => 0, useTotal: remote("today") },
    { value: "flagged", label: "E-mails avec indicateur", weight: () => 0, useTotal: remote("flagged") },
  ],
  dimensions: [
    {
      value: "folders",
      label: "Dossiers",
      // The bin and the junk e-mail in red, the inbox, sent items and drafts in green, the others in blue.
      ownColors: true,
      useSlicer: () => ({
        slices: (f: Folder) => [{ key: `${f.owner}|${f.id}`, name: f.label, color: colorOfFolder(f.kind) }],
      }),
    },
  ],
  Config: FoldersField,
};
