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
import { MAIL_TEMPLATE_KEYS, PALETTE, systemTheme, themeColorHex } from "@milo/shared";
import {
  LOGO_CID,
  LOGO_DARK_CID,
  LOGO_HEIGHT_PX,
  LOGO_WIDTH_PX,
  attachedDarkLogo,
  attachedLogo,
} from "./mail-logo.js";
import { sendingAddress } from "./entra.js";
import { badRequest } from "./http.js";
import { miloUrl } from "./milo-url.js";
import { themes } from "./theme-colors.js";
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
  /** The text version, when the caller writes it — several elements in one e-mail. */
  text?: string;
}

const withRepeats = (row: Row): string =>
  row.repetitions > 1 ? `${row.text} (${row.repetitions} fois)` : row.text;

/**
 * The text version. It is not a stopgap: it is what text-mode clients and
 * screen readers that prefer it read, and it is what stays readable when the
 * HTML is blocked. It does not come from the template.
 */
const toText = (m: Message): string =>
  m.text ?? [
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
          <img src="{{milo.logo}}" alt="" width="${LOGO_WIDTH_PX}" height="${LOGO_HEIGHT_PX}"
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
        <mj-image src="{{milo.logo}}" align="left" width="80px"/>

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

/** The code a person whose calendar a Calendar widget shows receives. */
const CALENDAR_CONFIRMATION_MJML = `<mjml>
  <mj-head>
    <mj-title>Partage de votre calendrier</mj-title>

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
          <h1 style="margin: 0;">Partage de votre calendrier</h1>
        </mj-text>

        <mj-text padding="0 25px 10px 25px" color="#333333">
          <p style="margin: 0;">Pour terminer la configuration de votre calendrier dans Milo, utilisez le code suivant :</p>
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
        <mj-image src="{{milo.logo}}" align="left" width="80px"/>

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
        <mj-image src="{{milo.logo}}" width="80px" align="left" />

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

const COMMON: MailTemplateVariable[] = [
  { group: "Message", label: "Titre", name: "{{title}}" },
  { group: "Message", label: "Introduction", name: "{{intro}}" },
];
const CONFIRMATION: MailTemplateVariable[] = [
  { group: "Confirmation", label: "Adresse e-mail", name: "{{email}}" },
  { group: "Confirmation", label: "Code", name: "{{code}}" },
];
const SHARING: MailTemplateVariable[] = [
  ...CONFIRMATION,
  { group: "Partage", label: "Demandeur", name: "{{requester}}" },
  { group: "Partage", label: "Bloc du tableau", name: "{{#board}}…{{/board}}" },
  { group: "Partage", label: "Tableau", name: "{{board}}" },
];

/** The test message: its texts are written in it, only Milo varies. */
const TEST_MJML = `<mjml>
  <mj-head>
    <mj-title>Message de test</mj-title>

    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="{{colors.text}}" line-height="1.5" />
      <mj-text padding="10px 25px" color="{{colors.text}}" />
      <mj-button background-color="{{colors.green}}" color="{{colors.text}}" border-radius="4px" font-size="14px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image src="{{milo.logo}}" align="left" width="80px"/>

        <mj-text padding="30px 25px 15px 25px">
          <h1 style="margin: 0;">{{template.title}}</h1>
        </mj-text>

        <mj-text padding="0 25px 10px 25px">
          <p style="margin: 0;">Test de l'envoi d'un message depuis {{milo.email}}</p>
        </mj-text>
        <mj-button href="{{milo.url}}" align="left">Ouvrir Milo</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

// Every template's: its own title, as its <mj-title> writes it — to repeat
// it in the body without writing it twice.
const TEMPLATE: MailTemplateVariable[] = [{ group: "Modèle", label: "Titre", name: "{{template.title}}" }];

// Every template's last two sources: Milo — its logo, its sending address,
// its own address —, and its main colors, as the "Thèmes" section sets them.
// One logo: its dark-background variant is added after compilation
// (withDarkLogo). "{{logo}}", its former name, still fills a template saved
// with it (logo, in each view).
const MILO: MailTemplateVariable[] = [
  { group: "Milo", label: "Logo", name: "{{milo.logo}}" },
  { group: "Milo", label: "Adresse d'envoi", name: "{{milo.email}}" },
  { group: "Milo", label: "Adresse de Milo", name: "{{milo.url}}" },
];

/**
 * The colors a template can draw from, on the light theme: a message's
 * background is white, whatever the theme of whoever sent it. The four of
 * the palette, then the base ones by their key in the themes.
 */
const COLORS: { name: string; label: string; key?: string; value?: string }[] = [
  { name: "green", label: "Vert", value: PALETTE.green },
  { name: "red", label: "Rouge", value: PALETTE.red },
  { name: "orange", label: "Orange", value: PALETTE.orange },
  { name: "blue", label: "Bleu", value: PALETTE.blue },
  { name: "text", label: "Texte", key: "text" },
  { name: "dimmed", label: "Texte atténué", key: "dimmed" },
  { name: "strong", label: "Texte fort", key: "strong-text" },
  { name: "background", label: "Fond de page", key: "body" },
  { name: "field", label: "Fond des champs", key: "default" },
  { name: "border", label: "Bordures", key: "default-border" },
  { name: "divider", label: "Filets", key: "divider" },
];
const COLOR_VARIABLES: MailTemplateVariable[] = COLORS.map((c) => ({
  group: "Couleurs",
  label: c.label,
  name: `{{colors.${c.name}}}`,
}));

/**
 * What every template is filled with besides its own: read at each send, a
 * change in the Settings applies to the next message. A raw template's
 * values come escaped (replyViewOf).
 */
const commonView = (raw = false) => {
  // The e-mails are light: the system's light theme colors them.
  const stored = systemTheme(themes(), "light").colors;
  const escaped = (text: string) => (raw ? Mustache.escape(text) : text);
  return {
    milo: { logo: LOGO_SRC, email: escaped(sendingAddress()), url: escaped(miloUrl()) },
    colors: Object.fromEntries(
      COLORS.map((c) => [c.name, c.value ?? themeColorHex(stored, c.key!, "light")]),
    ),
  };
};
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
// The changes' own: the list of modifications, and one of them, inside.
const UPDATES: MailTemplateVariable[] = [
  { group: "Modifications", label: "Liste des modifications", name: "{{#updates.items}}…{{/updates.items}}" },
  { group: "Modifications", label: "Modification", name: "{{updates.item}}" },
];

/**
 * The modifications as their template reads them. Each one carries its text
 * under the same name: inside the block, "{{updates.item}}" is that
 * modification's.
 */
export const updatesView = (rows: Row[]) => ({
  items: rows.map((row) => ({ updates: { item: withRepeats(row) } })),
});

/** "Une modification", "3 modifications". */
export const modificationsLabel = (n: number): string => (n === 1 ? "Une modification" : `${n} modifications`);

/** An element of the changes' e-mail, where it sits — each level by an identifier and a name. */
export interface PlacedElement {
  /** As {{#elements.items}} repeats it: {{element.…}}, {{updates.…}}. */
  item: { element: ElementView; updates: ReturnType<typeof updatesView> };
  /** Its modifications, one per line listed — a repeat is on its line. */
  total: number;
  /**
   * One key per level, from the workspace to the widget — two widgets of the
   * same name stay apart; a type of widget is the same everywhere: "card".
   */
  keys: Record<PlaceLevel, string>;
}

/** The levels the changes' e-mail can group by, from the outermost. */
const PLACE_LEVELS = ["workspace", "view", "board", "widgetType", "widget"] as const;
type PlaceLevel = (typeof PLACE_LEVELS)[number];

/** Each level's list in the template: {{#views.items}}… */
const LEVEL_LISTS: Record<PlaceLevel, string> = {
  workspace: "workspaces",
  view: "views",
  board: "boards",
  widgetType: "widgetTypes",
  widget: "widgets",
};

/** A level's name, from the element: its workspace, its view… */
const levelName = (e: ElementView, level: PlaceLevel): string =>
  level === "widgetType" ? e.widgetType : e[level];

/**
 * The elements grouped by each level below "from", in the order of their
 * first modification: {{#workspaces.items}} repeats each workspace, with
 * {{workspace.name}} and {{workspace.updates.count}}, and inside it every deeper
 * list — {{#views.items}}, {{#boards.items}}… — of that workspace's elements
 * alone. A level can thus be skipped: from the root, {{#widgetTypes.items}}
 * groups the whole e-mail by type of widget. Every group ends with its own
 * {{#elements.items}}.
 */
export const placesView = (elements: PlacedElement[], from = 0): Record<string, unknown> => {
  const view: Record<string, unknown> = { elements: { items: elements.map((e) => e.item) } };
  PLACE_LEVELS.slice(from).forEach((level, i) => {
    const groups = new Map<string, PlacedElement[]>();
    for (const e of elements) groups.set(e.keys[level], [...(groups.get(e.keys[level]) ?? []), e]);
    view[LEVEL_LISTS[level]] = {
      items: [...groups.values()].map((group) => ({
        [level]: {
          name: levelName(group[0]!.item.element, level),
          updates: { count: group.reduce((sum, e) => sum + e.total, 0) },
        },
        ...placesView(group, from + i + 1),
      })),
    };
  });
  return view;
};

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

// The element a notice is about — a project, a card, a request —, as the
// assignment's and the changes' templates name it.
// An invitation's own: who gave the access, and to what.
const INVITATION: MailTemplateVariable[] = [
  { group: "Invitation", label: "Auteur", name: "{{invitation.author}}" },
  { group: "Invitation", label: "Workspace", name: "{{invitation.workspace}}" },
];
// An administrator's: only who gave the administration.
const ADMIN_INVITATION: MailTemplateVariable[] = [
  { group: "Invitation", label: "Auteur", name: "{{invitation.author}}" },
];
// A share: the boards of a view, each with where it sits and who owns it —
// outside the list, the view's, which every board shares.
const SHARES: MailTemplateVariable[] = [
  { group: "Partages", label: "Liste des partages", name: "{{#shares.items}}…{{/shares.items}}" },
  { group: "Partages", label: "Workspace", name: "{{share.workspace}}" },
  { group: "Partages", label: "Vue", name: "{{share.view}}" },
  { group: "Partages", label: "Tableau", name: "{{share.board}}" },
  { group: "Partages", label: "Propriétaire", name: "{{share.owner}}" },
];

/** What the share's template is filled with: the view, and each board shared. */
export const sharesView = (owner: string, workspace: string, view: string, boards: string[]) => ({
  share: { owner, workspace, view },
  shares: { items: boards.map((board) => ({ share: { owner, workspace, view, board } })) },
});

/** The variables of a share's template as first named, and today's. */
const LEGACY_SHARE_VARIABLES: [RegExp, string][] = [
  [/\{\{\s*#\s*rows\s*\}\}/g, "{{#shares.items}}"],
  [/\{\{\s*\/\s*rows\s*\}\}/g, "{{/shares.items}}"],
  [/\{\{\s*text\s*\}\}/g, "{{share.board}}"],
  [/\{\{\s*invitation\.author\s*\}\}/g, "{{share.owner}}"],
  [/\{\{\s*invitation\.workspace\s*\}\}/g, "{{share.workspace}}"],
  [/\{\{\s*invitation\.view\s*\}\}/g, "{{share.view}}"],
];
const asShares = (mjml: string): string =>
  LEGACY_SHARE_VARIABLES.reduce((text, [legacy, current]) => text.replace(legacy, current), mjml);

/**
 * The share's invitation: who shared, then each board — where it sits —,
 * and the button that opens Milo.
 */
const NEW_SHARE_MJML = `<mjml>
  <mj-head>
    <mj-title>Nouveau partage !</mj-title>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="{{colors.text}}" line-height="1.5" />
      <mj-text padding="10px 25px" color="{{colors.text}}" />
      <mj-button background-color="{{colors.green}}" color="{{colors.text}}" border-radius="4px" font-size="14px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image src="{{milo.logo}}" align="left" width="80px"/>
        <mj-text padding="30px 25px 15px 25px">
          <h1 style="margin: 0;">{{ template.title }}</h1>
        </mj-text>
        <mj-text padding="0 25px 10px 25px">
          <p style="margin: 0;">Un ou plusieurs tableaux viennent de vous être partagés par {{share.owner}} :</p>
        </mj-text>
        <mj-text>
          {{#shares.items}}
          <span style="color:#099268;padding-right:8px">&#8212;</span>{{share.board}} {{share.workspace}} {{share.view}}<br>
          {{/shares.items}}
        </mj-text>
        <mj-button href="{{milo.url}}" align="left">Ouvrir Milo</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/**
 * The element's variables, its own — "{{element.activity}}" the assignment's
 * sentence, "{{element.updates.count}}" the changes' number — after its name.
 */
const elementVariables = (own: MailTemplateVariable): MailTemplateVariable[] => [
  { group: "Élément", label: "Nom", name: "{{element.name}}" },
  own,
  { group: "Élément", label: "Lien", name: "{{element.url}}" },
  { group: "Élément", label: "Workspace", name: "{{element.workspace}}" },
  { group: "Élément", label: "Vue", name: "{{element.view}}" },
  { group: "Élément", label: "Tableau", name: "{{element.board}}" },
  { group: "Élément", label: "Type de widget", name: "{{element.widgetType}}" },
  { group: "Élément", label: "Widget", name: "{{element.widget}}" },
  { group: "Élément", label: "Chemin", name: "{{element.path}}" },
];
const LINKED_ELEMENT = elementVariables({ group: "Élément", label: "Activité", name: "{{element.activity}}" });
const CHANGED_ELEMENT = elementVariables({
  group: "Élément",
  label: "Nombre de modifications",
  name: "{{element.updates.count}}",
});

// The changes' e-mail carries one element — immediate sending — or every
// element modified during the delay — grouped sending —: the list repeats
// each, and inside it, {{element.…}} and {{updates.…}} are that element's.
// Grouped, the same elements level by level: each list repeats its level —
// a workspace, a view… —, the next one inside, down to the widgets, whose
// {{#elements.items}} are theirs.
const PLACES: MailTemplateVariable[] = [
  { group: "Workspaces", label: "Liste des workspaces", name: "{{#workspaces.items}}…{{/workspaces.items}}" },
  { group: "Workspaces", label: "Nom", name: "{{workspace.name}}" },
  { group: "Workspaces", label: "Nombre de modifications", name: "{{workspace.updates.count}}" },
  { group: "Vues", label: "Liste des vues", name: "{{#views.items}}…{{/views.items}}" },
  { group: "Vues", label: "Nom", name: "{{view.name}}" },
  { group: "Vues", label: "Nombre de modifications", name: "{{view.updates.count}}" },
  { group: "Tableaux", label: "Liste des tableaux", name: "{{#boards.items}}…{{/boards.items}}" },
  { group: "Tableaux", label: "Nom", name: "{{board.name}}" },
  { group: "Tableaux", label: "Nombre de modifications", name: "{{board.updates.count}}" },
  { group: "Types de widget", label: "Liste des types", name: "{{#widgetTypes.items}}…{{/widgetTypes.items}}" },
  { group: "Types de widget", label: "Nom", name: "{{widgetType.name}}" },
  { group: "Types de widget", label: "Nombre de modifications", name: "{{widgetType.updates.count}}" },
  { group: "Widgets", label: "Liste des widgets", name: "{{#widgets.items}}…{{/widgets.items}}" },
  { group: "Widgets", label: "Nom", name: "{{widget.name}}" },
  { group: "Widgets", label: "Nombre de modifications", name: "{{widget.updates.count}}" },
];

const ELEMENTS: MailTemplateVariable[] = [
  { group: "Éléments modifiés", label: "Liste des éléments", name: "{{#elements.items}}…{{/elements.items}}" },
  { group: "Éléments modifiés", label: "Résumé", name: "{{elements.activity}}" },
];

/**
 * A notice's template as the assignment's and the changes' name their
 * variables: the element's name, activity and link. Their button is always
 * there — without Milo's address, nothing is sent —: its block goes, and its
 * label is written in it.
 * A template saved with the notice's variables reads as if written with these.
 */
const asElement = (mjml: string): string =>
  mjml
    .replace(/^[ \t]*\{\{\s*[#/]\s*action\s*\}\}[ \t]*\n/gm, "")
    .replace(/\{\{\s*[#/]\s*action\s*\}\}/g, "")
    .replace(/\{\{\s*title\s*\}\}/g, "{{element.name}}")
    .replace(/\{\{\s*intro\s*\}\}/g, "{{element.activity}}")
    .replace(/\{\{\s*url\s*\}\}/g, "{{element.url}}")
    .replace(/\{\{\s*label\s*\}\}/g, "Ouvrir dans Milo");

/** The assignment's template: the element's name, its activity, the button that opens it. */
const LINKED_MJML = `<mjml>
  <mj-head>
    <mj-title>{{element.widget}} &mdash; {{element.name}}</mj-title>

    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="{{colors.text}}" line-height="1.5" />
      <mj-text padding="10px 25px" color="{{colors.text}}" />
      <mj-button background-color="{{colors.green}}" color="{{colors.text}}" border-radius="4px" font-size="14px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image src="{{milo.logo}}" align="left" width="80px"/>

        <mj-text padding="30px 25px 15px 25px">
          <h1 style="margin: 0;">{{template.title}}</h1>
        </mj-text>

        <mj-text padding="0 25px 10px 25px">
          <p style="margin: 0;">{{element.activity}}</p>
        </mj-text>
        <mj-button href="{{element.url}}" align="left">Ouvrir Milo</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/** The changes' template as it names its modifications, a template saved with its lines included. */
const asUpdates = (mjml: string): string =>
  asElement(mjml)
    .replace(/\{\{\s*#\s*rows\s*\}\}/g, "{{#updates.items}}")
    .replace(/\{\{\s*\/\s*rows\s*\}\}/g, "{{/updates.items}}")
    .replace(/\{\{\s*text\s*\}\}/g, "{{updates.item}}")
    // Each level's number of modifications, once named "activity".
    .replace(/\{\{\s*(workspace|view|board|widgetType|widget|element)\.activity\s*\}\}/g, "{{$1.updates.count}}");

/**
 * The changes' template: its title, then each type of widget — its name and
 * number of modifications —, and under it each modification, the way to its
 * element as a link.
 */
const CHANGES_MJML = `<mjml>
  <mj-head>
    <mj-title>Ajout ou modification d'éléments</mj-title>

    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="{{colors.text}}" line-height="1.5" />
      <mj-text padding="10px 25px" color="{{colors.text}}" />
      <mj-button background-color="{{colors.green}}" color="{{colors.text}}" border-radius="4px" font-size="14px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section padding-bottom="0">
      <mj-column>
        <mj-image src="{{milo.logo}}" align="left" width="80px"/>
        <mj-text padding="30px 25px 0 25px">
          <h1 style="margin: 0;">{{template.title}}</h1>
        </mj-text>
        <mj-text padding="0 25px 0 25px">La ou les modifications suivantes ont été réalisées dans Milo.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        {{#widgetTypes.items}}
          <mj-text padding="20px 25px 20px 25px">
            <h2 style="margin: 0;">{{widgetType.name}}</h2>
            <p style="margin: 0; color: {{colors.dimmed}};">Modifications réalisées : {{widgetType.updates.count}}</p>
          </mj-text>
          {{#elements.items}}
            {{#updates.items}}
            <mj-text padding="0 0 15px 50px">
              <a href="{{element.url}}" style="color: {{colors.green}}"><span style="display: inline-block; width: 20px;">&mdash;</span>{{element.workspace}} › {{element.view}} › {{element.board}} › {{element.widget}}</a><br />
              <span style="display: inline-block; width: 20px;"></span>{{element.name}} : {{updates.item}}
            </mj-text>
            {{/updates.items}}
          {{/elements.items}}
        {{/widgetTypes.items}}
      </mj-column>
    </mj-section>      
    <mj-section padding="0 20px 20px 20px">
      <mj-column>
        <mj-button href="{{milo.url}}" align="left">Ouvrir Milo</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/**
 * The invitation to a workspace: its texts are written in it, only who gave
 * the access varies; the button opens Milo, where one signs in with Windows.
 */
const NEW_USER_MJML = `<mjml>
  <mj-head>
    <mj-title>Bienvenue dans Milo !</mj-title>

    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="{{colors.text}}" line-height="1.5" />
      <mj-text padding="10px 25px" color="{{colors.text}}" />
      <mj-button background-color="{{colors.green}}" color="{{colors.text}}" border-radius="4px" font-size="14px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image src="{{milo.logo}}" align="left" width="80px"/>
        <mj-text padding="30px 25px 15px 25px">
          <h1 style="margin: 0;">{{template.title}}</h1>
        </mj-text>
        <mj-text padding="0 25px 10px 25px">
          <p style="margin: 0;">Un accès pour Milo a été créé par {{invitation.author}}. Pour vous connecter, cliquer sur le bouton ci-dessous et utiliser vos identifiants de session Windows pour vous authentifier.</p>
        </mj-text>
        <mj-button href="{{milo.url}}" align="left">Ouvrir Milo</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/**
 * The invitation of an administrator: as a workspace's, only who gave the
 * administration varies.
 */
const NEW_ADMIN_MJML = `<mjml>
  <mj-head>
    <mj-title>Bienvenue dans Milo !</mj-title>

    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" font-size="14px" color="{{colors.text}}" line-height="1.5" />
      <mj-text padding="10px 25px" color="{{colors.text}}" />
      <mj-button background-color="{{colors.green}}" color="{{colors.text}}" border-radius="4px" font-size="14px" />
      <mj-section padding="20px" />
    </mj-attributes>

    <mj-raw><meta name="color-scheme" content="light dark" /></mj-raw>
    <mj-raw><meta name="supported-color-schemes" content="light dark" /></mj-raw>
  </mj-head>

  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image src="{{milo.logo}}" align="left" width="80px"/>
        <mj-text padding="30px 25px 15px 25px">
          <h1 style="margin: 0;">{{template.title}}</h1>
        </mj-text>
        <mj-text padding="0 25px 10px 25px">
          <p style="margin: 0;">{{invitation.author}} vous a désigné administrateur de Milo. Pour vous connecter, cliquer sur le bouton ci-dessous et utiliser vos identifiants de session Windows pour vous authentifier.</p>
        </mj-text>
        <mj-button href="{{milo.url}}" align="left">Ouvrir Milo</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/** What the assignment's template is filled with. */
export interface ElementView {
  name: string;
  /** The assignment's sentence: "Claire Martin vous a ajouté comme acteur." */
  activity?: string;
  /** The changes': how many modifications it lists. */
  updates?: { count: number };
  url: string;
  /** Where it sits: its workspace, its view, its board, and the widget that shows it. */
  workspace: string;
  /** The three, as a path: "Les manufactures › Projets › IT". */
  path: string;
  /** Its widget's type, as the interface names it: "Projets", "Tâches", "Tickets". */
  widgetType: string;
  view: string;
  board: string;
  widget: string;
}

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
  /** A template saved with former variables, written with today's. */
  current?: (mjml: string) => string;
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
    current: withCurrentVariables,
  };
};

/** Lines as the editor writes them: a paragraph each, an empty one between. */
const spaced = (...lines: string[]): string =>
  lines.map((line) => `<p>${Mustache.escape(line)}</p>`).join("<p></p>");

const SAMPLE_LINK = { url: "https://milo.example/", label: "Ouvrir dans Milo" };

/** A sample element of the changes' e-mail, where it sits, and what happened to it. */
const sampleElement = (
  element: Omit<ElementView, "path" | "activity" | "updates">,
  keys: Record<"workspace" | "view" | "board" | "widget", string>,
  rows: Row[],
): PlacedElement => {
  // One modification per line listed: a repeat is "(2 fois)" on its line.
  const total = rows.length;
  return {
    item: {
      element: {
        ...element,
        updates: { count: total },
        path: [element.workspace, element.view, element.board].filter(Boolean).join(" › "),
      },
      updates: updatesView(rows),
    },
    total,
    keys: { ...keys, widgetType: element.widgetType },
  };
};

/** The changes' preview: three elements, in two views of one workspace. */
const changesSample = (): Record<string, unknown> => {
  const elements = [
    sampleElement(
      {
        name: "Préparer la maquette",
        url: `${SAMPLE_LINK.url}?card=318`,
        workspace: "Arco",
        view: "Tâches",
        board: "Les Manufactures",
        widgetType: "Tâches",
        widget: "Tâches",
      },
      { workspace: "1", view: "1", board: "1", widget: "1" },
      [
        { text: "Claire Martin a commenté la tâche", repetitions: 1 },
        { text: "Paul Durand a modifié l'échéance", repetitions: 2 },
      ],
    ),
    sampleElement(
      {
        name: "Commander les badges",
        url: `${SAMPLE_LINK.url}?card=322`,
        workspace: "Arco",
        view: "Tâches",
        board: "Les Manufactures",
        widgetType: "Tâches",
        widget: "Tâches",
      },
      { workspace: "1", view: "1", board: "1", widget: "1" },
      [{ text: "Claire Martin a déplacé la carte", repetitions: 1 }],
    ),
    sampleElement(
      {
        name: "Refonte du site",
        url: `${SAMPLE_LINK.url}?project=42`,
        workspace: "Arco",
        view: "Projets",
        board: "IT",
        widgetType: "Projets",
        widget: "Projets",
      },
      { workspace: "1", view: "2", board: "2", widget: "2" },
      [
        { text: "Claire Martin a modifié la fiche", repetitions: 1 },
        { text: "Paul Durand a ajouté une étiquette", repetitions: 1 },
      ],
    ),
  ];
  const total = elements.reduce((sum, e) => sum + e.total, 0);
  return {
    ...placesView(elements),
    elements: { activity: `${modificationsLabel(total)} sur ${elements.length} éléments`, items: elements.map((e) => e.item) },
  };
};

const DEFINITIONS: Record<MailTemplateKey, Definition> = {
  changes: {
    label: "Ajout ou modification d'éléments",
    description:
      "Les ajouts et les modifications des éléments suivis : un e-mail par élément en envoi direct, un seul pour toute l'application en envoi groupé.",
    variables: [...ELEMENTS, ...PLACES, ...CHANGED_ELEMENT, ...UPDATES],
    mjml: CHANGES_MJML,
    sample: changesSample(),
    current: asUpdates,
  },
  linked: {
    label: "Affectation d'un acteur à un élément",
    description: "Une personne est ajoutée comme acteur d'un projet ou d'une carte, ou à un élément de checklist.",
    variables: LINKED_ELEMENT,
    mjml: LINKED_MJML,
    sample: {
      element: {
        name: "Refonte du site",
        activity: "Claire Martin vous a ajouté comme acteur.",
        url: `${SAMPLE_LINK.url}?project=42`,
        workspace: "Arco",
        path: "Arco › Projets › IT",
        view: "Projets",
        board: "IT",
        widgetType: "Projets",
        widget: "Projets",
      } satisfies ElementView,
    },
    current: asElement,
  },
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
    mjml: CALENDAR_CONFIRMATION_MJML,
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
  new_user: {
    label: "Nouvel utilisateur",
    description:
      "L'invitation envoyée à une personne — ou à chaque membre d'un groupe — qui reçoit l'accès à un workspace, si « Envoyer une invitation » est cochée.",
    variables: INVITATION,
    mjml: NEW_USER_MJML,
    sample: { invitation: { author: "Claire Martin", workspace: "Arco" } },
  },
  new_admin: {
    label: "Nouvel administrateur",
    description:
      "L'invitation envoyée à une personne — ou à chaque membre d'un groupe — qui reçoit des droits dans Administration, si « Envoyer une invitation » est cochée.",
    variables: ADMIN_INVITATION,
    mjml: NEW_ADMIN_MJML,
    sample: { invitation: { author: "Claire Martin" } },
  },
  new_share: {
    label: "Nouveau partage",
    description:
      "L'invitation envoyée à une personne — ou à chaque membre d'un groupe — avec qui les tableaux d'une vue sont partagés, si « Envoyer une invitation » est cochée.",
    variables: SHARES,
    mjml: NEW_SHARE_MJML,
    sample: sharesView("Claire Martin", "Arco", "Projets", ["IT", "Marketing"]),
    current: asShares,
  },
  test: {
    label: "Message de test",
    description: "Envoyé depuis Paramétrage → Notifications pour vérifier l'envoi.",
    variables: [],
    mjml: TEST_MJML,
    // Milo's own: commonView.
    sample: {},
  },
};

const defaultOf = (key: MailTemplateKey): string => DEFINITIONS[key].mjml;

const SETTING = "mail_templates";

/**
 * The templates modified in the Settings; the others are Milo's own — as is
 * one saved identical to it, which Milo has since adopted.
 */
const customized = (): Partial<Record<MailTemplateKey, string>> => {
  const saved = readSetting<Partial<Record<MailTemplateKey, string>>>(SETTING, {});
  for (const key of MAIL_TEMPLATE_KEYS) {
    const mjml = saved[key];
    if (mjml === undefined) continue;
    const current = DEFINITIONS[key].current?.(mjml) ?? mjml;
    if (current === defaultOf(key)) delete saved[key];
    else saved[key] = current;
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
      variables: [...d.variables, ...TEMPLATE, ...MILO, ...COLOR_VARIABLES],
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
const TEMPLATE_TITLE = /\{\{\s*template\.title\s*\}\}/g;

/**
 * "{{template.title}}" replaced by what the template's <mj-title> holds,
 * before anything is filled in: its own variables are then filled where it
 * is repeated, and what it writes stays as written — an "&mdash;" as well.
 */
const withTemplateTitle = (mjml: string): string => {
  // Within <mj-title> itself, it would repeat the title: it stays empty there.
  const titled = mjml.replace(/<mj-title>([\s\S]*?)<\/mj-title>/, (_m, title: string) =>
    `<mj-title>${title.replace(TEMPLATE_TITLE, "")}</mj-title>`,
  );
  const title = /<mj-title>([\s\S]*?)<\/mj-title>/.exec(titled)?.[1]?.trim() ?? "";
  return titled.replace(TEMPLATE_TITLE, title);
};

const compile = async (
  mjml: string,
  view: Record<string, unknown>,
  raw = false,
): Promise<MailTemplatePreview> => {
  let filled: string;
  try {
    filled = Mustache.render(
      withTemplateTitle(mjml),
      view,
      {},
      raw ? { escape: (text: string) => text } : undefined,
    );
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
    DEFINITIONS[key].current?.(mjml) ?? mjml,
    {
      ...(signer && signedSample ? signedSample(signer) : sample),
      ...commonView(DEFINITIONS[key].raw),
      logo: LOGO_SRC,
    },
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
  /** The template's own variables: a confirmation's address and code, the assignment's element. */
  extra: Record<string, unknown> = {},
): Promise<{ text: string; html: string; attachments: MailAttachment[] }> => ({
  text: toText(m),
  ...(await withLogos(render(key, { ...viewOf(m), ...extra, ...commonView(), logo: LOGO_SRC }))),
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
  inPreview(await render(key, { ...replyViewOf(reply), ...commonView(true), logo: LOGO_SRC }));

/**
 * A support reply, team or automatic, laid out by its template — and the
 * logos, when the template cites them.
 */
export const replyTemplate = async (
  key: ReplyTemplateKey,
  reply: ReplyView,
): Promise<{ html: string; attachments: MailAttachment[] }> =>
  withLogos(render(key, { ...replyViewOf(reply), ...commonView(true), logo: LOGO_SRC }));
