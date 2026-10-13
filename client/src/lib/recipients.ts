// Who a support request's or an order's messages went to, and who sent them:
// an actor among them stays an actor — the thread shows what they were sent.

/** A message sent, or to be: its status and its addresses, joined by ", ". */
interface SentMessage {
  mail_status?: string;
  mail_to?: string;
  mail_cc?: string;
  mail_bcc?: string;
  /** Who sent it. */
  author?: { id: number } | null;
}

const isSent = (m: SentMessage): boolean => m.mail_status === "sent" || m.mail_status === "simulated";

/** The addresses, in lower case, of the messages that went out — or would have, simulated. */
export const sentAddresses = (messages: SentMessage[]): Set<string> =>
  new Set(
    messages
      .filter(isSent)
      .flatMap((m) => [m.mail_to ?? "", m.mail_cc ?? "", m.mail_bcc ?? ""].join(",").split(","))
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  );

/** The ids of those who sent a message that went out. */
export const senderIds = (messages: SentMessage[]): string[] => [
  ...new Set(messages.filter(isSent).flatMap((m) => (m.author ? [String(m.author.id)] : []))),
];

/** The ids of those, among these, a message went to. */
export const lockedIds = (
  people: { id: number | string; email: string }[],
  addresses: Set<string>,
): string[] => people.filter((p) => p.email && addresses.has(p.email.toLowerCase())).map((p) => String(p.id));
