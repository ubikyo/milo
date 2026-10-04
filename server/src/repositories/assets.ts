// Les postes du mode Assets : ce que les agents d'inventaire remontent.
//
// Un poste n'appartient à aucun tableau : il se rattache à une société par le
// « tag » que porte son agent, et à rien du tout quand ce tag ne désigne
// aucune société connue. L'inventaire lui-même est gardé entier, en JSON :
// c'est le tiroir qui le déroule, et personne n'a encore décidé de ce qu'on en
// garderait.

import type {
  Asset,
  AssetDetail,
  AssetEntry,
  AssetNetwork,
  AssetOsFamily,
  AssetProtection,
  AssetSection,
  AssetSummary,
  AssetVlan,
} from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { AssetRow } from "../db/rows.js";
import { receivedTags } from "./receptions.js";
import { templateName } from "../lib/asset-models.js";
import { vlanOf, vlans } from "../lib/asset-vlans.js";
import { sectionsOf, textOf } from "../lib/inventory.js";
import type { Tree } from "../lib/inventory.js";

export const WORKSTATION_NOT_FOUND = "Poste introuvable";

export const assets = {
  byId: selection<AssetRow>("SELECT * FROM assets WHERE id = ?"),
  byDeviceId: selection<AssetRow>("SELECT * FROM assets WHERE deviceid = ?"),
  // Le nom d'abord, puisque c'est tout ce que la liste montre. Les postes sans
  // nom — un agent qui n'a pas su le dire — se rangent à la fin par leur
  // identifiant.
  all: selection<AssetRow>("SELECT * FROM assets ORDER BY name = '', name, deviceid"),
  /** Ceux d'un tableau : de l'un de ses contextes, ou de tous. */
  ofBoard: selection<AssetRow>(
    `SELECT * FROM assets
     WHERE board_id = @board AND (@context IS NULL OR context_id = @context)
     ORDER BY name = '', name, deviceid`,
  ),
  create: mutation(
    `INSERT INTO assets
       (deviceid, name, tag, board_id, context_id, list_key, content, last_user, last_inventory, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE assets
     SET name = ?, tag = ?, board_id = ?, context_id = ?, list_key = ?, content = ?, last_user = ?, last_inventory = ?
     WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM assets WHERE id = ?"),
};

const setContext = mutation(
  "UPDATE assets SET board_id = ?, context_id = ?, list_key = ? WHERE lower(trim(tag)) = ?",
);
const withoutReceipt = mutation(
  "UPDATE assets SET board_id = NULL, context_id = NULL, list_key = ''",
);

/**
 * Les postes suivent les listes de postes : chacun va au contexte qui reçoit
 * son tag, ou nulle part. Refait quand une liste de postes change ce qu'elle
 * reçoit.
 */
export const reassignWorkstationContexts = transaction((): void => {
  withoutReceipt.run();
  for (const inbox of receivedTags()) {
    setContext.run(
      inbox.board_id,
      inbox.context_id,
      inbox.list,
      inbox.value.trim().toLowerCase(),
    );
  }
});

/** Le contenu gardé en base, ou rien quand il est illisible. */
const contentOf = (row: AssetRow): Tree => {
  try {
    return JSON.parse(row.content) as Tree;
  } catch {
    return {};
  }
};

/**
 * Le volume système : « C: » sous Windows, le point de montage « / » sous
 * Linux et macOS — l'agent le donne alors dans TYPE. Rien quand l'agent ne le
 * déclare pas, ou sans taille lisible.
 */
const systemVolume = (content: Tree): AssetEntry | undefined =>
  entriesOf(sectionsOf(content), "DRIVES").find(
    (entry) =>
      (entry["LETTER"] ?? "").trim().toUpperCase().startsWith("C:") ||
      (entry["TYPE"] ?? "").trim() === "/",
  );

const systemDisk = (content: Tree): Asset["system_disk"] => {
  const volume = systemVolume(content);
  if (!volume) return null;
  const total = Number(volume["TOTAL"]);
  const free = Number(volume["FREE"]);
  if (!(total > 0) || Number.isNaN(free)) return null;
  return { free, total };
};

/** Oui, non, ou rien : l'agent écrit « Yes », « 1 » ou « true » selon sa version. */
const yesNo = (value: string | undefined): boolean | null => {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "yes" || v === "1" || v === "true") return true;
  if (v === "no" || v === "0" || v === "false") return false;
  return null;
};

/** Le volume système chiffré (BitLocker, FileVault, LUKS), si l'agent le dit. */
const volumeEncrypted = (content: Tree): boolean | null =>
  yesNo(systemVolume(content)?.["ENCRYPT_STATUS"]);

/**
 * L'architecture : celle que le système déclare (« arm64 », « x86_64 »,
 * « 64-bit »…), à défaut celle que dit la description du processeur
 * (« ARMv8 (64-bit) », « Intel64 Family 6 »).
 */
const architectureOf = (content: Tree, cpu: AssetEntry | undefined): AssetSummary["arch"] => {
  const indices = [
    textOf(content, "OPERATINGSYSTEM", "ARCH"),
    cpu?.["DESCRIPTION"] ?? "",
    cpu?.["NAME"] ?? "",
  ];
  for (const hint of indices.map((i) => i.trim().toLowerCase()).filter(Boolean)) {
    if (/arm|aarch|apple/.test(hint)) return "ARM";
    if (/x86_64|amd64|x64|intel64|64-bit|64 bits/.test(hint)) return "x64";
    if (/i[3-6]86|x86|32-bit|32 bits/.test(hint)) return "x86";
  }
  return "";
};

/** Le nom du chiffrement du volume système et son algorithme ; « None » ne dit rien. */
const encryptionOf = (content: Tree): AssetSummary["encryption"] => {
  const volume = systemVolume(content);
  const algorithm = (volume?.["ENCRYPT_ALGO"] ?? "").trim();
  return {
    name: (volume?.["ENCRYPT_NAME"] ?? "").trim(),
    algorithm: algorithm.toLowerCase() === "none" ? "" : algorithm,
  };
};

/** Les profils du pare-feu de Windows, sous leur nom français. */
const FIREWALL_PROFILES: Record<string, string> = {
  DomainProfile: "Domaine",
  StandardProfile: "Privé",
  PublicProfile: "Public",
};

/**
 * Le pare-feu, tel que l'agent le décrit : une entrée par profil sous Windows,
 * une seule ailleurs (macOS). Les entrées sans état lisible ne comptent pas.
 */
const firewallOf = (sections: AssetSection[]): AssetSummary["firewall"] => {
  const profiles = entriesOf(sections, "FIREWALL")
    .map((entry) => ({
      name: FIREWALL_PROFILES[entry["PROFILE"] ?? ""] ?? entry["PROFILE"] ?? "",
      active: yesNo(
        { on: "yes", off: "no" }[(entry["STATUS"] ?? "").trim().toLowerCase()] ??
          entry["STATUS"],
      ),
    }))
    .filter((profile) => profile.active !== null);
  if (profiles.length === 0) return { state: "unknown", disabled: [] };
  const switchedOff = profiles.filter((profile) => !profile.active);
  return {
    state: switchedOff.length === 0 ? "on" : switchedOff.length === profiles.length ? "off" : "partial",
    disabled: switchedOff.map((profile) => profile.name).filter(Boolean),
  };
};

/** Le système du poste : son nom, et la famille qui choisit son logo. */
const systemOf = (content: Tree): Asset["os"] => {
  const name =
    textOf(content, "OPERATINGSYSTEM", "FULL_NAME") ||
    textOf(content, "OPERATINGSYSTEM", "NAME") ||
    textOf(content, "HARDWARE", "OSNAME");
  const kernel = textOf(content, "OPERATINGSYSTEM", "KERNEL_NAME").toLowerCase();
  if (!name && !kernel) return null;

  let family: AssetOsFamily = "other";
  if (onWindows(content)) family = "windows";
  else if (kernel === "darwin" || /mac ?os|os x/i.test(name)) family = "macos";
  else if (/ubuntu/i.test(name)) family = "ubuntu";
  else if (/debian/i.test(name)) family = "debian";
  else if (/red ?hat|rhel/i.test(name)) family = "redhat";
  else if (/fedora/i.test(name)) family = "fedora";
  else if (kernel === "linux" || /linux/i.test(name)) family = "linux";
  return {
    family,
    // « Microsoft » n'apprend rien devant « Windows ».
    name: name.replace(/^Microsoft\s+/i, ""),
    // La version d'affichage de Windows (« 23H2 ») dit plus que son numéro.
    version:
      textOf(content, "OPERATINGSYSTEM", "DISPLAYVERSION") ||
      textOf(content, "OPERATINGSYSTEM", "VERSION"),
    kernel: textOf(content, "OPERATINGSYSTEM", "KERNEL_VERSION"),
  };
};

/**
 * Les produits que l'agent nomme mal : son nom technique, remplacé par celui
 * sous lequel on le connaît. Seul le nom du produit change — l'inventaire
 * rangé en base reste tel que l'agent l'a envoyé, et les chemins des
 * processus gardent le leur.
 */
const PRODUCT_NAMES: Record<string, string> = {
  "Sentinel Agent": "SentinelOne EPP",
};

const productName = (name: string): string => PRODUCT_NAMES[name.trim()] ?? name;

/** Les sections dont le champ NAME est un nom de produit. */
const PRODUCT_SECTIONS = new Set(["ANTIVIRUS", "SOFTWARES"]);

/**
 * La protection du poste. Windows en déclare souvent deux — Defender resté en
 * retrait à côté de celle qu'on a installée : la première active l'emporte.
 * Hors de Windows, l'agent n'en recense aucune : rien ne permet de conclure
 * qu'il n'y en a pas.
 */
const protectionOf = (content: Tree): AssetProtection => {
  const protections = entriesOf(sectionsOf(content), "ANTIVIRUS");
  const chosen =
    protections.find((p) => yesNo(p["ENABLED"]) === true) ?? protections[0];
  if (!chosen) {
    return { state: onWindows(content) ? "none" : "unknown", name: "", company: "" };
  }
  return {
    state: yesNo(chosen["ENABLED"]) === false ? "inactive" : "active",
    name: productName(chosen["NAME"] ?? ""),
    company: chosen["COMPANY"] ?? "",
  };
};

/**
 * Ce que la liste montre : le nom et le système, qui s'y connecte, quand on
 * l'a vu, sa protection, et l'état de son disque système.
 */
export const assetOf = (row: AssetRow, content: Tree = contentOf(row)): Asset => ({
  id: row.id,
  name: row.name,
  board_id: row.board_id,
  context_id: row.context_id,
  list_key: row.list_key,
  tag: row.tag,
  user: row.last_user,
  last_inventory: row.last_inventory,
  system_disk: systemDisk(content),
  system_disk_encrypted: volumeEncrypted(content),
  os: systemOf(content),
  protection: protectionOf(content),
});

/**
 * Qui se sert du poste. Trois sources, de la plus sûre à la plus lointaine :
 * les sessions ouvertes au moment de l'inventaire (USERS), la dernière
 * ouverture que Windows a retenue (HARDWARE/LASTLOGGEDUSER), et l'auteur du
 * dernier inventaire (ACCESSLOG/USERID).
 *
 * Le domaine est joint quand l'agent le donne : « ARCO\jquintard » se lit
 * mieux qu'un identifiant seul quand deux domaines se ressemblent.
 */
export const contentUser = (content: Tree): string => {
  const sessions = content["USERS"];
  const openSessions = Array.isArray(sessions) ? sessions : sessions ? [sessions] : [];
  for (const session of openSessions) {
    const login = textOf(session, "LOGIN");
    if (!login) continue;
    const domain = textOf(session, "DOMAIN");
    return domain ? `${domain}\\${login}` : login;
  }

  return textOf(content, "HARDWARE", "LASTLOGGEDUSER") || textOf(content, "ACCESSLOG", "USERID");
};

/** Les entrées d'une section, ou rien : toutes sont facultatives. */
const entriesOf = (sections: AssetSection[], name: string) =>
  sections.find((section) => section.name === name)?.entries ?? [];

/**
 * L'identifiant TeamViewer, tel que l'agent l'a lu dans la base de registres
 * (ou par « teamviewer --info »). Un poste peut porter plusieurs outils de
 * prise en main : on ne retient que celui-là, c'est le seul qu'on sache
 * ouvrir.
 */
const teamviewerDe = (sections: AssetSection[]): string =>
  entriesOf(sections, "REMOTE_MGMT").find(
    (entry) => (entry["TYPE"] ?? "").toLowerCase() === "teamviewer",
  )?.["ID"] ?? "";

/** Une adresse qui ne mène nulle part : la machine elle-même, ou un lien mort. */
const unusable = (address: string): boolean =>
  !address || address.startsWith("127.") || address.startsWith("169.254.") || address === "0.0.0.0";

/**
 * Par où joindre le poste. Les cartes réseau actives d'abord, les virtuelles
 * en dernier — une machine qui fait tourner des conteneurs en déclare
 * volontiers cinq, dont une seule mène quelque part.
 *
 * C'est l'adresse qu'avait le poste à son dernier inventaire : en DHCP elle a
 * pu changer depuis, et c'est pour ça que l'échec d'une demande d'inventaire
 * dit toujours quelle adresse a été appelée.
 */
const addressOf = (sections: AssetSection[]): string => {
  const cards = entriesOf(sections, "NETWORKS");
  const first = (entry: Record<string, string>): string =>
    (entry["IPADDRESS"] ?? "").split(",")[0]!.trim();

  const active = cards.find(
    (entry) =>
      (entry["STATUS"] ?? "").toLowerCase() === "up" &&
      entry["VIRTUALDEV"] !== "1" &&
      !unusable(first(entry)),
  );
  if (active) return first(active);

  const other = cards.find((entry) => !unusable(first(entry)));
  if (other) return first(other);

  // Ce que la machine dit d'elle-même, à défaut : plusieurs adresses y sont
  // parfois collées, séparées par une barre oblique.
  const hardware = entriesOf(sections, "HARDWARE")[0]?.["IPADDR"] ?? "";
  const declared = hardware
    .split(/[/,]/)
    .map((a) => a.trim())
    .find((a) => !unusable(a));
  return declared ?? "";
};

/**
 * Ce que la fiche ne montre pas, ou pas en entier. Les sections masquées
 * servent ailleurs : ACCESSLOG date la ligne de la liste, ACCOUNTINFO porte le
 * tag qui rattache le poste à sa société. Une section réduite ne garde que les
 * champs nommés, dans cet ordre ; une section élaguée perd les champs nommés
 * et garde le reste — y compris ce qu'une version future de l'agent ajoutera.
 */
// ENVS, les variables d'environnement de l'agent, ne dit rien du poste qui
// serve à qui le regarde ; VERSIONCLIENT et VERSIONPROVIDER parlent de
// l'agent, pas de la machine ; LICENSEINFOS, les clés de licence, n'a pas à
// s'afficher.
const HIDDEN_SECTIONS = new Set([
  "ACCESSLOG",
  "ACCOUNTINFO",
  "ENVS",
  "LICENSEINFOS",
  "VERSIONCLIENT",
  "VERSIONPROVIDER",
]);
const KEPT_FIELDS: Record<string, string[]> = {
  // Les colonnes du tableau « EPP / EDR » de la fiche.
  ANTIVIRUS: ["COMPANY", "NAME", "ENABLED", "VERSION"],
  BIOS: ["SMANUFACTURER", "SMODEL", "SSN"],
  CONTROLLERS: ["NAME", "MANUFACTURER", "TYPE", "PCISLOT", "VENDORID"],
  // La fiche en fait un tableau : ce sont ses colonnes. LETTER n'existe que
  // sous Windows ; FREE et TOTAL, en Mo, font la jauge d'occupation.
  DRIVES: ["LETTER", "TYPE", "FILESYSTEM", "ENCRYPT_STATUS", "FREE", "TOTAL"],
  // Ce qui tourne, qui le fait tourner, et ce que ça coûte en processeur :
  // les colonnes du tableau de la fiche.
  PROCESSES: ["CMD", "USER", "CPUUSAGE"],
  // Ce qui est installé, en quelle version, par qui, et depuis quand : les
  // colonnes du tableau de la fiche. Le reste — clés de registre, chaînes de
  // désinstallation, liens d'aide — sert à l'agent, pas à qui lit la fiche.
  SOFTWARES: ["NAME", "VERSION", "PUBLISHER", "INSTALLDATE"],
  // Les comptes et les groupes du poste, en tableaux. HOME n'existe que sous
  // Linux et macOS : la colonne n'apparaît que là.
  LOCAL_GROUPS: ["NAME"],
  // ADMIN n'est pas de l'agent : la fiche le pose (administrateursDe).
  LOCAL_USERS: ["NAME", "HOME", "ADMIN"],
  // Machines virtuelles et conteneurs : les colonnes du tableau de la fiche.
  VIRTUALMACHINES: ["NAME", "MEMORY", "STATUS", "VMTYPE"],
};
const REMOVED_FIELDS: Record<string, string[]> = {
  CPUS: ["FAMILYNUMBER", "ID", "MODEL", "SPEED", "STEPPING"],
  // L'EDID brut de l'écran, encodé : illisible, et ce qu'il dit est déjà
  // dans les autres champs.
  MONITORS: ["BASE64"],
};

/** Une entrée telle que la fiche la montre, selon la règle de sa section. */
const displayedEntry = (section: string, raw: AssetEntry): AssetEntry => {
  let entry =
    PRODUCT_SECTIONS.has(section) && typeof raw["NAME"] === "string"
      ? { ...raw, NAME: productName(raw["NAME"]) }
      : raw;
  // Le modèle sous son nom, l'identifiant à la suite : « MacBook Pro 16"
  // (M2 Max, 2023) — Mac14,6 ».
  const template = section === "BIOS" ? templateName(entry["SMODEL"] ?? "") : "";
  if (template) entry = { ...entry, SMODEL: `${template} — ${entry["SMODEL"]}` };
  const keptCount = KEPT_FIELDS[section];
  if (keptCount) {
    return Object.fromEntries(
      keptCount.filter((field) => field in entry).map((field) => [field, entry[field]!]),
    );
  }
  const removed = REMOVED_FIELDS[section];
  if (removed) {
    return Object.fromEntries(Object.entries(entry).filter(([field]) => !removed.includes(field)));
  }
  return entry;
};

/**
 * Windows, d'après ce que le poste dit de son système. L'agent le nomme de
 * plusieurs façons selon sa version : on prend la première qui répond.
 */
const onWindows = (content: Tree): boolean =>
  textOf(content, "OPERATINGSYSTEM", "KERNEL_NAME").toLowerCase() === "mswin32" ||
  /windows/i.test(textOf(content, "OPERATINGSYSTEM", "NAME")) ||
  /windows/i.test(textOf(content, "HARDWARE", "OSNAME"));

/**
 * Les entrées qu'on écarte d'une section. Sous Linux et macOS, les comptes
 * dont le login commence par « _ » sont ceux des services (_www, _spotlight…),
 * et de même pour les groupes : macOS en déclare une centaine, et personne ne
 * s'y connecte.
 */
const discardedEntry = (section: string, entry: AssetEntry, windows: boolean): boolean => {
  if (windows) return false;
  if (section === "LOCAL_USERS") return (entry["LOGIN"] ?? "").startsWith("_");
  if (section === "LOCAL_GROUPS") return (entry["NAME"] ?? "").startsWith("_");
  return false;
};

/** Les sections telles que la fiche les montre. */
/**
 * Les comptes locaux administrateurs, d'après ce que l'agent en dit : les
 * membres du groupe des administrateurs — « Administrateurs » (S-1-5-32-544)
 * sous Windows, « admin » sous macOS et Linux —, le compte Administrateur
 * intégré de Windows (son SID finit par -500) et root (uid 0). L'agent ne
 * donne pas toujours les membres : sous Windows, jamais ; sous macOS, ceux de
 * /etc/group seulement. Un administrateur peut donc échapper à la marque.
 */
const administratorsOf = (sections: AssetSection[]): ((account: AssetEntry) => boolean) => {
  const members = new Set(
    entriesOf(sections, "LOCAL_GROUPS")
      .filter((group) => group["ID"] === "S-1-5-32-544" || group["NAME"] === "admin")
      .flatMap((group) => (group["MEMBER"] ?? "").split(","))
      .map((member) => member.trim().toLowerCase())
      .filter(Boolean),
  );
  return (account) =>
    account["ID"] === "0" ||
    /^S-1-5-21-.*-500$/.test(account["ID"] ?? "") ||
    [account["LOGIN"], account["NAME"]].some((name) => name && members.has(name.toLowerCase()));
};

/**
 * Le VLAN du Paramétrage qui porte une carte réseau : celui de la première de
 * ses adresses IPv4 qui tombe dans un sous-réseau déclaré.
 */
const cardVlan = (entry: AssetEntry, table: AssetVlan[]): AssetVlan | null =>
  (entry["IPADDRESS"] ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => !unusable(a))
    .map((ip) => vlanOf(ip, table))
    .find(Boolean) ?? null;

const displayedSections = (sections: AssetSection[], windows: boolean): AssetSection[] => {
  const administrator = administratorsOf(sections);
  const table = vlans();
  return sections
    .filter((section) => !HIDDEN_SECTIONS.has(section.name))
    .map((section) => ({
      ...section,
      entries: section.entries
        .filter((entry) => !discardedEntry(section.name, entry, windows))
        .map((entry) =>
          section.name === "LOCAL_USERS" && administrator(entry)
            ? { ...entry, ADMIN: "1" }
            : entry,
        )
        // VLAN et VLAN_NAME ne sont pas de l'agent non plus : le VLAN du
        // Paramétrage qui porte la carte, quand il y en a un.
        .map((entry) => {
          const vlan = section.name === "NETWORKS" ? cardVlan(entry, table) : null;
          return vlan ? { ...entry, VLAN: String(vlan.vlan), VLAN_NAME: vlan.name } : entry;
        })
        .map((entry) => displayedEntry(section.name, entry))
        .filter((entry) => Object.keys(entry).length > 0),
    }))
    .filter((section) => section.entries.length > 0);
};

/**
 * Le poste ouvert : l'inventaire, section par section. Un contenu
 * illisible — une base écrite à la main, un envoi tronqué — rend un poste sans
 * section plutôt que de faire tomber la requête.
 */
export const assetDetail = (row: AssetRow): AssetDetail => {
  const content = contentOf(row);
  const sections = sectionsOf(content);

  return {
    ...assetOf(row, content),
    deviceid: row.deviceid,
    tag: row.tag,
    created_at: row.created_at,
    // TeamViewer et l'adresse se lisent sur l'inventaire entier : ce que la
    // fiche masque peut encore servir à les trouver.
    sections: displayedSections(sections, onWindows(content)),
    teamviewer_id: teamviewerDe(sections),
    address: addressOf(sections),
    summary: summaryOf(sections, content),
    // Elle se lit sur endoflife.date : la route la pose (lib/endoflife.ts).
    support: null,
  };
};

/** Un nombre positif, ou rien. */
const count = (value: string | undefined): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * La carte réseau du résumé, parmi les physiques qui ont une adresse —
 * Ethernet et Wi-Fi : une connectée, le Wi-Fi d'abord. L'agent donne le genre
 * dans TYPE ; les plus anciens ne le donnent pas, et le nom de la carte le dit
 * alors.
 */
/** Une carte telle que lue, et si elle est connectée : de quoi choisir. */
type ReadCard = AssetNetwork & { connected: boolean };

const cardsOf = (sections: AssetSection[]): AssetNetwork[] => {
  // La table des VLAN du Paramétrage, lue une fois pour toutes les cartes.
  const table = vlans();
  const cards = entriesOf(sections, "NETWORKS").flatMap((entry): ReadCard[] => {
    if (entry["VIRTUALDEV"] === "1") return [];
    const description = entry["DESCRIPTION"] ?? "";
    const type = (entry["TYPE"] ?? "").toLowerCase();
    const wifi = type === "wifi" || /wi-?fi|wireless|wlan|802\.11/i.test(description);
    const ethernet = type === "ethernet" || (!type && /ethernet|gbe|lan\b/i.test(description));
    if (!wifi && !ethernet) return [];
    const ips = (entry["IPADDRESS"] ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => !unusable(a));
    if (ips.length === 0) return [];
    const vlan = cardVlan(entry, table);
    return [
      {
        kind: wifi ? "wifi" : "ethernet",
        description,
        ips,
        vlan: vlan && { vlan: vlan.vlan, name: vlan.name },
        connected: (entry["STATUS"] ?? "").toLowerCase() === "up",
      },
    ];
  });
  // Une seule carte : une connectée, le Wi-Fi avant l'Ethernet ; à défaut de
  // connectée, la première qui a une adresse.
  const selected =
    cards.find((c) => c.connected && c.kind === "wifi") ??
    cards.find((c) => c.connected) ??
    cards[0];
  if (!selected) return [];
  const { connected: _connected, ...card } = selected;
  return [card];
};

/** L'onglet « Résumé » : ce qu'on cherche d'abord en ouvrant un poste. */
const summaryOf = (sections: AssetSection[], content: Tree): AssetSummary => {
  const bios = entriesOf(sections, "BIOS")[0] ?? {};
  const cpus = entriesOf(sections, "CPUS");
  const first = cpus[0];
  // La mémoire que la machine déclare, à défaut la somme de ses barrettes.
  const ramModules = entriesOf(sections, "MEMORIES")
    .map((m) => count(m["CAPACITY"]) ?? 0)
    .reduce((a, b) => a + b, 0);
  const memorySize = count(entriesOf(sections, "HARDWARE")[0]?.["MEMORY"]) ?? (ramModules || null);

  return {
    networks: cardsOf(sections),
    manufacturer: bios["SMANUFACTURER"] ?? bios["MMANUFACTURER"] ?? "",
    // Le nom que le Paramétrage donne à l'identifiant (« Mac14,6 »), s'il
    // en a un.
    model: templateName(bios["SMODEL"] ?? "") || (bios["SMODEL"] ?? ""),
    serial: bios["SSN"] ?? "",
    cpu: first?.["NAME"]
      ? {
          name: first["NAME"].trim(),
          count: cpus.length,
          cores: count(first["CORE"]),
          threads: count(first["THREAD"]),
        }
      : null,
    memory: memorySize,
    arch: architectureOf(content, first),
    encryption: encryptionOf(content),
    firewall: firewallOf(sections),
  };
};
