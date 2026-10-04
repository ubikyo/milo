// Workstations of Assets mode: what the inventory agents report.
//
// A workstation belongs to no board by itself: it joins the one whose asset
// label bears the name of the "tag" its agent carries, and nothing at all when
// no label names it. The inventory itself is kept whole, as JSON: the drawer is what
// unrolls it, and nobody has yet decided what would be kept of it.

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
  Label,
} from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { AssetRow } from "../db/rows.js";
import { receivedTags } from "./inboxes.js";
import { templateName } from "../lib/asset-models.js";
import { vlanOf, vlans } from "../lib/asset-vlans.js";
import { sectionsOf, textOf } from "../lib/inventory.js";
import type { Tree } from "../lib/inventory.js";

export const WORKSTATION_NOT_FOUND = "Poste introuvable";

export const assets = {
  byId: selection<AssetRow>("SELECT * FROM assets WHERE id = ?"),
  byDeviceId: selection<AssetRow>("SELECT * FROM assets WHERE deviceid = ?"),
  // The name first, since it is all the list shows. Workstations without a
  // name — an agent that could not tell it — go at the end, by their
  // identifier.
  all: selection<AssetRow>("SELECT * FROM assets ORDER BY name = '', name, deviceid"),
  /** Those of a board. */
  ofBoard: selection<AssetRow>(
    `SELECT * FROM assets WHERE board_id = ? ORDER BY name = '', name, deviceid`,
  ),
  create: mutation(
    `INSERT INTO assets
       (deviceid, name, tag, board_id, list_key, content, last_user, last_inventory, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE assets
     SET name = ?, tag = ?, board_id = ?, list_key = ?, content = ?, last_user = ?, last_inventory = ?
     WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM assets WHERE id = ?"),
};

const setList = mutation(
  "UPDATE assets SET board_id = ?, list_key = ? WHERE lower(trim(tag)) = ?",
);
const withoutReceipt = mutation("UPDATE assets SET board_id = NULL, list_key = ''");

/**
 * Workstations follow the workstation lists: each goes to the list whose
 * board names its tag with an asset label, or nowhere. Redone when a
 * workstation list or an asset label changes.
 */
export const reassignWorkstations = transaction((): void => {
  withoutReceipt.run();
  for (const inbox of receivedTags()) {
    setList.run(inbox.board_id, inbox.list, inbox.value.trim().toLowerCase());
  }
});

/** The asset labels of a board named as a tag, case aside. */
const labelsOfTag = selection<Label>(
  `SELECT l.*, g.name AS group_name FROM asset_labels l
   LEFT JOIN asset_label_groups g ON g.id = l.group_id
   WHERE l.board_id = ? AND lower(trim(l.name)) = lower(trim(?))
   ORDER BY l.position, l.id`,
);

/** The content kept in the database, or nothing when it is unreadable. */
const contentOf = (row: AssetRow): Tree => {
  try {
    return JSON.parse(row.content) as Tree;
  } catch {
    return {};
  }
};

/**
 * The system volume: "C:" on Windows, the "/" mount point on Linux and
 * macOS — the agent then gives it in TYPE. Nothing when the agent does not
 * declare it, or without a readable size.
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

/** Yes, no, or nothing: the agent writes "Yes", "1" or "true" depending on its version. */
const yesNo = (value: string | undefined): boolean | null => {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "yes" || v === "1" || v === "true") return true;
  if (v === "no" || v === "0" || v === "false") return false;
  return null;
};

/** The encrypted system volume (BitLocker, FileVault, LUKS), if the agent says so. */
const volumeEncrypted = (content: Tree): boolean | null =>
  yesNo(systemVolume(content)?.["ENCRYPT_STATUS"]);

/**
 * The architecture: the one the system declares ("arm64", "x86_64",
 * "64-bit"…), failing that the one the processor description says
 * ("ARMv8 (64-bit)", "Intel64 Family 6").
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

/** The system volume's encryption name and its algorithm; "None" says nothing. */
const encryptionOf = (content: Tree): AssetSummary["encryption"] => {
  const volume = systemVolume(content);
  const algorithm = (volume?.["ENCRYPT_ALGO"] ?? "").trim();
  return {
    name: (volume?.["ENCRYPT_NAME"] ?? "").trim(),
    algorithm: algorithm.toLowerCase() === "none" ? "" : algorithm,
  };
};

/** Windows firewall profiles, under their French name. */
const FIREWALL_PROFILES: Record<string, string> = {
  DomainProfile: "Domaine",
  StandardProfile: "Privé",
  PublicProfile: "Public",
};

/**
 * The firewall, as the agent describes it: one entry per profile on Windows,
 * a single one elsewhere (macOS). Entries without a readable state do not count.
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

/** The workstation's system: its name, and the family that picks its logo. */
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
    // "Microsoft" tells nothing in front of "Windows".
    name: name.replace(/^Microsoft\s+/i, ""),
    // The Windows display version ("23H2") says more than its number.
    version:
      textOf(content, "OPERATINGSYSTEM", "DISPLAYVERSION") ||
      textOf(content, "OPERATINGSYSTEM", "VERSION"),
    kernel: textOf(content, "OPERATINGSYSTEM", "KERNEL_VERSION"),
  };
};

/**
 * Products the agent names poorly: its technical name, replaced by the one it
 * is known under. Only the product name changes — the inventory stored in the
 * database stays as the agent sent it, and process paths keep theirs.
 */
const PRODUCT_NAMES: Record<string, string> = {
  "Sentinel Agent": "SentinelOne EPP",
};

const productName = (name: string): string => PRODUCT_NAMES[name.trim()] ?? name;

/** Sections whose NAME field is a product name. */
const PRODUCT_SECTIONS = new Set(["ANTIVIRUS", "SOFTWARES"]);

/**
 * The workstation's protection. Windows often declares two — Defender left
 * aside next to the one that was installed: the first active one wins.
 * Outside Windows, the agent lists none: nothing allows concluding there is
 * none.
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
 * What the list shows: the name and system, who logs in, when it was last
 * seen, its protection, and the state of its system disk.
 */
export const assetOf = (row: AssetRow, content: Tree = contentOf(row)): Asset => ({
  id: row.id,
  name: row.name,
  board_id: row.board_id,
  list_key: row.list_key,
  tag: row.tag,
  labels: row.board_id === null || !row.tag.trim() ? [] : labelsOfTag.all(row.board_id, row.tag),
  user: row.last_user,
  last_inventory: row.last_inventory,
  system_disk: systemDisk(content),
  system_disk_encrypted: volumeEncrypted(content),
  os: systemOf(content),
  protection: protectionOf(content),
});

/**
 * Who uses the workstation. Three sources, from the most reliable to the most
 * distant: the sessions open at the time of the inventory (USERS), the last
 * login Windows retained (HARDWARE/LASTLOGGEDUSER), and the author of the
 * last inventory (ACCESSLOG/USERID).
 *
 * The domain is joined when the agent gives it: "ARCO\jquintard" reads better
 * than a bare identifier when two domains look alike.
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

/** A section's entries, or nothing: all are optional. */
const entriesOf = (sections: AssetSection[], name: string) =>
  sections.find((section) => section.name === name)?.entries ?? [];

/**
 * The TeamViewer identifier, as the agent read it from the registry (or via
 * "teamviewer --info"). A workstation may carry several remote-control tools:
 * we keep only that one, it is the only one we know how to open.
 */
const teamviewerDe = (sections: AssetSection[]): string =>
  entriesOf(sections, "REMOTE_MGMT").find(
    (entry) => (entry["TYPE"] ?? "").toLowerCase() === "teamviewer",
  )?.["ID"] ?? "";

/** An address that leads nowhere: the machine itself, or a dead link. */
const unusable = (address: string): boolean =>
  !address || address.startsWith("127.") || address.startsWith("169.254.") || address === "0.0.0.0";

/**
 * How to reach the workstation. Active network cards first, virtual ones
 * last — a machine running containers readily declares five, only one of
 * which leads anywhere.
 *
 * It is the address the workstation had at its last inventory: with DHCP it
 * may have changed since, which is why a failed inventory request always says
 * which address was called.
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

  // What the machine says about itself, failing that: several addresses are
  // sometimes glued together there, separated by a slash.
  const hardware = entriesOf(sections, "HARDWARE")[0]?.["IPADDR"] ?? "";
  const declared = hardware
    .split(/[/,]/)
    .map((a) => a.trim())
    .find((a) => !unusable(a));
  return declared ?? "";
};

/**
 * What the sheet does not show, or not in full. Hidden sections are used
 * elsewhere: ACCESSLOG dates the list row, ACCOUNTINFO carries the tag that
 * attaches the workstation to its company. A reduced section keeps only the
 * named fields, in that order; a pruned section loses the named fields and
 * keeps the rest — including what a future version of the agent will add.
 */
// ENVS, the agent's environment variables, says nothing about the workstation
// useful to whoever looks at it; VERSIONCLIENT and VERSIONPROVIDER speak of
// the agent, not the machine; LICENSEINFOS, the license keys, must not be
// displayed.
const HIDDEN_SECTIONS = new Set([
  "ACCESSLOG",
  "ACCOUNTINFO",
  "ENVS",
  "LICENSEINFOS",
  "VERSIONCLIENT",
  "VERSIONPROVIDER",
]);
const KEPT_FIELDS: Record<string, string[]> = {
  // The columns of the sheet's "EPP / EDR" table.
  ANTIVIRUS: ["COMPANY", "NAME", "ENABLED", "VERSION"],
  BIOS: ["SMANUFACTURER", "SMODEL", "SSN"],
  CONTROLLERS: ["NAME", "MANUFACTURER", "TYPE", "PCISLOT", "VENDORID"],
  // The sheet makes a table of it: these are its columns. LETTER exists only
  // on Windows; FREE and TOTAL, in MB, make the occupancy gauge.
  DRIVES: ["LETTER", "TYPE", "FILESYSTEM", "ENCRYPT_STATUS", "FREE", "TOTAL"],
  // What runs, who runs it, and what it costs in processor: the columns of
  // the sheet's table.
  PROCESSES: ["CMD", "USER", "CPUUSAGE"],
  // What is installed, in which version, by whom, and since when: the columns
  // of the sheet's table. The rest — registry keys, uninstall strings, help
  // links — is for the agent, not for whoever reads the sheet.
  SOFTWARES: ["NAME", "VERSION", "PUBLISHER", "INSTALLDATE"],
  // The workstation's accounts and groups, as tables. HOME exists only on
  // Linux and macOS: the column appears only there.
  LOCAL_GROUPS: ["NAME"],
  // ADMIN is not from the agent: the sheet sets it (administratorsOf).
  LOCAL_USERS: ["NAME", "HOME", "ADMIN"],
  // Virtual machines and containers: the columns of the sheet's table.
  VIRTUALMACHINES: ["NAME", "MEMORY", "STATUS", "VMTYPE"],
};
const REMOVED_FIELDS: Record<string, string[]> = {
  CPUS: ["FAMILYNUMBER", "ID", "MODEL", "SPEED", "STEPPING"],
  // The screen's raw EDID, encoded: unreadable, and what it says is already
  // in the other fields.
  MONITORS: ["BASE64"],
};

/** An entry as the sheet shows it, according to its section's rule. */
const displayedEntry = (section: string, raw: AssetEntry): AssetEntry => {
  let entry =
    PRODUCT_SECTIONS.has(section) && typeof raw["NAME"] === "string"
      ? { ...raw, NAME: productName(raw["NAME"]) }
      : raw;
  // The model under its name, the identifier following: "MacBook Pro 16"
  // (M2 Max, 2023) — Mac14,6".
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
 * Windows, based on what the workstation says about its system. The agent
 * names it in several ways depending on its version: we take the first that
 * answers.
 */
const onWindows = (content: Tree): boolean =>
  textOf(content, "OPERATINGSYSTEM", "KERNEL_NAME").toLowerCase() === "mswin32" ||
  /windows/i.test(textOf(content, "OPERATINGSYSTEM", "NAME")) ||
  /windows/i.test(textOf(content, "HARDWARE", "OSNAME"));

/**
 * Entries discarded from a section. On Linux and macOS, accounts whose login
 * starts with "_" are service ones (_www, _spotlight…), and likewise for
 * groups: macOS declares around a hundred, and nobody logs into them.
 */
const discardedEntry = (section: string, entry: AssetEntry, windows: boolean): boolean => {
  if (windows) return false;
  if (section === "LOCAL_USERS") return (entry["LOGIN"] ?? "").startsWith("_");
  if (section === "LOCAL_GROUPS") return (entry["NAME"] ?? "").startsWith("_");
  return false;
};

/** Sections as the sheet shows them. */
/**
 * Local administrator accounts, based on what the agent says: members of the
 * administrators group — "Administrateurs" (S-1-5-32-544) on Windows, "admin"
 * on macOS and Linux —, Windows's built-in Administrator account (its SID
 * ends with -500) and root (uid 0). The agent does not always give the
 * members: on Windows, never; on macOS, only those of /etc/group. An
 * administrator may therefore escape the mark.
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
 * The Paramétrage VLAN that carries a network card: the one of the first of
 * its IPv4 addresses that falls within a declared subnet.
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
        // VLAN and VLAN_NAME are not from the agent either: the Paramétrage
        // VLAN that carries the card, when there is one.
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
 * The open workstation: the inventory, section by section. Unreadable
 * content — a hand-written database, a truncated upload — yields a
 * workstation without sections rather than making the request fail.
 */
export const assetDetail = (row: AssetRow): AssetDetail => {
  const content = contentOf(row);
  const sections = sectionsOf(content);

  return {
    ...assetOf(row, content),
    deviceid: row.deviceid,
    tag: row.tag,
    created_at: row.created_at,
    // TeamViewer and the address are read from the whole inventory: what the
    // sheet hides may still help find them.
    sections: displayedSections(sections, onWindows(content)),
    teamviewer_id: teamviewerDe(sections),
    address: addressOf(sections),
    summary: summaryOf(sections, content),
    // It is read from endoflife.date: the route sets it (lib/endoflife.ts).
    support: null,
  };
};

/** A positive number, or nothing. */
const count = (value: string | undefined): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The summary's network card, among the physical ones that have an address —
 * Ethernet and Wi-Fi: a connected one, Wi-Fi first. The agent gives the kind
 * in TYPE; the oldest ones do not, and the card's name then says it.
 */
/** A card as read, and whether it is connected: enough to choose. */
type ReadCard = AssetNetwork & { connected: boolean };

const cardsOf = (sections: AssetSection[]): AssetNetwork[] => {
  // The Paramétrage VLAN table, read once for all cards.
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
  // A single card: a connected one, Wi-Fi before Ethernet; failing a
  // connected one, the first that has an address.
  const selected =
    cards.find((c) => c.connected && c.kind === "wifi") ??
    cards.find((c) => c.connected) ??
    cards[0];
  if (!selected) return [];
  const { connected: _connected, ...card } = selected;
  return [card];
};

/** The "Résumé" tab: what one looks for first when opening a workstation. */
const summaryOf = (sections: AssetSection[], content: Tree): AssetSummary => {
  const bios = entriesOf(sections, "BIOS")[0] ?? {};
  const cpus = entriesOf(sections, "CPUS");
  const first = cpus[0];
  // The memory the machine declares, failing that the sum of its modules.
  const ramModules = entriesOf(sections, "MEMORIES")
    .map((m) => count(m["CAPACITY"]) ?? 0)
    .reduce((a, b) => a + b, 0);
  const memorySize = count(entriesOf(sections, "HARDWARE")[0]?.["MEMORY"]) ?? (ramModules || null);

  return {
    networks: cardsOf(sections),
    manufacturer: bios["SMANUFACTURER"] ?? bios["MMANUFACTURER"] ?? "",
    // The name the Paramétrage gives the identifier ("Mac14,6"), if it has
    // one.
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
