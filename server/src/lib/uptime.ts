// Les vérifications du widget Uptime du mode Accès.
//
// Un élément Uptime surveille des machines : chacune se désigne par son IP ou
// son nom, et se vérifie d'une des quatre façons que le widget propose —
// un ping (ICMP), une connexion à un port (TCP), la lecture d'un OID (SNMP
// v2c), ou la clé « agent.ping » demandée à son agent Zabbix. Le navigateur ne
// sait rien faire de cela : c'est le serveur qui vérifie, à l'intervalle que
// l'élément règle, et qui garde en base l'état de chaque machine et depuis
// quand il dure. La page le lit là.
//
// Une machine se range par ce qui la vérifie, pas par élément : deux éléments
// qui surveillent la même chose n'en font qu'une vérification, au plus court
// de leurs deux intervalles.
//
// Quand l'état change, les acteurs de l'élément en sont prévenus par une
// notification : les personnes qu'il nomme, et les membres des groupes Entra
// qu'il nomme. Une vérification manquée est retentée aussitôt avant de
// conclure : un paquet perdu ne doit pas faire sonner une panne.
//
// Le ping passe par la commande « ping » du système : Node n'ouvre pas de
// socket ICMP. SNMP et Zabbix se parlent ici, à la main — un GET SNMP et une
// clé Zabbix tiennent en quelques octets, et ne justifient pas une dépendance.

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import dgram from "node:dgram";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { inflateSync } from "node:zlib";
import {
  UPTIME_INTERVAL_DEFAUT,
  UPTIME_INTERVAL_MAX,
  UPTIME_INTERVAL_MIN,
  UPTIME_PORTS_DEFAUT,
  isUptimeCheckType,
} from "@milo/shared";
import type { AccessUptime, Id, Notification, UptimeCheckType, UptimeStatus } from "@milo/shared";
import type { AccessUptimeRow } from "../db/rows.js";
import { selection } from "../db/query.js";
import { accessUptime } from "../repositories/access.js";
import { notifications } from "../repositories/notifications.js";
import { now } from "./time.js";

/** Au-delà, la machine ne répond pas. */
const DELAI = 3_000;

/** La vérification de fond regarde à ce rythme quelles machines sont arrivées à échéance. */
export const INTERVALLE_TOUR_UPTIME = 5_000;

/** Les vérifications menées de front : assez pour un parc, pas de quoi saturer le réseau. */
const DE_FRONT = 16;

/**
 * Les pings menés de front, sous les seize vérifications : chacun lance un
 * processus « ping », bien plus lourd qu'une socket TCP ou UDP. Les autres
 * attendent leur tour.
 */
const PINGS_DE_FRONT = 4;

/** Ce qu'une réponse SNMP ou Zabbix pèse au plus : au-delà, ce n'en est pas une. */
const REPONSE_MAX = 64 * 1024;

/** Ce qu'on garde de la valeur lue. */
const DETAIL_MAX = 120;

// --- Réglages ----------------------------------------------------------------

/** Une machine, telle que la configuration de l'élément la décrit. */
export interface Machine {
  id: string;
  nom: string;
  hote: string;
  type: UptimeCheckType;
  port: number | null;
  oid: string;
  communaute: string;
}

export interface ReglagesUptime {
  machines: Machine[];
  /** En secondes. */
  intervalle: number;
  /** Les acteurs : les comptes prévenus d'un changement d'état. */
  acteurs: Id[];
  /** Les groupes Entra acteurs, par identifiant d'objet : leurs membres sont prévenus. */
  groupes: string[];
}

const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur.trim() : "");

const borne = (valeur: unknown, defaut: number, min: number, max: number): number => {
  const lu = valeur === "" || valeur === null || valeur === undefined ? NaN : Number(valeur);
  return Number.isFinite(lu) ? Math.min(max, Math.max(min, Math.round(lu))) : defaut;
};

const portDe = (valeur: unknown, type: UptimeCheckType): number | null => {
  const lu = valeur === "" || valeur === null || valeur === undefined ? NaN : Number(valeur);
  return Number.isInteger(lu) && lu >= 1 && lu <= 65535 ? lu : UPTIME_PORTS_DEFAUT[type];
};

/**
 * Les réglages d'un élément Uptime. Le serveur ne lit d'ordinaire pas la
 * configuration d'un widget ; celle-ci, il la lit parce qu'il vérifie les
 * machines lui-même. Les clés sont celles du widget
 * (client/src/widgets/uptime.tsx).
 */
export const reglagesUptime = (config: Record<string, unknown>): ReglagesUptime => {
  const brutes = Array.isArray(config.machines) ? config.machines : [];
  const machines: Machine[] = [];
  for (const brute of brutes) {
    if (!brute || typeof brute !== "object") continue;
    const m = brute as Record<string, unknown>;
    const type = isUptimeCheckType(m.type) ? m.type : "icmp";
    machines.push({
      id: texte(m.id),
      nom: texte(m.nom),
      hote: texte(m.hote).replace(/^\[|\]$/g, ""),
      type,
      port: portDe(m.port, type),
      oid: texte(m.oid),
      communaute: texte(m.communaute) || "public",
    });
  }
  return {
    machines,
    intervalle: borne(config.intervalle, UPTIME_INTERVAL_DEFAUT, UPTIME_INTERVAL_MIN, UPTIME_INTERVAL_MAX),
    acteurs: Array.isArray(config.acteurs)
      ? config.acteurs.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [],
    groupes: Array.isArray(config.groupes)
      ? config.groupes.map((g) => texte((g as Record<string, unknown> | null)?.id)).filter(Boolean)
      : [],
  };
};

/**
 * Ce qui désigne une vérification : deux machines qui se vérifient pareil
 * sont la même ligne en base. Le nom n'en est pas — il ne change rien à ce
 * qu'on demande à la machine.
 */
const cleDe = (m: Machine): string =>
  JSON.stringify([
    m.type,
    m.hote.toLowerCase(),
    m.type === "icmp" ? null : m.port,
    m.type === "snmp" ? m.oid : "",
    m.type === "snmp" ? m.communaute : "",
  ]);

// --- Vérifications -----------------------------------------------------------

interface Resultat {
  up: boolean;
  detail: string;
}

const enPanne = (detail: string): Resultat => ({ up: false, detail });

/**
 * Un hôte tel qu'on peut le passer à « ping » : un nom ou une adresse, rien
 * qui commence par un tiret et passerait pour une option.
 */
const HOTE = /^[A-Za-z0-9:][A-Za-z0-9.:_-]{0,252}$/;

/** Ce qu'une erreur réseau veut dire, dans les mots de la colonne. */
const motDe = (erreur: NodeJS.ErrnoException, port?: number | null): string => {
  switch (erreur.code) {
    case "ECONNREFUSED":
      return port ? `Port ${port} fermé` : "Connexion refusée";
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "EAI_NONAME":
      return "Hôte introuvable";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "Hôte injoignable";
    case "ECONNRESET":
      return "Connexion coupée";
    default:
      return erreur.message || "Vérification impossible";
  }
};

const couper = (detail: string): string =>
  detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX - 1)}…` : detail;

/** Les pings en cours, et ceux qui attendent qu'une place se libère. */
let pingsEnCours = 0;
const pingsEnAttente: (() => void)[] = [];

/** Mène la tâche dès qu'il y a moins de « PINGS_DE_FRONT » pings en cours. */
const aSonTour = async <T>(tache: () => Promise<T>): Promise<T> => {
  if (pingsEnCours >= PINGS_DE_FRONT) {
    await new Promise<void>((place) => pingsEnAttente.push(place));
  } else {
    pingsEnCours++;
  }
  try {
    return await tache();
  } finally {
    // La place passe directement à qui attend : le compte ne bouge pas.
    const suivant = pingsEnAttente.shift();
    if (suivant) suivant();
    else pingsEnCours--;
  }
};

/** Un ping, par la commande du système, au plus « PINGS_DE_FRONT » à la fois. */
const icmp = (hote: string): Promise<Resultat> => aSonTour(() => pingUnique(hote));

const pingUnique = (hote: string): Promise<Resultat> =>
  new Promise((resolve) => {
    execFile(
      "ping",
      ["-n", "-c", "1", "-W", String(DELAI / 1000), hote],
      { timeout: DELAI + 2_000 },
      (erreur, sortie) => {
        if (!erreur) {
          const temps = /time[=<]\s*([\d.]+)\s*ms/.exec(sortie);
          resolve({ up: true, detail: temps ? `${temps[1]} ms` : "Répond au ping" });
          return;
        }
        if ((erreur as NodeJS.ErrnoException).code === "ENOENT") {
          resolve(enPanne("La commande ping est absente du serveur"));
          return;
        }
        // « ping » rend 2 quand il ne résout pas le nom, 1 quand rien ne répond.
        resolve(enPanne(/unknown host|not known|failure in name/i.test(String(erreur.message))
          ? "Hôte introuvable"
          : "Ne répond pas au ping"));
      },
    );
  });

/** Une connexion au port, refermée dès qu'elle est établie. */
const tcp = (hote: string, port: number): Promise<Resultat> =>
  new Promise((resolve) => {
    const debut = Date.now();
    const socket = net.connect({ host: hote, port, timeout: DELAI });
    const finir = (resultat: Resultat) => {
      socket.destroy();
      resolve(resultat);
    };
    socket.once("connect", () => finir({ up: true, detail: `Port ${port} ouvert · ${Date.now() - debut} ms` }));
    socket.once("timeout", () => finir(enPanne(`Port ${port} : pas de réponse`)));
    socket.once("error", (erreur) => finir(enPanne(motDe(erreur, port))));
  });

/**
 * La clé « agent.ping » demandée à l'agent Zabbix, en contrôle passif : l'agent
 * répond « 1 » quand il tourne. Il ne répond qu'aux serveurs que sa directive
 * « Server= » nomme : sans Milo dedans, il ferme la connexion sans rien dire.
 *
 * Le paquet : « ZBXD », un octet de drapeaux, la longueur des données et un
 * champ réservé — sur quatre octets chacun, ou huit pour un grand paquet —,
 * puis les données, compressées quand le drapeau le dit.
 */
const zabbix = (hote: string, port: number): Promise<Resultat> =>
  new Promise((resolve) => {
    const socket = net.connect({ host: hote, port, timeout: DELAI });
    const morceaux: Buffer[] = [];
    let total = 0;
    let fini = false;
    const finir = (resultat: Resultat) => {
      if (fini) return;
      fini = true;
      socket.destroy();
      resolve(resultat);
    };

    socket.once("connect", () => {
      const cle = Buffer.from("agent.ping");
      const entete = Buffer.alloc(13);
      entete.write("ZBXD", 0, "latin1");
      entete[4] = 0x01;
      entete.writeUInt32LE(cle.length, 5);
      socket.write(Buffer.concat([entete, cle]));
    });
    socket.on("data", (morceau: Buffer) => {
      total += morceau.length;
      if (total > REPONSE_MAX) return finir(enPanne("Réponse de l'agent illisible"));
      morceaux.push(morceau);
    });
    socket.once("timeout", () => finir(enPanne(`Agent Zabbix (port ${port}) : pas de réponse`)));
    socket.once("error", (erreur) => finir(enPanne(motDe(erreur, port))));
    socket.once("close", () => {
      const paquet = Buffer.concat(morceaux);
      if (!paquet.length) {
        return finir(enPanne("L'agent Zabbix a fermé la connexion (Milo figure-t-il dans « Server= » ?)"));
      }
      if (paquet.subarray(0, 4).toString("latin1") !== "ZBXD") {
        return finir(enPanne("Ce n'est pas un agent Zabbix"));
      }
      const drapeaux = paquet[4]!;
      const grand = (drapeaux & 0x04) !== 0;
      const debut = grand ? 21 : 13;
      const longueur = grand ? Number(paquet.readBigUInt64LE(5)) : paquet.readUInt32LE(5);
      let donnees = paquet.subarray(debut, debut + longueur);
      try {
        if (drapeaux & 0x02) donnees = inflateSync(donnees);
      } catch {
        return finir(enPanne("Réponse de l'agent illisible"));
      }
      const valeur = donnees.toString("utf8").trim();
      if (valeur === "1") return finir({ up: true, detail: "Agent Zabbix actif" });
      if (valeur.startsWith("ZBX_NOTSUPPORTED")) {
        return finir(enPanne("L'agent ne connaît pas « agent.ping »"));
      }
      finir(enPanne(couper(`L'agent a répondu « ${valeur} »`)));
    });
  });

// --- SNMP v2c, en BER --------------------------------------------------------

const longueurBer = (n: number): Buffer =>
  n < 0x80
    ? Buffer.from([n])
    : n < 0x100
      ? Buffer.from([0x81, n])
      : Buffer.from([0x82, n >> 8, n & 0xff]);

const tlv = (tag: number, contenu: Buffer): Buffer =>
  Buffer.concat([Buffer.from([tag]), longueurBer(contenu.length), contenu]);

const sequence = (...elements: Buffer[]): Buffer => tlv(0x30, Buffer.concat(elements));

const entierBer = (n: number): Buffer => {
  const octets: number[] = [];
  let reste = n;
  do {
    octets.unshift(reste & 0xff);
    reste = Math.floor(reste / 256);
  } while (reste > 0);
  if (octets[0]! & 0x80) octets.unshift(0);
  return tlv(0x02, Buffer.from(octets));
};

const OID = /^\.?[0-2](\.\d+)+$/;

const oidBer = (oid: string): Buffer => {
  const parties = oid.replace(/^\./, "").split(".").map(Number);
  const octets = [parties[0]! * 40 + parties[1]!];
  for (const partie of parties.slice(2)) {
    const septets: number[] = [];
    let reste = partie;
    do {
      septets.unshift(reste & 0x7f);
      reste = Math.floor(reste / 128);
    } while (reste > 0);
    octets.push(...septets.map((s, i) => (i < septets.length - 1 ? s | 0x80 : s)));
  }
  return tlv(0x06, Buffer.from(octets));
};

interface Tlv {
  tag: number;
  contenu: Buffer;
  /** Là où commence l'élément suivant. */
  fin: number;
}

/** L'élément BER qui commence à « pos ». Lève quand le paquet est tronqué. */
const lireTlv = (paquet: Buffer, pos: number): Tlv => {
  const tag = paquet[pos];
  let octet = paquet[pos + 1];
  if (tag === undefined || octet === undefined) throw new Error("tronqué");
  let longueur = octet;
  let debut = pos + 2;
  if (octet & 0x80) {
    const n = octet & 0x7f;
    longueur = 0;
    for (let i = 0; i < n; i++) {
      octet = paquet[debut + i];
      if (octet === undefined) throw new Error("tronqué");
      longueur = longueur * 256 + octet;
    }
    debut += n;
  }
  const fin = debut + longueur;
  if (fin > paquet.length) throw new Error("tronqué");
  return { tag, contenu: paquet.subarray(debut, fin), fin };
};

/** Les éléments d'une séquence, dans l'ordre. */
const enfants = (contenu: Buffer): Tlv[] => {
  const liste: Tlv[] = [];
  for (let pos = 0; pos < contenu.length; ) {
    const element = lireTlv(contenu, pos);
    liste.push(element);
    pos = element.fin;
  }
  return liste;
};

const nonSigne = (contenu: Buffer): bigint =>
  contenu.reduce((somme, octet) => somme * 256n + BigInt(octet), 0n);

const signe = (contenu: Buffer): bigint => {
  const brut = nonSigne(contenu);
  return contenu.length && contenu[0]! & 0x80 ? brut - (1n << BigInt(contenu.length * 8)) : brut;
};

/** La valeur lue, en texte : c'est ce que le survol d'une case montre. */
const valeurSnmp = ({ tag, contenu }: Tlv): string => {
  switch (tag) {
    case 0x02:
      return String(signe(contenu));
    case 0x41: // Counter32
    case 0x42: // Gauge32
    case 0x46: // Counter64
      return String(nonSigne(contenu));
    case 0x43: {
      // TimeTicks : des centièmes de seconde, le plus souvent un uptime.
      const secondes = Number(nonSigne(contenu) / 100n);
      const j = Math.floor(secondes / 86_400);
      const h = Math.floor((secondes % 86_400) / 3_600);
      const min = Math.floor((secondes % 3_600) / 60);
      return j ? `${j} j ${h} h` : h ? `${h} h ${min} min` : `${min} min`;
    }
    case 0x40:
      return Array.from(contenu).join(".");
    case 0x04: {
      const lisible = contenu.toString("utf8");
      // eslint-disable-next-line no-control-regex
      return /^[^\x00-\x08\x0e-\x1f]*$/.test(lisible) ? lisible : contenu.toString("hex");
    }
    case 0x05:
      return "";
    default:
      return `${contenu.length} octets`;
  }
};

/** La lecture d'un OID, en SNMP v2c : la machine est là quand l'agent le rend. */
const snmp = async (hote: string, port: number, oid: string, communaute: string): Promise<Resultat> => {
  if (!OID.test(oid)) return enPanne("OID invalide");
  let adresse: { address: string; family: number };
  try {
    adresse = await lookup(hote);
  } catch {
    return enPanne("Hôte introuvable");
  }

  const requete = crypto.randomInt(1, 0x7fffffff);
  const message = sequence(
    entierBer(1), // v2c
    tlv(0x04, Buffer.from(communaute)),
    tlv(
      0xa0, // GetRequest
      Buffer.concat([
        entierBer(requete),
        entierBer(0),
        entierBer(0),
        sequence(sequence(oidBer(oid), Buffer.from([0x05, 0x00]))),
      ]),
    ),
  );

  return new Promise((resolve) => {
    const socket = dgram.createSocket(adresse.family === 6 ? "udp6" : "udp4");
    let fini = false;
    const finir = (resultat: Resultat) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      socket.close();
      resolve(resultat);
    };
    const minuterie = setTimeout(() => finir(enPanne("L'agent SNMP ne répond pas")), DELAI);

    socket.on("error", (erreur) => finir(enPanne(motDe(erreur))));
    socket.on("message", (paquet) => {
      if (paquet.length > REPONSE_MAX) return;
      try {
        const [, , pdu] = enfants(lireTlv(paquet, 0).contenu);
        if (!pdu || pdu.tag !== 0xa2) return;
        const [id, statut, , liaisons] = enfants(pdu.contenu);
        // Une réponse à une autre demande : on attend la nôtre.
        if (!id || Number(signe(id.contenu)) !== requete) return;
        const erreur = statut ? Number(signe(statut.contenu)) : 0;
        if (erreur) return finir(enPanne(`L'agent SNMP a répondu une erreur (${erreur})`));
        const liaison = liaisons && enfants(liaisons.contenu)[0];
        const valeur = liaison && enfants(liaison.contenu)[1];
        if (!valeur) return finir(enPanne("Réponse SNMP illisible"));
        // noSuchObject, noSuchInstance, endOfMibView : l'agent répond, mais
        // l'OID surveillé n'y est pas — c'est ce qu'on voulait savoir.
        if (valeur.tag >= 0x80 && valeur.tag <= 0x82) {
          return finir(enPanne("OID inconnu de l'agent"));
        }
        const lu = valeurSnmp(valeur);
        finir({ up: true, detail: couper(lu ? `OID : ${lu}` : "Agent SNMP actif") });
      } catch {
        finir(enPanne("Réponse SNMP illisible"));
      }
    });
    socket.send(message, port, adresse.address);
  });
};

/** Une vérification, quelle qu'en soit la sorte. */
const verifierUneFois = (m: Machine): Promise<Resultat> => {
  if (!HOTE.test(m.hote)) return Promise.resolve(enPanne("Adresse invalide"));
  switch (m.type) {
    case "icmp":
      return icmp(m.hote);
    case "tcp":
      return m.port ? tcp(m.hote, m.port) : Promise.resolve(enPanne("Port manquant"));
    case "snmp":
      return snmp(m.hote, m.port ?? 161, m.oid, m.communaute);
    case "zabbix":
      return zabbix(m.hote, m.port ?? 10050);
  }
};

/**
 * Une vérification manquée est retentée une fois avant de conclure : un ping
 * perdu, un paquet UDP égaré, et la colonne passerait au rouge pour rien.
 */
const verifier = async (m: Machine): Promise<Resultat> => {
  try {
    const premier = await verifierUneFois(m);
    return premier.up ? premier : await verifierUneFois(m);
  } catch (erreur) {
    return enPanne((erreur as Error).message || "Vérification impossible");
  }
};

// --- Ce que la base suit -----------------------------------------------------

/** Un élément qui surveille une machine : qui prévenir — ses acteurs —, et de quoi la nommer. */
interface Abonne {
  nom: string;
  categorieId: Id;
  categorieNom: string;
  destinataires: Id[];
}

interface Suivie {
  machine: Machine;
  /** En secondes : le plus court des éléments qui la suivent. */
  intervalle: number;
  abonnes: Abonne[];
}

/**
 * Les comptes membres d'un groupe Entra, tels que leur dernière connexion les
 * a laissés (users.entra_groups) : Graph n'est pas interrogé à chaque
 * vérification. Quelqu'un qui ne s'est jamais connecté n'y figure pas — il
 * n'aurait de toute façon pas d'écran où voir la notification.
 */
const membres = selection<{ id: Id }>(
  `SELECT id FROM users
    WHERE EXISTS (SELECT 1 FROM json_each(users.entra_groups) WHERE value = ?)`,
);
const membresDe = (groupe: string): Id[] => membres.all(groupe).map((m) => m.id);

/**
 * Les machines suivies, chacune avec les éléments qui la surveillent. Une
 * catégorie privée ne se montre qu'à son auteur : ses éléments ne préviennent
 * donc que lui, quels que soient leurs acteurs.
 */
const machinesSuivies = (): Map<string, Suivie> => {
  const suivies = new Map<string, Suivie>();
  for (const ligne of accessUptime.configurations.all()) {
    let lu: unknown;
    try {
      lu = JSON.parse(ligne.config);
    } catch {
      continue;
    }
    if (!lu || typeof lu !== "object" || Array.isArray(lu)) continue;
    const { machines, intervalle, acteurs, groupes } = reglagesUptime(lu as Record<string, unknown>);
    const tous = [...new Set([...acteurs, ...groupes.flatMap(membresDe)])];
    // Une catégorie privée, ou la structure personnelle d'un compte, ne
    // prévient que lui : les acteurs qu'il a nommés n'en voient rien.
    const seul = ligne.section_owner_id ?? (ligne.is_private ? ligne.owner_id : null);
    const destinataires =
      ligne.section_owner_id !== null || ligne.is_private
        ? tous.filter((id) => id === seul)
        : tous;
    for (const machine of machines) {
      if (!machine.hote) continue;
      const cle = cleDe(machine);
      const abonne: Abonne = {
        nom: machine.nom || machine.hote,
        categorieId: ligne.category_id,
        categorieNom: ligne.category_name,
        destinataires,
      };
      const connue = suivies.get(cle);
      if (connue) {
        connue.intervalle = Math.min(connue.intervalle, intervalle);
        connue.abonnes.push(abonne);
      } else {
        suivies.set(cle, { machine, intervalle, abonnes: [abonne] });
      }
    }
  }
  return suivies;
};

/**
 * Vrai quand la machine est à vérifier. La vérification de fond passe toutes
 * les cinq secondes : une seconde de marge évite qu'une échéance tombée juste
 * après un tour n'attende le suivant.
 */
const aVerifier = (ligne: AccessUptimeRow | undefined, intervalle: number): boolean =>
  !ligne || Date.now() - Date.parse(ligne.checked_at) >= intervalle * 1000 - 1000;

/**
 * Un changement d'état, annoncé à chacun des acteurs des éléments —
 * une fois par personne, même si plusieurs de ses éléments surveillent la
 * machine. Ne lève jamais : l'état est déjà rangé.
 */
const prevenir = (suivie: Suivie, up: boolean, detail: string): void => {
  const quand = now();
  const dejaPrevenus = new Set<Id>();
  for (const abonne of suivie.abonnes) {
    for (const userId of abonne.destinataires) {
      if (dejaPrevenus.has(userId)) continue;
      dejaPrevenus.add(userId);
      try {
        notifications.emettre(userId, {
          id: crypto.randomBytes(8).toString("hex"),
          kind: "access",
          target_id: abonne.categorieId,
          title: abonne.categorieNom,
          message: up ? "répond de nouveau" : `ne répond plus — ${detail}`,
          author: abonne.nom,
          deleted: false,
          created_at: quand,
        } satisfies Notification);
      } catch (erreur) {
        // Un compte supprimé depuis que l'élément le nomme, le plus souvent.
        console.error("Notification Uptime abandonnée :", erreur);
      }
    }
  }
};

/** Les vérifications en cours, par clé : une machine lente n'est pas relancée par-dessus. */
const enCours = new Set<string>();

const verifierEtRanger = async (cle: string, suivie: Suivie): Promise<void> => {
  enCours.add(cle);
  try {
    const { up, detail } = await verifier(suivie.machine);
    const etat = up ? "up" : "down";
    const avant = accessUptime.byKey.get(cle);
    const instant = now();
    const change = avant !== undefined && avant.state !== etat;
    accessUptime.ranger.run(cle, etat, avant && !change ? avant.since : instant, instant, detail);
    // La première vérification d'une machine n'est pas un changement : elle
    // n'avait pas d'état avant.
    if (change) prevenir(suivie, up, detail);
  } finally {
    enCours.delete(cle);
  }
};

/** Mène les tâches, au plus « n » à la fois. */
const deFront = async <T>(elements: T[], n: number, tache: (e: T) => Promise<void>): Promise<void> => {
  const file = [...elements];
  const ouvrier = async () => {
    for (let e = file.shift(); e !== undefined; e = file.shift()) await tache(e);
  };
  await Promise.all(Array.from({ length: Math.min(n, file.length) }, ouvrier));
};

let tourEnCours = false;

/**
 * La vérification de fond : chaque machine dont l'échéance est passée est
 * vérifiée, seize à la fois. Les machines que plus aucun élément ne suit
 * quittent la base.
 */
export const verifierLesMachines = async (): Promise<void> => {
  if (tourEnCours) return;
  tourEnCours = true;
  try {
    const suivies = machinesSuivies();
    for (const ligne of accessUptime.all.all()) {
      if (!suivies.has(ligne.key)) accessUptime.remove.run(ligne.key);
    }
    const dues = [...suivies].filter(
      ([cle, { intervalle }]) => !enCours.has(cle) && aVerifier(accessUptime.byKey.get(cle), intervalle),
    );
    await deFront(dues, DE_FRONT, ([cle, suivie]) => verifierEtRanger(cle, suivie));
  } finally {
    tourEnCours = false;
  }
};

/**
 * L'état des machines d'un élément, tel que la base le garde. Une machine
 * encore jamais vérifiée — elle vient d'être ajoutée — est « pending », et le
 * tour de fond est lancé sans l'attendre : la page la verra à sa prochaine
 * lecture plutôt qu'au tour suivant.
 */
export const etatsUptime = ({ machines }: ReglagesUptime): AccessUptime => {
  let aLancer = false;
  const statuses = machines.map((machine): UptimeStatus => {
    const ligne = machine.hote ? accessUptime.byKey.get(cleDe(machine)) : undefined;
    if (!ligne) {
      if (machine.hote) aLancer = true;
      return { machine: machine.id, state: "pending", since: null, checked_at: null, detail: "" };
    }
    return {
      machine: machine.id,
      state: ligne.state,
      since: ligne.since,
      checked_at: ligne.checked_at,
      detail: ligne.detail,
    };
  });
  if (aLancer) {
    verifierLesMachines().catch((erreur) => console.error("Vérification Uptime :", erreur));
  }
  return { statuses };
};
