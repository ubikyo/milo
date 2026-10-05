import { supportReplyValues } from "@milo/shared";
import type { SupportPerson, SupportStatus } from "@milo/shared";

// What a support template's preview fills its variables with: the signed-in
// account for "Utilisateur" — whoever previews is whoever will write —, and
// for the sender and the request, values drawn at random but that hold
// together: the sender's address follows their name, the status follows the
// event that sends the reply.

const FIRST_NAMES = ["Claire", "Paul", "Sophie", "Julien", "Camille", "Thomas", "Léa", "Nicolas", "Emma", "Hugo"];
const LAST_NAMES = ["Martin", "Durand", "Bernard", "Petit", "Robert", "Richard", "Moreau", "Laurent", "Garnier", "Faure"];
const SUBJECTS = [
  "Imprimante en panne",
  "Accès VPN impossible",
  "Mot de passe expiré",
  "Écran qui ne s'allume plus",
  "Demande de nouveau poste",
  "Boîte aux lettres pleine",
  "Logiciel à installer",
  "Lenteurs sur le réseau",
];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

/** "Léa" → "lea": an address keeps neither accents nor spaces. */
const addressPart = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();

/**
 * The status of the request a reply is sent for: its event's when it is one
 * — a reopened request is open again —; otherwise one where the team writes.
 */
const statusFor = (event: string | null | undefined): SupportStatus => {
  if (event === "reopened") return "open";
  if (event === "new" || event === "open" || event === "pending" || event === "resolved" || event === "closed") {
    return event;
  }
  return pick(["new", "open", "pending"] as const);
};

const emptyPerson = (): SupportPerson => ({
  first_name: "",
  last_name: "",
  full_name: "",
  email: "",
  phone: "",
  mobile: "",
  job_title: "",
  department: "",
  company: "",
  street_address: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
});

export interface SupportSample {
  /** The template variables: "ticket.number" → "HLP-142". */
  values: Record<string, string>;
  /** The request, for the e-mail template that lays the reply out. */
  ticket: string;
  subject: string;
}

/**
 * The request a default content is previewed in, and the team's reply it
 * goes into: a fixed text, the same at each opening.
 */
export const DEFAULT_CONTENT_SUBJECT = "La physique des cordes";
const DEFAULT_CONTENT_REPLY =
  "<p>La théorie des cordes propose que les particules fondamentales soient en réalité de minuscules cordes vibrantes, dont chaque vibration correspond à une particule différente. Elle cherche notamment à unifier la mécanique quantique et la relativité générale au sein d’un même cadre théorique. Bien qu’encore non confirmée expérimentalement, elle constitue une piste majeure pour mieux comprendre les lois fondamentales de l’Univers.</p>";

/** A default content after the reply's text, whatever its event. */
export const inSampleReply = (content: string): string => DEFAULT_CONTENT_REPLY + content;

/** A sample for the preview of a reply sent on "event" — or of a default content. */
export const supportSample = (
  user: SupportPerson | null,
  event?: string | null,
  /** The request's subject; drawn at random by default. */
  subject?: string,
): SupportSample => {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const sender: SupportPerson = {
    ...emptyPerson(),
    first_name: first,
    last_name: last,
    full_name: `${first} ${last}`,
    email: `${addressPart(first)}.${addressPart(last)}@exemple.fr`,
  };
  const request = {
    number: 1 + Math.floor(Math.random() * 999),
    subject: subject ?? pick(SUBJECTS),
    status: statusFor(event),
  };
  const values = supportReplyValues({ user, sender, request });
  return { values, ticket: values["ticket.number"] ?? "", subject: request.subject };
};
