// The templates for Milo's e-mails.
//
// This is not ordinary HTML. Mail clients share neither CSS variables, nor
// external style sheets, nor flex or grid layout: we are back to tables and
// styles placed on every tag, as twenty years ago. MJML writes those tables:
// each e-mail has its template in MJML, which the Settings can modify
// ("Notifications"). Its variables — {{title}}, {{intro}}… — are filled in by
// Mustache, which escapes them, then MJML compiles the whole into HTML.
// Colors are written in hard-coded form, whereas the app draws them from the
// theme — this is the only place in the code where this duplication is
// justified.
//
// The look is that of the app's windows: the item's name, its facts, the
// button, then a rule and the logo at the foot. The logo is attached to the
// message and cited by "cid:" — a remote image is blocked by default by most
// clients.

import mjml2html from "mjml";
import Mustache from "mustache";
import type { MailTemplate, MailTemplateKey, MailTemplatePreview, MailTemplateVariable } from "@milo/shared";
import { MAIL_TEMPLATE_KEYS } from "@milo/shared";
import {
  LOGO_CID,
  LOGO_DARK_CID,
  LOGO_HEIGHT_PX,
  LOGO_WIDTH_PX,
  attachedDarkLogo,
  attachedLogo,
} from "./mail-logo.js";
import { badRequest } from "./http.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

/** Milo's colors, frozen: see the explanation at the top of the file. */
const RULE = "#dee2e6";
const TEXT = "#212529";
const DIMMED = "#868e96";
const GREEN = "#099268";

/** The message's inset, the same on all four sides. */
const INSET = "30px";

/** A reported fact, and the number of times it repeated in a row. */
export interface Row {
  text: string;
  repetitions: number;
}

export interface Message {
  /** What is displayed large: the item's name. */
  title: string;
  /** The sentence that introduces it. */
  intro: string;
  /** What happened, one line per fact. Optional. */
  rows?: Row[];
  /** The button, if there is something to open. */
  action?: { url: string; label: string };
  /** The fine print, at the very bottom. */
  footer: string;
}

const withRepeats = (row: Row): string =>
  row.repetitions > 1 ? `${row.text} (${row.repetitions} fois)` : row.text;

/**
 * The text version. It is not a stopgap: it is what text-mode clients and
 * screen readers that prefer it read, and it is what stays readable when the
 * HTML is blocked. It does not come from the template.
 */
const toText = (m: Message): string =>
  [
    m.intro,
    "",
    ...(m.rows ?? []).map((row) => `  — ${withRepeats(row)}`),
    ...(m.rows?.length ? [""] : []),
    ...(m.action ? [`${m.action.label} : ${m.action.url}`, ""] : []),
    m.footer,
    "",
  ].join("\n");

// --- The templates ----------------------------------------------------------

/** A notice's template Milo comes with: its facts and its button only where it has them. */
const defaultMjml = ({ rows, action }: { rows: boolean; action: boolean }): string => `<mjml lang="fr">
  <mj-head>
    <mj-title>{{title}}</mj-title>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="14px" line-height="1.5" color="${TEXT}" padding="0" />
    </mj-attributes>
  </mj-head>
  <mj-body>
    <mj-section padding="${INSET}">
      <mj-column>
        <mj-text font-size="17px" font-weight="600" padding-bottom="4px">{{title}}</mj-text>
        <mj-text color="${DIMMED}"${rows ? ' padding-bottom="16px"' : ""}>{{intro}}</mj-text>${
          rows
            ? `
        {{#rows}}
        <mj-text padding-bottom="8px"><span style="color:${GREEN};padding-right:8px">&#8212;</span>{{text}}</mj-text>
        {{/rows}}`
            : ""
        }${
          action
            ? `
        {{#action}}
        <mj-button href="{{url}}" align="left" padding="24px 0 0 0" inner-padding="12px 22px"
                   background-color="${GREEN}" border-radius="6px" font-size="14px" font-weight="600">{{label}}</mj-button>
        {{/action}}`
            : ""
        }
      </mj-column>
    </mj-section>
    <!-- The footer: a rule, then the logo, a space and the name. -->
    <mj-section padding="0 ${INSET}">
      <mj-column>
        <mj-divider border-width="1px" border-color="${RULE}" padding="0" />
      </mj-column>
    </mj-section>
    <mj-section padding="16px ${INSET} ${INSET} ${INSET}">
      <mj-column>
        <mj-text font-size="12px" color="${DIMMED}">
          <img src="{{logo}}" alt="" width="${LOGO_WIDTH_PX}" height="${LOGO_HEIGHT_PX}"
               style="border:0;width:${LOGO_WIDTH_PX}px;height:${LOGO_HEIGHT_PX}px;vertical-align:middle" />&nbsp;<span style="vertical-align:middle">Milo</span>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

// The Tickets widget's templates, as set up in its drawer: the logo, a
// title, the message, a rule.

/**
 * A confirmation code's template: the logo, a heading, why the code comes,
 * then the code, large. That of the reception addresses, set up in the
 * Tickets widget, and of the Calendar's and Mail's people.
 */
const confirmationMjml = (title: string, heading: string, text: string): string => `<mjml>
  <mj-head>
    <mj-title>${title}</mj-title>

    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="#333333" line-height="1.5" />
      <mj-text padding="10px 25px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image src="{{logo}}" align="left" width="80px"/>

        <mj-text padding="30px 25px 15px 25px" color="#333333">
          <h1 style="margin: 0;">${heading}</h1>
        </mj-text>

        <mj-text padding="0 25px 10px 25px" color="#333333">
          <p style="margin: 0;">${text}</p>
        </mj-text>

        <mj-text padding="10px 25px" align="left" font-size="36px" color="#333333" font-family="Helvetica, sans-serif">
          <p style="margin: 0;">{{code}}</p>
        </mj-text>

        <mj-divider border-width="1px" border-style="solid" />
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/** The code a reception address receives. */
const CONFIRMATION_MJML = confirmationMjml(
  "Confirmation adresse e-mail",
  "Confirmation de votre adresse e-mail",
  "Vous recevez ce message car vous avez ajouté votre adresse e-mail dans Milo. Pour confirmer votre adresse, utilisez le code suivant.",
);

/** A team reply: the request's subject as its title. */
const REPLY_MJML = `<mjml>
  <mj-head>
    <mj-title>Confirmation adresse e-mail</mj-title>

    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="#333333" line-height="1.5" />
      <mj-text padding="10px 25px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image src="{{logo}}" align="left" width="80px"/>

        <mj-text padding="30px 25px 15px 25px" color="#333333">
          <h1 style="margin: 0;">{{ticket.subject}}</h1>
        </mj-text>

        <mj-text padding="0 25px 10px 25px" color="#333333">
          <p style="margin: 0;">{{model.content}}</p>
        </mj-text>

        <mj-divider border-width="1px" border-style="solid" />
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/** An automatic reply: its name as its title. */
const AUTO_REPLY_MJML = `<mjml>
  <mj-head>
    <mj-title>Confirmation adresse e-mail</mj-title>

    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="#333333" line-height="1.5" />
      <mj-text padding="10px 25px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image src="{{logo}}" width="80px" align="left" />

        <mj-text padding="30px 25px 15px 25px" color="#333333">
          <h1 style="margin: 0;">{{model.name}}</h1>
        </mj-text>

        <mj-text padding="0 25px 10px 25px" color="#333333">
          <p style="margin: 0;">{{model.content}}</p>
        </mj-text>

        <mj-divider border-width="1px" border-style="solid" />
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

// One logo: its dark-background variant is added after compilation (withDarkLogo).
const LOGO: MailTemplateVariable[] = [{ group: "Message", label: "Logo", name: "{{logo}}" }];
const COMMON: MailTemplateVariable[] = [
  { group: "Message", label: "Titre", name: "{{title}}" },
  { group: "Message", label: "Introduction", name: "{{intro}}" },
  ...LOGO,
];
const CONFIRMATION: MailTemplateVariable[] = [
  ...LOGO,
  { group: "Confirmation", label: "Adresse e-mail", name: "{{email}}" },
  { group: "Confirmation", label: "Code", name: "{{code}}" },
];
const SHARING: MailTemplateVariable[] = [
  ...CONFIRMATION,
  { group: "Partage", label: "Demandeur", name: "{{requester}}" },
  { group: "Partage", label: "Bloc du tableau", name: "{{#board}}…{{/board}}" },
  { group: "Partage", label: "Tableau", name: "{{board}}" },
];
const SHARING_SAMPLE = {
  email: "claire.martin@exemple.fr",
  code: "4821",
  requester: "Paul Durand",
  board: "Équipe",
};
// A block repeats — or shows — what it encloses; its variables live inside.
const ROWS: MailTemplateVariable[] = [
  { group: "Lignes", label: "Bloc des lignes", name: "{{#rows}}…{{/rows}}" },
  { group: "Lignes", label: "Texte", name: "{{text}}" },
];
const ACTION: MailTemplateVariable[] = [
  { group: "Bouton", label: "Bloc du bouton", name: "{{#action}}…{{/action}}" },
  { group: "Bouton", label: "Lien", name: "{{url}}" },
  { group: "Bouton", label: "Libellé", name: "{{label}}" },
];
// The message's HTML is kept as is: a reply's values are escaped before
// Mustache sees them (replyViewOf), which then escapes nothing.
const REPLY: MailTemplateVariable[] = [
  { group: "Modèle", label: "Message", name: "{{model.content}}" },
  { group: "Demande", label: "Numéro", name: "{{ticket.number}}" },
  { group: "Demande", label: "Objet", name: "{{ticket.subject}}" },
  ...LOGO,
];
const REPLY_NAME: MailTemplateVariable = { group: "Modèle", label: "Nom du modèle", name: "{{model.name}}" };

/**
 * The variables of a reply's template as first named — "{{{content}}}",
 * "{{ticket}}"… —, and today's: a template saved before reads as if written
 * with the new ones.
 */
const LEGACY_REPLY_VARIABLES: [RegExp, string][] = [
  [/\{\{\{\s*content\s*\}\}\}/g, "{{model.content}}"],
  [/\{\{\s*content\s*\}\}/g, "{{model.content}}"],
  [/\{\{\s*name\s*\}\}/g, "{{model.name}}"],
  [/\{\{\s*ticket\s*\}\}/g, "{{ticket.number}}"],
  [/\{\{\s*subject\s*\}\}/g, "{{ticket.subject}}"],
];
const withCurrentVariables = (mjml: string): string =>
  LEGACY_REPLY_VARIABLES.reduce((text, [legacy, current]) => text.replace(legacy, current), mjml);

/** What a reply's template is filled with; "name" is an automatic reply's. */
export type ReplyView = {
  content: string;
  ticket: string;
  subject: string;
  name?: string;
};

/**
 * The message as the editor shows it: paragraphs without margins — Enter
 * starts a line, not a spaced paragraph —, and an empty one as a blank line.
 * A mail client gives each paragraph its own margins: the empty ones the
 * editor uses as spacing would double every gap.
 */
const asEdited = (content: string): string =>
  content
    .replace(/<p(\s[^>]*)?>\s*<\/p>/g, (_m, attrs: string = "") => `<p${attrs}>&nbsp;</p>`)
    .replace(/<p(\s[^>]*)?>/g, (_m, attrs: string = "") =>
      /\bstyle="/.test(attrs)
        ? `<p${attrs.replace(/\bstyle="/, 'style="margin:0;')}>`
        : `<p${attrs} style="margin:0">`,
    );

/** A reply's view, escaped — the message's HTML apart. */
const replyViewOf = (r: ReplyView) => ({
  model: { content: asEdited(r.content), name: Mustache.escape(r.name ?? "") },
  ticket: { number: Mustache.escape(r.ticket), subject: Mustache.escape(r.subject) },
});

interface Definition {
  label: string;
  description: string;
  variables: MailTemplateVariable[];
  /** The template Milo comes with. */
  mjml: string;
  /** What the preview is filled with, the logo apart. */
  sample: Record<string, unknown>;
  /** Its values come escaped: Mustache leaves them as they are (replyViewOf). */
  raw?: boolean;
  /** The sample signed by whoever previews it — a team reply's. */
  signedSample?: (signer: string) => Record<string, unknown>;
}

/** What a message's template is filled with. */
const viewOf = (m: Message) => ({
  title: m.title,
  intro: m.intro,
  rows: (m.rows ?? []).map((row) => ({ text: withRepeats(row) })),
  action: m.action ?? false,
  footer: m.footer,
});

/** A notice's template: its facts and its button only where it has them. */
const notice = (
  label: string,
  description: string,
  { rows, action }: { rows: boolean; action: boolean },
  sample: Message,
): Definition => ({
  label,
  description,
  variables: [...COMMON, ...(rows ? ROWS : []), ...(action ? ACTION : [])],
  mjml: defaultMjml({ rows, action }),
  sample: viewOf(sample),
});

/**
 * A support reply's template. Its sample message is written as in the
 * editor: a paragraph per line, an empty one between them; "signer" signs it
 * — whoever previews it, or a sample name.
 */
const reply = (
  label: string,
  description: string,
  content: (signer: string) => string,
  /** An automatic reply's own: the name of the reply it lays out. */
  name?: string,
): Definition => {
  const sampleOf = (signer: string) =>
    replyViewOf({ content: content(signer), ticket: "HLP-12", subject: "Imprimante en panne", name });
  return {
    label,
    description,
    variables: name === undefined ? REPLY : [...REPLY, REPLY_NAME],
    mjml: name === undefined ? REPLY_MJML : AUTO_REPLY_MJML,
    sample: sampleOf("Paul Durand"),
    raw: true,
    signedSample: sampleOf,
  };
};

/** Lines as the editor writes them: a paragraph each, an empty one between. */
const spaced = (...lines: string[]): string =>
  lines.map((line) => `<p>${Mustache.escape(line)}</p>`).join("<p></p>");

const SAMPLE_LINK = { url: "https://milo.example/", label: "Ouvrir dans Milo" };

const DEFINITIONS: Record<MailTemplateKey, Definition> = {
  changes: notice(
    "Ajout ou modification d'un élément",
    "Les ajouts et les modifications d'un élément suivi, un à un ou regroupés.",
    { rows: true, action: true },
    {
      title: "Refonte du site",
      intro: "2 modifications :",
      rows: [
        { text: "Claire Martin a commenté la tâche", repetitions: 1 },
        { text: "Paul Durand a modifié l'échéance", repetitions: 2 },
      ],
      action: SAMPLE_LINK,
      footer: "Vous recevez ce message parce que vous suivez cet élément dans Milo, ou que vous en êtes acteur.",
    },
  ),
  linked: notice(
    "Affectation d'un acteur à un élément",
    "Une personne est ajoutée comme acteur d'un projet ou d'une carte, ou à un élément de checklist.",
    { rows: false, action: true },
    {
      title: "Refonte du site",
      intro: "Claire Martin vous a ajouté à ce projet.",
      action: SAMPLE_LINK,
      footer: "Vous recevez ce message parce que vous avez été ajouté à cet élément dans Milo.",
    },
  ),
  reminder: notice(
    "Rappel d'échéance",
    "Le rappel envoyé aux acteurs d'une tâche avant son échéance.",
    { rows: false, action: true },
    {
      title: "Préparer la maquette",
      intro: "Milo vous rappelle l'échéance du 5 octobre à 17:00.",
      action: SAMPLE_LINK,
      footer: "Vous recevez ce message parce que vous êtes acteur de cette tâche dans Milo.",
    },
  ),
  assignment: notice(
    "Demande assignée",
    "Une ou plusieurs demandes de support assignées à une personne.",
    { rows: true, action: true },
    {
      title: "Demandes assignées",
      intro: "Claire Martin vous a assigné ces 2 demandes :",
      rows: [
        { text: "#142 — Imprimante en panne", repetitions: 1 },
        { text: "#143 — Accès VPN", repetitions: 1 },
      ],
      action: SAMPLE_LINK,
      footer: "Vous recevez ce message parce qu'un ticket vous a été assigné dans Milo.",
    },
  ),
  // Its texts are written in the template: only the address and the code vary.
  mailbox_confirmation: {
    label: "Confirmation d'une adresse de réception",
    description: "Le code qui confirme une boîte dont Milo relève les e-mails.",
    variables: CONFIRMATION,
    mjml: CONFIRMATION_MJML,
    sample: { email: "support@exemple.fr", code: "4821" },
  },
  support_reply: reply(
    "Réponse à une demande",
    "La réponse de l'équipe, envoyée depuis la boîte de support dans la conversation de l'e-mail d'origine.",
    (signer) =>
      spaced("Bonjour Claire,", "Nous avons remplacé le toner : l'imprimante fonctionne de nouveau.", signer),
  ),
  support_auto_reply: reply(
    "Réponse automatique",
    "La réponse envoyée automatiquement à l'expéditeur par un évènement : prise en charge, clôture…",
    () =>
      spaced(
        "Bonjour Claire,",
        "Votre demande a bien été reçue : nous la traitons dans les meilleurs délais.",
        "L'équipe support",
      ),
    "Accusé de réception",
  ),
  // As a reception address's; the Calendar's and the Mail's — as set up in
  // their widgets — only say what the code is for.
  calendar_confirmation: {
    label: "Confirmation d'une adresse",
    description: "Le code demandé à une personne dont un widget Calendrier affiche le calendrier.",
    variables: SHARING,
    mjml: confirmationMjml(
      "Partage de votre calendrier",
      "Partage de votre calendrier",
      "Pour terminer la configuration de votre calendrier dans Milo, utilisez le code suivant :",
    ),
    sample: SHARING_SAMPLE,
  },
  mail_confirmation: {
    label: "Confirmation d'une adresse",
    description: "Le code demandé à une personne dont un widget Mail lit la boîte.",
    variables: SHARING,
    mjml: confirmationMjml(
      "Partage de votre boîte aux lettres",
      "Partage de votre boîte aux lettres",
      "Pour terminer la configuration de votre adresse e-mail dans Milo, utilisez le code suivant :",
    ),
    sample: SHARING_SAMPLE,
  },
  test: notice(
    "Message de test",
    "Envoyé depuis Paramétrage → Entra pour vérifier l'envoi.",
    { rows: false, action: false },
    {
      title: "Message de test",
      intro: "Ce message confirme l'envoi par Milo depuis milo@exemple.fr.",
      footer: "Envoyé depuis Paramétrage → Entra.",
    },
  ),
};

const defaultOf = (key: MailTemplateKey): string => DEFINITIONS[key].mjml;

const SETTING = "mail_templates";

/** The templates modified in the Settings; the others are Milo's own. */
const customized = (): Partial<Record<MailTemplateKey, string>> => {
  const saved = readSetting<Partial<Record<MailTemplateKey, string>>>(SETTING, {});
  for (const key of ["support_reply", "support_auto_reply"] as const) {
    const mjml = saved[key];
    if (mjml !== undefined) saved[key] = withCurrentVariables(mjml);
  }
  return saved;
};

export const mailTemplates = (): MailTemplate[] => {
  const custom = customized();
  return MAIL_TEMPLATE_KEYS.map((key) => {
    const d = DEFINITIONS[key];
    return {
      key,
      label: d.label,
      description: d.description,
      variables: d.variables,
      mjml: custom[key] ?? d.mjml,
      custom: custom[key] !== undefined,
    };
  });
};

// --- Compilation ------------------------------------------------------------

/** The logos as the message cites them: attached, by their identifier. */
const LOGO_SRC = `cid:${LOGO_CID}`;
const DARK_LOGO_SRC = `cid:${LOGO_DARK_CID}`;

const DARK_LOGO_STYLE = `<style>@media (prefers-color-scheme: dark) {
  .logo-light { display: none !important; }
  .logo-dark { display: inline-block !important; }
}</style>`;

/**
 * Each logo the template places, doubled with its dark-background variant:
 * a client in dark mode shows the second, the others the first — Outlook,
 * which reads no media query, never sees the second ("mso-hide"). A template
 * thus cites one logo, and is right in both themes.
 */
const withDarkLogo = (html: string): string => {
  const logo = new RegExp(`<img\\b[^>]*\\bsrc="${LOGO_SRC}"[^>]*>`, "g");
  let found = false;
  const doubled = html.replace(logo, (tag) => {
    found = true;
    const classed = (cls: string, img: string) =>
      /\bclass="/.test(img)
        ? img.replace(/\bclass="/, `class="${cls} `)
        : img.replace(/^<img\b/, `<img class="${cls}"`);
    const hidden = /\bstyle="/.test(tag)
      ? tag.replace(/\bstyle="([^"]*)"/, (_m, css: string) => `style="${css.replace(/;?\s*$/, "")};display:none;mso-hide:all"`)
      : tag.replace(/^<img\b/, '<img style="display:none;mso-hide:all"');
    return classed("logo-light", tag) + classed("logo-dark", hidden.replace(LOGO_SRC, DARK_LOGO_SRC));
  });
  return found ? doubled.replace("</head>", `${DARK_LOGO_STYLE}</head>`) : html;
};

/** In the preview, the logos are drawn from the page: there is no attachment. */
const dataUri = (png: Buffer): string => `data:image/png;base64,${png.toString("base64")}`;
const inPreview = (html: string): string =>
  html
    .replaceAll(`"${DARK_LOGO_SRC}"`, `"${dataUri(attachedDarkLogo())}"`)
    .replaceAll(`"${LOGO_SRC}"`, `"${dataUri(attachedLogo())}"`);

/** The template filled in and compiled; what MJML objected to comes back with it. */
const compile = async (
  mjml: string,
  view: Record<string, unknown>,
  raw = false,
): Promise<MailTemplatePreview> => {
  let filled: string;
  try {
    filled = Mustache.render(mjml, view, {}, raw ? { escape: (text: string) => text } : undefined);
  } catch (error) {
    return { html: "", errors: [error instanceof Error ? error.message : "Variable mal formée"] };
  }
  try {
    const result = await mjml2html(filled, { validationLevel: "soft", keepComments: false });
    return { html: withDarkLogo(result.html), errors: result.errors.map((e) => e.formattedMessage) };
  } catch (error) {
    return { html: "", errors: [error instanceof Error ? error.message : "MJML invalide"] };
  }
};

/**
 * The template's HTML. A modified template that no longer compiles gives way
 * to Milo's own: the e-mail still goes out.
 */
const render = async (key: MailTemplateKey, view: Record<string, unknown>): Promise<string> => {
  const custom = customized()[key];
  const { raw } = DEFINITIONS[key];
  if (custom !== undefined) {
    const compiled = await compile(custom, view, raw);
    if (compiled.html && !compiled.errors.length) return compiled.html;
    console.error(`Mail template "${key}" invalid, Milo's own used instead:`, compiled.errors);
  }
  return (await compile(defaultOf(key), view, raw)).html;
};

export const previewMailTemplate = async (
  key: MailTemplateKey,
  mjml: string,
  /** Whoever previews it: a team reply's sample is signed with their name. */
  signer = "",
): Promise<MailTemplatePreview> => {
  const { sample, signedSample } = DEFINITIONS[key];
  const compiled = await compile(
    key === "support_reply" || key === "support_auto_reply" ? withCurrentVariables(mjml) : mjml,
    { ...(signer && signedSample ? signedSample(signer) : sample), logo: LOGO_SRC },
    DEFINITIONS[key].raw,
  );
  return { ...compiled, html: inPreview(compiled.html) };
};

/** Saved only if it compiles without error; the empty string goes back to Milo's own. */
export const saveMailTemplate = async (key: MailTemplateKey, mjml: string): Promise<void> => {
  const custom = customized();
  if (!mjml.trim() || mjml === defaultOf(key)) delete custom[key];
  else {
    const { errors } = await previewMailTemplate(key, mjml);
    if (errors.length) badRequest(`Modèle invalide : ${errors[0]}`);
    custom[key] = mjml;
  }
  writeSetting(SETTING, custom);
};

/** An attachment, inlined in the message (Graph, "fileAttachment"). */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Cited by the HTML as "cid:": the image displays without loading anything. */
  cid: string;
}

/**
 * The two versions of the same message — HTML and text —, and the logos that
 * go with them. The caller has nothing to assemble: it passes the whole
 * thing to the send.
 */
export const template = async (
  key: MailTemplateKey,
  m: Message,
  /** The template's own variables: a confirmation's address and code. */
  extra: Record<string, string> = {},
): Promise<{ text: string; html: string; attachments: MailAttachment[] }> => ({
  text: toText(m),
  ...(await withLogos(render(key, { ...viewOf(m), ...extra, logo: LOGO_SRC }))),
});

/** The HTML, and the logos it cites — up to the closing quote: one identifier begins the other. */
const withLogos = async (rendering: Promise<string>) => {
  const html = await rendering;
  return { html, attachments: logoAttachments().filter((a) => html.includes(`cid:${a.cid}"`)) };
};

const logoAttachments = (): MailAttachment[] => [
  { filename: "milo.png", content: attachedLogo(), contentType: "image/png", cid: LOGO_CID },
  { filename: "milo-sombre.png", content: attachedDarkLogo(), contentType: "image/png", cid: LOGO_DARK_CID },
];

/** A support reply's template key. */
export type ReplyTemplateKey = "support_reply" | "support_auto_reply";

export const isReplyTemplateKey = (key: MailTemplateKey): key is ReplyTemplateKey =>
  key === "support_reply" || key === "support_auto_reply";

/**
 * A support content — a default reply, a default content being edited —
 * in the template that will lay it out, as saved: the support window's
 * preview, with the request it draws.
 */
export const previewReply = async (key: ReplyTemplateKey, reply: ReplyView): Promise<string> =>
  inPreview(await render(key, { ...replyViewOf(reply), logo: LOGO_SRC }));

/**
 * A support reply, team or automatic, laid out by its template — and the
 * logos, when the template cites them.
 */
export const replyTemplate = async (
  key: ReplyTemplateKey,
  reply: ReplyView,
): Promise<{ html: string; attachments: MailAttachment[] }> =>
  withLogos(render(key, { ...replyViewOf(reply), logo: LOGO_SRC }));
