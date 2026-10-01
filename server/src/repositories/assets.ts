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
  Id,
} from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { AssetRow, CompanyRow } from "../db/rows.js";
import { nomDuModele } from "../lib/asset-models.js";
import { sectionsDe, texteDe } from "../lib/inventory.js";
import type { Arbre } from "../lib/inventory.js";

export const POSTE_INTROUVABLE = "Poste introuvable";

export const assets = {
  byId: selection<AssetRow>("SELECT * FROM assets WHERE id = ?"),
  byDeviceId: selection<AssetRow>("SELECT * FROM assets WHERE deviceid = ?"),
  // Le nom d'abord, puisque c'est tout ce que la liste montre. Les postes sans
  // nom — un agent qui n'a pas su le dire — se rangent à la fin par leur
  // identifiant.
  all: selection<AssetRow>("SELECT * FROM assets ORDER BY name = '', name, deviceid"),
  ofCompany: selection<AssetRow>(
    "SELECT * FROM assets WHERE company_id = ? ORDER BY name = '', name, deviceid",
  ),
  create: mutation(
    `INSERT INTO assets
       (deviceid, name, tag, company_id, content, last_user, last_inventory, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE assets
     SET name = ?, tag = ?, company_id = ?, content = ?, last_user = ?, last_inventory = ?
     WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM assets WHERE id = ?"),
};

const societes = selection<CompanyRow>("SELECT * FROM companies");

/**
 * La société que désigne le tag de l'agent : son identifiant, ou son nom sans
 * égard à la casse ni aux espaces qui l'entourent. Un tag vide ou inconnu ne
 * rattache le poste à personne — il se montrera sous « Toutes les sociétés »,
 * ce qui est aussi la façon de voir qu'un agent est mal réglé.
 */
export const societeDuTag = (tag: string): Id | null => {
  const cherche = tag.trim().toLowerCase();
  if (!cherche) return null;
  const toutes = societes.all();
  const parNom = toutes.find((c) => c.name.trim().toLowerCase() === cherche);
  if (parNom) return parNom.id;
  const parId = toutes.find((c) => String(c.id) === cherche);
  return parId ? parId.id : null;
};

/** Le contenu gardé en base, ou rien quand il est illisible. */
const contenuDe = (row: AssetRow): Arbre => {
  try {
    return JSON.parse(row.content) as Arbre;
  } catch {
    return {};
  }
};

/**
 * Le volume système : « C: » sous Windows, le point de montage « / » sous
 * Linux et macOS — l'agent le donne alors dans TYPE. Rien quand l'agent ne le
 * déclare pas, ou sans taille lisible.
 */
const volumeSysteme = (contenu: Arbre): AssetEntry | undefined =>
  entreesDe(sectionsDe(contenu), "DRIVES").find(
    (entree) =>
      (entree["LETTER"] ?? "").trim().toUpperCase().startsWith("C:") ||
      (entree["TYPE"] ?? "").trim() === "/",
  );

const disqueSysteme = (contenu: Arbre): Asset["system_disk"] => {
  const volume = volumeSysteme(contenu);
  if (!volume) return null;
  const total = Number(volume["TOTAL"]);
  const free = Number(volume["FREE"]);
  if (!(total > 0) || Number.isNaN(free)) return null;
  return { free, total };
};

/** Oui, non, ou rien : l'agent écrit « Yes », « 1 » ou « true » selon sa version. */
const ouiNon = (valeur: string | undefined): boolean | null => {
  const v = (valeur ?? "").trim().toLowerCase();
  if (v === "yes" || v === "1" || v === "true") return true;
  if (v === "no" || v === "0" || v === "false") return false;
  return null;
};

/** Le volume système chiffré (BitLocker, FileVault, LUKS), si l'agent le dit. */
const volumeChiffre = (contenu: Arbre): boolean | null =>
  ouiNon(volumeSysteme(contenu)?.["ENCRYPT_STATUS"]);

/**
 * L'architecture : celle que le système déclare (« arm64 », « x86_64 »,
 * « 64-bit »…), à défaut celle que dit la description du processeur
 * (« ARMv8 (64-bit) », « Intel64 Family 6 »).
 */
const architectureDe = (contenu: Arbre, cpu: AssetEntry | undefined): AssetSummary["arch"] => {
  const indices = [
    texteDe(contenu, "OPERATINGSYSTEM", "ARCH"),
    cpu?.["DESCRIPTION"] ?? "",
    cpu?.["NAME"] ?? "",
  ];
  for (const indice of indices.map((i) => i.trim().toLowerCase()).filter(Boolean)) {
    if (/arm|aarch|apple/.test(indice)) return "ARM";
    if (/x86_64|amd64|x64|intel64|64-bit|64 bits/.test(indice)) return "x64";
    if (/i[3-6]86|x86|32-bit|32 bits/.test(indice)) return "x86";
  }
  return "";
};

/** Le nom du chiffrement du volume système et son algorithme ; « None » ne dit rien. */
const chiffrementDe = (contenu: Arbre): AssetSummary["encryption"] => {
  const volume = volumeSysteme(contenu);
  const algorithme = (volume?.["ENCRYPT_ALGO"] ?? "").trim();
  return {
    name: (volume?.["ENCRYPT_NAME"] ?? "").trim(),
    algorithm: algorithme.toLowerCase() === "none" ? "" : algorithme,
  };
};

/** Les profils du pare-feu de Windows, sous leur nom français. */
const PROFILS_PARE_FEU: Record<string, string> = {
  DomainProfile: "Domaine",
  StandardProfile: "Privé",
  PublicProfile: "Public",
};

/**
 * Le pare-feu, tel que l'agent le décrit : une entrée par profil sous Windows,
 * une seule ailleurs (macOS). Les entrées sans état lisible ne comptent pas.
 */
const pareFeuDe = (sections: AssetSection[]): AssetSummary["firewall"] => {
  const profils = entreesDe(sections, "FIREWALL")
    .map((entree) => ({
      nom: PROFILS_PARE_FEU[entree["PROFILE"] ?? ""] ?? entree["PROFILE"] ?? "",
      actif: ouiNon(
        { on: "yes", off: "no" }[(entree["STATUS"] ?? "").trim().toLowerCase()] ??
          entree["STATUS"],
      ),
    }))
    .filter((profil) => profil.actif !== null);
  if (profils.length === 0) return { state: "unknown", disabled: [] };
  const eteints = profils.filter((profil) => !profil.actif);
  return {
    state: eteints.length === 0 ? "on" : eteints.length === profils.length ? "off" : "partial",
    disabled: eteints.map((profil) => profil.nom).filter(Boolean),
  };
};

/** Le système du poste : son nom, et la famille qui choisit son logo. */
const systemeDe = (contenu: Arbre): Asset["os"] => {
  const nom =
    texteDe(contenu, "OPERATINGSYSTEM", "FULL_NAME") ||
    texteDe(contenu, "OPERATINGSYSTEM", "NAME") ||
    texteDe(contenu, "HARDWARE", "OSNAME");
  const noyau = texteDe(contenu, "OPERATINGSYSTEM", "KERNEL_NAME").toLowerCase();
  if (!nom && !noyau) return null;

  let family: AssetOsFamily = "other";
  if (sousWindows(contenu)) family = "windows";
  else if (noyau === "darwin" || /mac ?os|os x/i.test(nom)) family = "macos";
  else if (/ubuntu/i.test(nom)) family = "ubuntu";
  else if (/debian/i.test(nom)) family = "debian";
  else if (/red ?hat|rhel/i.test(nom)) family = "redhat";
  else if (/fedora/i.test(nom)) family = "fedora";
  else if (noyau === "linux" || /linux/i.test(nom)) family = "linux";
  return {
    family,
    // « Microsoft » n'apprend rien devant « Windows ».
    name: nom.replace(/^Microsoft\s+/i, ""),
    // La version d'affichage de Windows (« 23H2 ») dit plus que son numéro.
    version:
      texteDe(contenu, "OPERATINGSYSTEM", "DISPLAYVERSION") ||
      texteDe(contenu, "OPERATINGSYSTEM", "VERSION"),
    kernel: texteDe(contenu, "OPERATINGSYSTEM", "KERNEL_VERSION"),
  };
};

/**
 * Les produits que l'agent nomme mal : son nom technique, remplacé par celui
 * sous lequel on le connaît. Seul le nom du produit change — l'inventaire
 * rangé en base reste tel que l'agent l'a envoyé, et les chemins des
 * processus gardent le leur.
 */
const NOMS_DE_PRODUIT: Record<string, string> = {
  "Sentinel Agent": "SentinelOne EPP",
};

const nomDeProduit = (nom: string): string => NOMS_DE_PRODUIT[nom.trim()] ?? nom;

/** Les sections dont le champ NAME est un nom de produit. */
const SECTIONS_DE_PRODUITS = new Set(["ANTIVIRUS", "SOFTWARES"]);

/**
 * La protection du poste. Windows en déclare souvent deux — Defender resté en
 * retrait à côté de celle qu'on a installée : la première active l'emporte.
 * Hors de Windows, l'agent n'en recense aucune : rien ne permet de conclure
 * qu'il n'y en a pas.
 */
const protectionDe = (contenu: Arbre): AssetProtection => {
  const protections = entreesDe(sectionsDe(contenu), "ANTIVIRUS");
  const retenue =
    protections.find((p) => ouiNon(p["ENABLED"]) === true) ?? protections[0];
  if (!retenue) {
    return { state: sousWindows(contenu) ? "none" : "unknown", name: "", company: "" };
  }
  return {
    state: ouiNon(retenue["ENABLED"]) === false ? "inactive" : "active",
    name: nomDeProduit(retenue["NAME"] ?? ""),
    company: retenue["COMPANY"] ?? "",
  };
};

/**
 * Ce que la liste montre : le nom et le système, qui s'y connecte, quand on
 * l'a vu, sa protection, et l'état de son disque système.
 */
export const assetOf = (row: AssetRow, contenu: Arbre = contenuDe(row)): Asset => ({
  id: row.id,
  name: row.name,
  company_id: row.company_id,
  user: row.last_user,
  last_inventory: row.last_inventory,
  system_disk: disqueSysteme(contenu),
  system_disk_encrypted: volumeChiffre(contenu),
  os: systemeDe(contenu),
  protection: protectionDe(contenu),
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
export const utilisateurDuContenu = (contenu: Arbre): string => {
  const sessions = contenu["USERS"];
  const ouvertes = Array.isArray(sessions) ? sessions : sessions ? [sessions] : [];
  for (const session of ouvertes) {
    const login = texteDe(session, "LOGIN");
    if (!login) continue;
    const domaine = texteDe(session, "DOMAIN");
    return domaine ? `${domaine}\\${login}` : login;
  }

  return texteDe(contenu, "HARDWARE", "LASTLOGGEDUSER") || texteDe(contenu, "ACCESSLOG", "USERID");
};

/** Les entrées d'une section, ou rien : toutes sont facultatives. */
const entreesDe = (sections: AssetSection[], nom: string) =>
  sections.find((section) => section.name === nom)?.entries ?? [];

/**
 * L'identifiant TeamViewer, tel que l'agent l'a lu dans la base de registres
 * (ou par « teamviewer --info »). Un poste peut porter plusieurs outils de
 * prise en main : on ne retient que celui-là, c'est le seul qu'on sache
 * ouvrir.
 */
const teamviewerDe = (sections: AssetSection[]): string =>
  entreesDe(sections, "REMOTE_MGMT").find(
    (entree) => (entree["TYPE"] ?? "").toLowerCase() === "teamviewer",
  )?.["ID"] ?? "";

/** Une adresse qui ne mène nulle part : la machine elle-même, ou un lien mort. */
const inutilisable = (adresse: string): boolean =>
  !adresse || adresse.startsWith("127.") || adresse.startsWith("169.254.") || adresse === "0.0.0.0";

/**
 * Par où joindre le poste. Les cartes réseau actives d'abord, les virtuelles
 * en dernier — une machine qui fait tourner des conteneurs en déclare
 * volontiers cinq, dont une seule mène quelque part.
 *
 * C'est l'adresse qu'avait le poste à son dernier inventaire : en DHCP elle a
 * pu changer depuis, et c'est pour ça que l'échec d'une demande d'inventaire
 * dit toujours quelle adresse a été appelée.
 */
const adresseDe = (sections: AssetSection[]): string => {
  const cartes = entreesDe(sections, "NETWORKS");
  const premiere = (entree: Record<string, string>): string =>
    (entree["IPADDRESS"] ?? "").split(",")[0]!.trim();

  const active = cartes.find(
    (entree) =>
      (entree["STATUS"] ?? "").toLowerCase() === "up" &&
      entree["VIRTUALDEV"] !== "1" &&
      !inutilisable(premiere(entree)),
  );
  if (active) return premiere(active);

  const autre = cartes.find((entree) => !inutilisable(premiere(entree)));
  if (autre) return premiere(autre);

  // Ce que la machine dit d'elle-même, à défaut : plusieurs adresses y sont
  // parfois collées, séparées par une barre oblique.
  const materiel = entreesDe(sections, "HARDWARE")[0]?.["IPADDR"] ?? "";
  const declaree = materiel
    .split(/[/,]/)
    .map((a) => a.trim())
    .find((a) => !inutilisable(a));
  return declaree ?? "";
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
const SECTIONS_MASQUEES = new Set([
  "ACCESSLOG",
  "ACCOUNTINFO",
  "ENVS",
  "LICENSEINFOS",
  "VERSIONCLIENT",
  "VERSIONPROVIDER",
]);
const CHAMPS_GARDES: Record<string, string[]> = {
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
const CHAMPS_RETIRES: Record<string, string[]> = {
  CPUS: ["FAMILYNUMBER", "ID", "MODEL", "SPEED", "STEPPING"],
  // L'EDID brut de l'écran, encodé : illisible, et ce qu'il dit est déjà
  // dans les autres champs.
  MONITORS: ["BASE64"],
};

/** Une entrée telle que la fiche la montre, selon la règle de sa section. */
const entreeAffichee = (section: string, brute: AssetEntry): AssetEntry => {
  let entree =
    SECTIONS_DE_PRODUITS.has(section) && typeof brute["NAME"] === "string"
      ? { ...brute, NAME: nomDeProduit(brute["NAME"]) }
      : brute;
  // Le modèle sous son nom, l'identifiant à la suite : « MacBook Pro 16"
  // (M2 Max, 2023) — Mac14,6 ».
  const modele = section === "BIOS" ? nomDuModele(entree["SMODEL"] ?? "") : "";
  if (modele) entree = { ...entree, SMODEL: `${modele} — ${entree["SMODEL"]}` };
  const gardes = CHAMPS_GARDES[section];
  if (gardes) {
    return Object.fromEntries(
      gardes.filter((champ) => champ in entree).map((champ) => [champ, entree[champ]!]),
    );
  }
  const retires = CHAMPS_RETIRES[section];
  if (retires) {
    return Object.fromEntries(Object.entries(entree).filter(([champ]) => !retires.includes(champ)));
  }
  return entree;
};

/**
 * Windows, d'après ce que le poste dit de son système. L'agent le nomme de
 * plusieurs façons selon sa version : on prend la première qui répond.
 */
const sousWindows = (contenu: Arbre): boolean =>
  texteDe(contenu, "OPERATINGSYSTEM", "KERNEL_NAME").toLowerCase() === "mswin32" ||
  /windows/i.test(texteDe(contenu, "OPERATINGSYSTEM", "NAME")) ||
  /windows/i.test(texteDe(contenu, "HARDWARE", "OSNAME"));

/**
 * Les entrées qu'on écarte d'une section. Sous Linux et macOS, les comptes
 * dont le login commence par « _ » sont ceux des services (_www, _spotlight…),
 * et de même pour les groupes : macOS en déclare une centaine, et personne ne
 * s'y connecte.
 */
const entreeEcartee = (section: string, entree: AssetEntry, windows: boolean): boolean => {
  if (windows) return false;
  if (section === "LOCAL_USERS") return (entree["LOGIN"] ?? "").startsWith("_");
  if (section === "LOCAL_GROUPS") return (entree["NAME"] ?? "").startsWith("_");
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
const administrateursDe = (sections: AssetSection[]): ((compte: AssetEntry) => boolean) => {
  const membres = new Set(
    entreesDe(sections, "LOCAL_GROUPS")
      .filter((groupe) => groupe["ID"] === "S-1-5-32-544" || groupe["NAME"] === "admin")
      .flatMap((groupe) => (groupe["MEMBER"] ?? "").split(","))
      .map((membre) => membre.trim().toLowerCase())
      .filter(Boolean),
  );
  return (compte) =>
    compte["ID"] === "0" ||
    /^S-1-5-21-.*-500$/.test(compte["ID"] ?? "") ||
    [compte["LOGIN"], compte["NAME"]].some((nom) => nom && membres.has(nom.toLowerCase()));
};

const sectionsAffichees = (sections: AssetSection[], windows: boolean): AssetSection[] => {
  const administrateur = administrateursDe(sections);
  return sections
    .filter((section) => !SECTIONS_MASQUEES.has(section.name))
    .map((section) => ({
      ...section,
      entries: section.entries
        .filter((entree) => !entreeEcartee(section.name, entree, windows))
        .map((entree) =>
          section.name === "LOCAL_USERS" && administrateur(entree)
            ? { ...entree, ADMIN: "1" }
            : entree,
        )
        .map((entree) => entreeAffichee(section.name, entree))
        .filter((entree) => Object.keys(entree).length > 0),
    }))
    .filter((section) => section.entries.length > 0);
};

/**
 * Le poste ouvert : l'inventaire, section par section. Un contenu
 * illisible — une base écrite à la main, un envoi tronqué — rend un poste sans
 * section plutôt que de faire tomber la requête.
 */
export const assetDetail = (row: AssetRow): AssetDetail => {
  const contenu = contenuDe(row);
  const sections = sectionsDe(contenu);

  return {
    ...assetOf(row, contenu),
    deviceid: row.deviceid,
    tag: row.tag,
    created_at: row.created_at,
    // TeamViewer et l'adresse se lisent sur l'inventaire entier : ce que la
    // fiche masque peut encore servir à les trouver.
    sections: sectionsAffichees(sections, sousWindows(contenu)),
    teamviewer_id: teamviewerDe(sections),
    address: adresseDe(sections),
    summary: resumeDe(sections, contenu),
    // Elle se lit sur endoflife.date : la route la pose (lib/endoflife.ts).
    support: null,
  };
};

/** Un nombre positif, ou rien. */
const nombre = (valeur: string | undefined): number | null => {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Les cartes réseau physiques qui ont une adresse : Ethernet et Wi-Fi. L'agent
 * donne le genre dans TYPE ; les plus anciens ne le donnent pas, et le nom de
 * la carte le dit alors.
 */
const cartesDe = (sections: AssetSection[]): AssetNetwork[] =>
  entreesDe(sections, "NETWORKS").flatMap((entree): AssetNetwork[] => {
    if (entree["VIRTUALDEV"] === "1") return [];
    const description = entree["DESCRIPTION"] ?? "";
    const type = (entree["TYPE"] ?? "").toLowerCase();
    const wifi = type === "wifi" || /wi-?fi|wireless|wlan|802\.11/i.test(description);
    const ethernet = type === "ethernet" || (!type && /ethernet|gbe|lan\b/i.test(description));
    if (!wifi && !ethernet) return [];
    const ips = (entree["IPADDRESS"] ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => !inutilisable(a));
    if (ips.length === 0) return [];
    return [{ kind: wifi ? "wifi" : "ethernet", description, ips }];
  });

/** L'onglet « Résumé » : ce qu'on cherche d'abord en ouvrant un poste. */
const resumeDe = (sections: AssetSection[], contenu: Arbre): AssetSummary => {
  const bios = entreesDe(sections, "BIOS")[0] ?? {};
  const cpus = entreesDe(sections, "CPUS");
  const premier = cpus[0];
  // La mémoire que la machine déclare, à défaut la somme de ses barrettes.
  const barrettes = entreesDe(sections, "MEMORIES")
    .map((m) => nombre(m["CAPACITY"]) ?? 0)
    .reduce((a, b) => a + b, 0);
  const memoire = nombre(entreesDe(sections, "HARDWARE")[0]?.["MEMORY"]) ?? (barrettes || null);

  return {
    networks: cartesDe(sections),
    manufacturer: bios["SMANUFACTURER"] ?? bios["MMANUFACTURER"] ?? "",
    // Le nom que le Paramétrage donne à l'identifiant (« Mac14,6 »), s'il
    // en a un.
    model: nomDuModele(bios["SMODEL"] ?? "") || (bios["SMODEL"] ?? ""),
    serial: bios["SSN"] ?? "",
    cpu: premier?.["NAME"]
      ? {
          name: premier["NAME"].trim(),
          count: cpus.length,
          cores: nombre(premier["CORE"]),
          threads: nombre(premier["THREAD"]),
        }
      : null,
    memory: memoire,
    arch: architectureDe(contenu, premier),
    encryption: chiffrementDe(contenu),
    firewall: pareFeuDe(sections),
  };
};
