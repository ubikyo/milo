import dayjs from "dayjs";
import { useMemo } from "react";
import { SUPPORT_STATUSES, listKey } from "@milo/shared";
import type { SupportRequest } from "@milo/shared";
import { dueState } from "../../../lib/due";
import { useConfirmedMailboxes } from "../../../lib/confirmations";
import { useSourceItems } from "../../../lib/sources";
import { MAILBOXES } from "../../../components/support/SupportRequestsList";
import { inboxesOf } from "../../../components/ui/ReceptionField";
import { CHART_COLORS } from "../../chart-colors";
import { actorsDimension, bandDimension, dueDimension, labelsDimension, plainDimension } from "../dimensions";
import type { IndicatorSource } from "../types";

// What the requests give the indicators: those of the Support lists named —
// the open board's in its context —, counted by status, actor, label,
// sender, age or due date, and dated by their receipt.

/** A resolved or closed request is waiting for nothing: neither actor nor due date. */
const ongoing = (d: SupportRequest) => d.status !== "resolved" && d.status !== "closed";

/** The addresses a Tickets list receives, as its drawer states them. */
const mailboxesOf = (config: unknown): string[] =>
  inboxesOf(config, MAILBOXES).flatMap((b) => (typeof b.email === "string" ? [b.email] : []));

/** The age bands, in days since receipt — the upper bound excluded —, and where their colors were stored. */
const AGE_BANDS = [
  { key: "colorDay", slice: "day", name: "< 1 j", upTo: 1, color: CHART_COLORS.green, what: "des tickets de moins d'un jour" },
  { key: "colorDays", slice: "days", name: "1–3 j", upTo: 3, color: CHART_COLORS.green, what: "des tickets de 1 à 3 jours" },
  { key: "colorWeek", slice: "week", name: "3–7 j", upTo: 7, color: CHART_COLORS.yellow, what: "des tickets de 3 à 7 jours" },
  { key: "colorMonth", slice: "month", name: "7–30 j", upTo: 30, color: CHART_COLORS.orange, what: "des tickets de 7 à 30 jours" },
  { key: "colorOlder", slice: "older", name: "> 30 j", upTo: Infinity, color: CHART_COLORS.red, what: "des tickets de plus de 30 jours" },
];

/** The statuses, in their order: the radar's branches. */
const STATUS_BANDS = SUPPORT_STATUSES.map((s) => ({
  key: `color_${s.value}`,
  slice: s.value,
  name: s.label,
  color: CHART_COLORS.green,
  what: `des tickets « ${s.label} »`,
}));

export const supportSource: IndicatorSource<SupportRequest> = {
  data: "support",
  label: "Tickets",
  sourceType: "support.list",
  unit: "tickets",
  none: "Aucun ticket",
  // Like the list itself, only what its confirmed addresses receive: a ticket
  // from an address since removed — or not yet confirmed — no longer counts;
  // one entered by hand counts as long as the list receives.
  useItems: function useRequests({ sources, board }) {
    const items = useSourceItems("support", sources, board.requests);
    const confirmed = useConfirmedMailboxes(
      sources.map((s) => ({ list: listKey(s.config), emails: mailboxesOf(s.config) })),
    );
    return useMemo(() => {
      if (!items || !confirmed) return null;
      const receiving = new Set([...confirmed].map((k) => k.split("\n")[0]));
      return items.filter((d) => {
        const mailbox = d.mailbox.trim().toLowerCase();
        return mailbox ? confirmed.has(`${d.list_key}\n${mailbox}`) : receiving.has(d.list_key);
      });
    }, [items, confirmed]);
  },
  measures: [
    // Named like the Statut column's filter; "ongoing" stays the value saved by the widgets.
    { value: "ongoing", label: "Tickets non résolus", weight: (d) => (ongoing(d) ? 1 : 0) },
    { value: "open", label: "Tickets ouverts", weight: (d) => (d.status === "open" ? 1 : 0) },
    { value: "pending", label: "Tickets en attente", weight: (d) => (d.status === "pending" ? 1 : 0) },
    {
      value: "unassigned",
      label: "Tickets non assignés",
      weight: (d) => (ongoing(d) && d.actors.length === 0 ? 1 : 0),
    },
    {
      value: "mine",
      label: "Tickets qui me sont attribués",
      weight: (d, { userId }) => (ongoing(d) && d.actors.some((a) => a.id === userId) ? 1 : 0),
    },
    { value: "closed", label: "Tickets fermés", weight: (d) => (d.status === "closed" ? 1 : 0) },
    { value: "resolved", label: "Tickets résolus", weight: (d) => (d.status === "resolved" ? 1 : 0) },
    {
      value: "late",
      label: "Tickets en retard",
      weight: (d) => (ongoing(d) && dueState(d.due_date) === "late" ? 1 : 0),
    },
    { value: "total", label: "Tickets au total", weight: () => 1 },
  ],
  dimensions: [
    bandDimension("status", "Statuts", STATUS_BANDS, (d) => d.status, { ownColors: false, parts: undefined }),
    actorsDimension("actors", "Acteurs", (d) => d.actors),
    labelsDimension("/support-labels", "support.list", (d) => d.labels),
    // A sender is recognized by their address; a request entered by hand has none.
    plainDimension("senders", "Demandeurs", (d) => {
      const address = d.sender_email.trim().toLowerCase();
      return address ? [{ key: address, name: d.sender_name.trim() || address }] : [];
    }),
    bandDimension("age", "Ancienneté", AGE_BANDS, (d) => {
      const age = dayjs().diff(dayjs(d.created_at), "day", true);
      return AGE_BANDS.find((b) => age < b.upTo)?.slice ?? null;
    }),
    dueDimension((d) => d.due_date),
  ],
  dates: [{ value: "created", label: "Date de réception", title: "Tickets reçus", of: (d) => d.created_at }],
};
