import {
  Badge,
  Box,
  Button,
  Center,
  CopyButton,
  Group,
  Progress,
  RingProgress,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconSelector,
} from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NEUTRAL_HOVER, STRONG_TEXT } from "../../themes/colors";
import GrilleScroll from "../ui/GrilleScroll";
import { ReferenceTag } from "../ui/ReferenceTag";
import { FOND_CARTE } from "./fonds";
import { useColonnesRedimensionnables } from "../ui/useColonnesRedimensionnables";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { AssetEntry, AssetSection } from "@milo/shared";

// Les sections de l'inventaire que la fiche d'un poste montre en tableau,
// plutôt qu'en fiches à la suite : celles qui ont assez de lignes pour qu'on
// veuille les comparer, les trier, y chercher la bonne.

/** Une valeur absente se lit pareil partout : un tiret discret. */
export const VIDE = "—";

// --- Le tableau triable -----------------------------------------------------

type Sens = "asc" | "desc";

interface Colonne {
  cle: string;
  libelle: string;
  /**
   * Ce sur quoi la colonne se trie. Rien — ou une chaîne vide — quand la
   * ligne n'en dit rien : elle passe alors en bas, dans un sens comme dans
   * l'autre.
   */
  valeur: (entree: AssetEntry) => string | number | null;
  rendu: (entree: AssetEntry) => ReactNode;
  /** Le sens du premier clic : décroissant pour ce qu'on cherche en haut. */
  premierSens?: Sens;
  adroite?: boolean;
  largeur?: CSSProperties["width"];
}

interface Tri {
  cle: string;
  sens: Sens;
}

/** L'en-tête d'une colonne : un clic trie, un second inverse. */
function EnTete({
  colonne,
  tri,
  onTri,
  poignee,
}: {
  colonne: Colonne;
  tri: Tri;
  onTri: () => void;
  poignee: ReactNode;
}) {
  const actif = tri.cle === colonne.cle;
  const Icone = !actif ? IconSelector : tri.sens === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={{ width: colonne.largeur }}>
      <UnstyledButton onClick={onTri} style={{ width: "100%" }}>
        <Group
          gap={4}
          wrap="nowrap"
          justify={colonne.adroite ? "flex-end" : "space-between"}
        >
          <Text size="sm" fw={600} c={STRONG_TEXT}>
            {colonne.libelle}
          </Text>
          <Center c={actif ? undefined : "dimmed"}>
            <Icone size={14} />
          </Center>
        </Group>
      </UnstyledButton>
      {poignee}
    </Table.Th>
  );
}

function TableauTriable({
  colonnes,
  entrees,
  triInitial,
  espacement = 4,
  largeurs,
  parPage,
}: {
  colonnes: Colonne[];
  entrees: AssetEntry[];
  triInitial: Tri;
  espacement?: number;
  /**
   * Les largeurs de départ, en pixels, des colonnes qui en ont une ; les
   * autres se partagent le reste. Sans elles, la mise en page naturelle.
   */
  largeurs?: Record<string, number>;
  /**
   * La hauteur de la grille, en lignes : au-delà, elle défile dans sa propre
   * zone, l'entête restant en haut. C'est aussi le nombre de lignes montrées
   * d'abord, et ajoutées chaque fois qu'on arrive au bas de la zone. Sans
   * lui, toutes d'un coup, sur toute leur hauteur.
   */
  parPage?: number;
}) {
  const [tri, setTri] = useState<Tri>(triInitial);
  // Une tranche d'avance sur la hauteur de la zone : sans elle, la zone ne
  // contiendrait que ce qu'elle montre, n'aurait rien à faire défiler, et la
  // suite ne viendrait jamais.
  const premieres = parPage ? 2 * parPage : Infinity;
  const [montrees, setMontrees] = useState(premieres);
  // Le repère sous la dernière ligne : quand il paraît, la suite vient.
  const repere = useRef<HTMLDivElement>(null);
  // La grille, pour mesurer la hauteur de ses « parPage » premières lignes.
  const cadre = useRef<HTMLDivElement>(null);
  const [hauteur, setHauteur] = useState<number | undefined>(undefined);
  // Chaque tableau de l'inventaire se reconnaît à ses colonnes.
  const cles = colonnes.map((c) => c.cle);
  const redim = useColonnesRedimensionnables(`inventaire.${cles.join("-")}`, cles, largeurs);

  const trier = (colonne: Colonne) => {
    // Un autre ordre repart du haut de la grille.
    setMontrees(premieres);
    setTri((courant) =>
      courant.cle === colonne.cle
        ? { cle: colonne.cle, sens: courant.sens === "asc" ? "desc" : "asc" }
        : { cle: colonne.cle, sens: colonne.premierSens ?? "asc" },
    );
  };

  const triees = useMemo(() => {
    const colonne = colonnes.find((c) => c.cle === tri.cle);
    if (!colonne) return entrees;
    const facteur = tri.sens === "asc" ? 1 : -1;
    return [...entrees].sort((a, b) => {
      const gauche = colonne.valeur(a);
      const droite = colonne.valeur(b);
      const absentG = gauche === null || gauche === "";
      const absentD = droite === null || droite === "";
      if (absentG || absentD) return absentG === absentD ? 0 : absentG ? 1 : -1;
      if (typeof gauche === "number" && typeof droite === "number") {
        return (gauche - droite) * facteur;
      }
      // « numeric » range « 10.2 » après « 9.1 », et « sensitivity » met
      // « adobe » et « Adobe » ensemble.
      return (
        String(gauche).localeCompare(String(droite), "fr", {
          numeric: true,
          sensitivity: "base",
        }) * facteur
      );
    });
  }, [colonnes, entrees, tri]);

  const reste = triees.length > montrees;
  useEffect(() => {
    const cible = repere.current;
    if (!cible || !reste || !parPage) return;
    // Une part réellement visible du repère, et non « isIntersecting » : dans
    // une section repliée, de hauteur nulle, le navigateur le dit visible par
    // une intersection d'aire nulle, et tout se chargerait d'un coup.
    const observateur = new IntersectionObserver((vus) => {
      if (vus.some((v) => v.intersectionRatio > 0)) setMontrees((n) => n + parPage);
    });
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, [reste, parPage, montrees]);

  // La hauteur de la zone : l'entête et les « parPage » premières lignes. Elle
  // se mesure de nouveau quand la grille change de taille — une section
  // repliée n'en a pas, et se déplie plus tard.
  useLayoutEffect(() => {
    const grille = cadre.current;
    if (!grille || !parPage) return;
    const mesurer = () => {
      const lignes = grille.querySelectorAll("tbody tr");
      const derniere = lignes[parPage - 1];
      if (lignes.length <= parPage || !derniere) return setHauteur(undefined);
      // Du haut du cadre au bas de la dernière ligne, plus la marge du bas.
      const marge = parseFloat(getComputedStyle(grille).paddingBottom) || 0;
      const h =
        derniere.getBoundingClientRect().bottom - grille.getBoundingClientRect().top + marge;
      if (h > 0) setHauteur(Math.ceil(h));
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(grille);
    return () => observateur.disconnect();
  }, [parPage, triees.length]);

  const grille = (
    <Table {...redim.tableProps} verticalSpacing={espacement} horizontalSpacing="xs">
      {redim.colgroup}
      <Table.Thead style={parPage ? ENTETE_COLLEE : undefined}>
        <Table.Tr>
          {colonnes.map((colonne) => (
            <EnTete
              key={colonne.cle}
              colonne={colonne}
              tri={tri}
              onTri={() => trier(colonne)}
              poignee={redim.poignee(colonne.cle)}
            />
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {triees.slice(0, montrees).map((entree, rang) => (
          <Table.Tr key={rang}>
            {colonnes.map((colonne) => (
              <Table.Td
                key={colonne.cle}
                style={colonne.adroite ? { textAlign: "right", whiteSpace: "nowrap" } : undefined}
              >
                {colonne.rendu(entree)}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  // Limitée en hauteur, la grille défile dans les deux sens dans une même
  // zone, où son entête reste collé en haut. La zone recouvre tout le cadre
  // gris de la section (sa marge « md » reprise en négatif, puis rendue à
  // l'intérieur) : la barre longe ainsi la section sur toute sa hauteur,
  // comme celle du tiroir longe la fenêtre. Sinon, élargie à la main
  // au-delà de la section, elle n'y défile que de côté.
  if (parPage) {
    return (
      // La barre fine du tiroir de la fiche : 2 px, toujours visible.
      <ScrollArea.Autosize
        mah={hauteur}
        type="always"
        scrollbarSize={2}
        m="calc(-1 * var(--mantine-spacing-md))"
        style={{ borderRadius: 10 }}
        styles={{ content: { display: "block" } }}
      >
        <Box ref={cadre} p="md">
          {grille}
          {reste && <div ref={repere} style={{ height: 1 }} />}
        </Box>
      </ScrollArea.Autosize>
    );
  }
  return <GrilleScroll>{grille}</GrilleScroll>;
}

/**
 * L'entête d'une grille limitée en hauteur : il reste en haut quand elle
 * défile, à la marge du cadre, et l'ombre pleine au-dessus de lui cache les
 * lignes qui passent dans cette marge.
 */
const ENTETE_COLLEE: CSSProperties = {
  position: "sticky",
  top: "var(--mantine-spacing-md)",
  zIndex: 2,
  backgroundColor: FOND_CARTE,
  boxShadow: `0 calc(-1 * var(--mantine-spacing-md)) 0 ${FOND_CARTE}`,
};

/** Une cellule de texte ordinaire, ou le tiret quand elle est vide. */
const texte = (valeur: string | undefined) => (
  <Text size="sm" style={{ wordBreak: "break-word" }}>
    {valeur || VIDE}
  </Text>
);

/** Un champ tel quel : la colonne la plus simple, triée sur sa valeur. */
const champ = (cle: string, libelle: string): Colonne => ({
  cle,
  libelle,
  valeur: (entree) => entree[cle] ?? null,
  rendu: (entree) => texte(entree[cle]),
});

// --- Volumes ----------------------------------------------------------------

/**
 * Une taille donnée en Mo par l'agent, lisible : « 3,63 To », « 476 Go »,
 * « 512 Mo ». Au-delà de 1 000 Go, elle passe en To.
 */
export const taille = (mo: number): string => {
  const go = mo / 1024;
  if (go > 1000) {
    return `${(go / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} To`;
  }
  return mo >= 1024
    ? `${go.toLocaleString("fr-FR", { maximumFractionDigits: mo >= 10 * 1024 ? 0 : 1 })} Go`
    : `${Math.round(mo).toLocaleString("fr-FR")} Mo`;
};

/** « Yes » et « No » de l'agent, en français ; le reste tel quel. */
const ouiNon = (valeur: string | undefined): string => {
  const v = (valeur ?? "").toLowerCase();
  if (v === "yes" || v === "1" || v === "true") return "Oui";
  if (v === "no" || v === "0" || v === "false") return "Non";
  return valeur ?? "";
};

/**
 * Un GUID de type de partition GPT, que l'agent donne parfois à la place du
 * système de fichiers — sous macOS surtout, où les volumes APFS sortent en
 * « 41504653-0000-11AA-AA11-00306543ECAC » (41504653, c'est « APFS » en
 * ASCII).
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le système de fichiers, ou rien quand l'agent n'a donné qu'un GUID. */
const systemeDeFichiers = (valeur: string | undefined): string =>
  valeur && !GUID.test(valeur.trim()) ? valeur : "";

/**
 * La part occupée d'un volume, de 0 à 100, ou rien : un lecteur optique vide
 * ou un partage injoignable ne donne pas de taille.
 */
const occupation = (entree: AssetEntry): number | null => {
  const total = Number(entree["TOTAL"]);
  const libre = Number(entree["FREE"]);
  if (!(total > 0) || Number.isNaN(libre)) return null;
  return Math.min(100, Math.max(0, ((total - libre) / total) * 100));
};

/** La jauge d'un volume : l'occupé en barre, le libre et le total en clair. */
function Occupation({ entry }: { entry: AssetEntry }) {
  const occupe = occupation(entry);
  if (occupe === null) {
    return (
      <Text size="sm" c="dimmed">
        {VIDE}
      </Text>
    );
  }
  // La couleur ne dit rien tant qu'il reste de la place, et alerte quand il
  // n'en reste plus.
  const couleur = occupe >= 90 ? "red" : occupe >= 75 ? "orange" : "blue";
  return (
    <Stack gap={2}>
      <Progress value={occupe} color={couleur} size="sm" />
      <Text size="xs" c="dimmed">
        {taille(Number(entry["FREE"]))} / {taille(Number(entry["TOTAL"]))}
      </Text>
    </Stack>
  );
}

/** Le volume système : « C: » sous Windows, « / » ailleurs. */
const systeme = (entree: AssetEntry): boolean =>
  (entree["LETTER"] ?? "").toUpperCase() === "C:" || entree["TYPE"] === "/";

/**
 * Les volumes du poste, présentés comme les cartes réseau : une ligne
 * numérotée chacun. Le volume système en tête, puis les plus pleins d'abord ;
 * ceux sans taille à la fin. La lettre ne vient que de Windows ; elle n'est
 * montrée que si l'agent en donne une.
 */
function Volumes({ section }: { section: AssetSection }) {
  const lettres = section.entries.some((entree) => entree["LETTER"]);
  const entrees = [...section.entries].sort(
    (a, b) =>
      Number(systeme(b)) - Number(systeme(a)) ||
      (occupation(b) ?? -1) - (occupation(a) ?? -1),
  );
  // Le système de fichiers et le chiffrement à droite, à largeur fixe.
  const colonnes = [
    ...(lettres ? [`${LARGEUR_PREMIERE}px`] : []),
    "1fr",
    "200px",
    `${LARGEUR_NOMBRE}px`,
  ].join(" ");
  return (
    <LignesNumerotees
      entrees={entrees}
      textes={0}
      nombres={0}
      colonnes={colonnes}
      valeurs={(entree) => (
        <>
          {/* 1re ligne : ce qu'est le volume. */}
          {lettres && <Valeur libelle="Lettre" valeur={entree["LETTER"]} />}
          <Valeur libelle="Type" valeur={entree["TYPE"]} />
          <Valeur
            libelle="Système de fichiers"
            valeur={systemeDeFichiers(entree["FILESYSTEM"])}
            adroite
          />
          <Valeur libelle="Chiffré" valeur={ouiNon(entree["ENCRYPT_STATUS"])} adroite />
          {/* 2e ligne : l'espace, sur toute la largeur. */}
          <Box style={{ gridColumn: "1 / -1" }}>
            <Valeur libelle="Espace" valeur={<Occupation entry={entree} />} />
          </Box>
        </>
      )}
    />
  );
}

// --- EPP / EDR --------------------------------------------------------------

/**
 * Oui ou non, d'après ce que l'agent écrit — « yes », « 1 », « on »… —, ou
 * rien quand il ne dit rien de lisible.
 */
const actif = (valeur: string | undefined): boolean | null => {
  const v = (valeur ?? "").trim().toLowerCase();
  if (["yes", "1", "true", "on", "enabled"].includes(v)) return true;
  if (["no", "0", "false", "off", "disabled"].includes(v)) return false;
  return null;
};

/** Le tag d'un état lisible, ou rien : la valeur garde alors son tiret. */
const tagEtat = (valeur: string | undefined) => {
  const etat = actif(valeur);
  return etat === null ? valeur : <Etat actif={etat} />;
};

/** La largeur de la colonne d'un tag d'état, à droite. */
const LARGEUR_ETAT = 100;

/**
 * Les protections du poste — antivirus, EPP, EDR —, telles que Windows les
 * déclare au centre de sécurité, présentées comme les volumes. Il y en a
 * souvent deux, Defender resté en retrait à côté de celle qu'on a
 * installée : les actives d'abord.
 */
function Protections({ section }: { section: AssetSection }) {
  const entrees = [...section.entries].sort(
    (a, b) => Number(actif(b["ENABLED"]) ?? -1) - Number(actif(a["ENABLED"]) ?? -1),
  );
  return (
    <LignesNumerotees
      entrees={entrees}
      textes={0}
      nombres={0}
      // La version et l'état à droite, à largeur fixe.
      colonnes={`1fr 1fr ${LARGEUR_NOMBRE}px ${LARGEUR_NOMBRE}px`}
      valeurs={(entree) => (
        <>
          <Valeur libelle="Nom" valeur={entree["NAME"]} />
          <Valeur libelle="Éditeur" valeur={entree["COMPANY"]} />
          <Valeur libelle="Version" valeur={entree["VERSION"]} adroite />
          <Valeur libelle="Statut" valeur={tagEtat(entree["ENABLED"])} adroite />
        </>
      )}
    />
  );
}

// --- Pare-feu ---------------------------------------------------------------

/** Les profils du pare-feu de Windows, sous leur nom français. */
const PROFILS_PARE_FEU: Record<string, string> = {
  DomainProfile: "Domaine",
  StandardProfile: "Privé",
  PublicProfile: "Public",
};

/**
 * Le pare-feu du poste, présenté comme les volumes : une entrée par profil
 * sous Windows, une seule ailleurs. Les profils actifs d'abord.
 */
function PareFeu({ section }: { section: AssetSection }) {
  const entrees = [...section.entries].sort(
    (a, b) => Number(actif(b["STATUS"]) ?? -1) - Number(actif(a["STATUS"]) ?? -1),
  );
  return (
    <LignesNumerotees
      entrees={entrees}
      textes={0}
      nombres={0}
      // L'état à droite, à largeur fixe.
      colonnes={`1fr ${LARGEUR_ETAT}px`}
      valeurs={(entree) => (
        <>
          <Valeur
            libelle="Profil"
            valeur={PROFILS_PARE_FEU[entree["PROFILE"] ?? ""] ?? entree["PROFILE"]}
          />
          <Valeur libelle="Statut" valeur={tagEtat(entree["STATUS"])} adroite />
        </>
      )}
    />
  );
}

// --- Processus --------------------------------------------------------------

/**
 * L'application qu'une ligne de commande lance, sans chemin ni paramètre :
 * « svchost.exe » pour « C:\Windows\System32\svchost.exe -k netsvcs ».
 *
 * Un chemin peut porter des espaces sans guillemets — « C:\Program Files\… »,
 * « /Applications/Google Chrome.app/… » —, d'où les cas qui précèdent le
 * simple « premier mot » : sous macOS on prend le nom de l'application, sous
 * Windows on coupe après « .exe ». Les fils du noyau Linux, entre crochets
 * (« [kworker/0:1] »), et les processus de Windows sans chemin ni option
 * (« System Idle Process ») restent tels quels.
 */
const application = (commande: string): string => {
  const texte = commande.trim();
  if (!texte || texte.startsWith("[")) return texte;

  let programme: string;
  const bundle = /([^/]+)\.app\//.exec(texte);
  const exe = /^.*?\.exe\b/i.exec(texte);
  if (texte.startsWith('"')) {
    const fin = texte.indexOf('"', 1);
    programme = fin > 0 ? texte.slice(1, fin) : texte.slice(1);
  } else if (bundle) {
    return bundle[1]!;
  } else if (exe) {
    programme = exe[0];
  } else if (!/[\\/]/.test(texte) && !/\s-/.test(texte)) {
    // Ni chemin ni option : un nom que Windows donne à ses processus à lui,
    // espaces compris (« System Idle Process », « Memory Compression »).
    return texte;
  } else {
    programme = texte.split(/\s/)[0]!;
  }

  // « sshd: jquintard@pts/0 » : le nom que le processus s'est donné.
  return programme.split(/[\\/]/).pop()!.replace(/:$/, "") || texte;
};

/** La part de processeur, en nombre ; rien quand l'agent ne l'a pas lue. */
const cpu = (entree: AssetEntry): number | null => {
  const valeur = Number(entree["CPUUSAGE"]);
  return entree["CPUUSAGE"] && !Number.isNaN(valeur) ? valeur : null;
};

/**
 * Les processus du poste au moment de l'inventaire, les plus gourmands en
 * tête : c'est eux qu'on vient chercher quand un poste rame.
 */
function Processus({ section }: { section: AssetSection }) {
  const colonnes: Colonne[] = [
    {
      cle: "CMD",
      libelle: "Commande",
      valeur: (entree) => application(entree["CMD"] ?? ""),
      // L'application seule, sans chemin ni options.
      rendu: (entree) => (
        <Text size="sm" style={{ wordBreak: "break-word" }}>
          {application(entree["CMD"] ?? "") || VIDE}
        </Text>
      ),
    },
    champ("USER", "Utilisateur"),
    {
      cle: "CPUUSAGE",
      libelle: "CPU",
      valeur: cpu,
      rendu: (entree) => texte(entree["CPUUSAGE"] ? `${entree["CPUUSAGE"]} %` : ""),
      premierSens: "desc",
      adroite: true,
    },
  ];
  return (
    <TableauTriable
      colonnes={colonnes}
      entrees={section.entries}
      triInitial={{ cle: "CPUUSAGE", sens: "desc" }}
      largeurs={{ USER: 250, CPUUSAGE: 80 }}
      parPage={15}
    />
  );
}

// --- Logiciels --------------------------------------------------------------

/**
 * Une date d'installation, rangeable : « 15/03/2024 », comme la donne l'agent
 * sous Windows, devient « 2024-03-15 ». Les autres formats — macOS, Linux —
 * sont déjà dans l'ordre, ou restent tels quels.
 */
const dateRangeable = (valeur: string | undefined): string => {
  const texte = (valeur ?? "").trim();
  const francaise = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texte);
  if (!francaise) return texte;
  const [, jour, mois, an] = francaise;
  return `${an}-${mois!.padStart(2, "0")}-${jour!.padStart(2, "0")}`;
};

/**
 * Les logiciels du poste, par ordre alphabétique : il y en a des centaines,
 * dans l'ordre où l'agent les a trouvés, et une fiche par logiciel faisait
 * défiler longtemps pour trouver le bon. La date s'affiche telle que l'agent
 * la donne — son format change d'un système à l'autre — et ne se relit que
 * pour le tri, le plus récent en tête au premier clic.
 */
function Logiciels({ section }: { section: AssetSection }) {
  const colonnes: Colonne[] = [
    champ("NAME", "Nom"),
    champ("VERSION", "Version"),
    champ("PUBLISHER", "Éditeur"),
    {
      cle: "INSTALLDATE",
      libelle: "Installé le",
      valeur: (entree) => dateRangeable(entree["INSTALLDATE"]),
      rendu: (entree) => texte(entree["INSTALLDATE"]),
      premierSens: "desc",
    },
  ];
  return (
    <TableauTriable
      colonnes={colonnes}
      entrees={section.entries}
      triInitial={{ cle: "NAME", sens: "asc" }}
      largeurs={{ VERSION: 160, PUBLISHER: 180, INSTALLDATE: 110 }}
      parPage={15}
    />
  );
}

// --- Comptes et groupes -----------------------------------------------------

/**
 * Les groupes locaux du poste, par nom, présentés comme les processus : 15
 * lignes de haut, la suite au fil du défilement.
 */
function Groupes({ section }: { section: AssetSection }) {
  return (
    <TableauTriable
      colonnes={[champ("NAME", "Nom")]}
      entrees={section.entries}
      triInitial={{ cle: "NAME", sens: "asc" }}
      parPage={15}
    />
  );
}

/**
 * Les comptes locaux du poste, par nom, un tag vert après le nom des
 * administrateurs (le serveur les marque d'« ADMIN »). Le dossier personnel ne
 * vient que de Linux et de macOS : la colonne n'existe que si l'agent en
 * donne un.
 */
function Comptes({ section }: { section: AssetSection }) {
  const dossiers = section.entries.some((entree) => entree["HOME"]);
  const nom: Colonne = {
    ...champ("NAME", "Nom"),
    rendu: (entree) =>
      entree["ADMIN"] ? (
        <Group gap={8} wrap="nowrap">
          {texte(entree["NAME"])}
          <Badge color="green" variant="filled" size="sm" radius="sm" style={{ flexShrink: 0 }}>
            Admin
          </Badge>
        </Group>
      ) : (
        texte(entree["NAME"])
      ),
  };
  return (
    <TableauTriable
      colonnes={[nom, ...(dossiers ? [champ("HOME", "Dossier")] : [])]}
      entrees={section.entries}
      triInitial={{ cle: "NAME", sens: "asc" }}
    />
  );
}

// --- Machines virtuelles ----------------------------------------------------

/**
 * La mémoire d'une machine virtuelle, en Mo. L'agent la donne tantôt seule,
 * tantôt sous la forme « size=2048 » (Parallels) ; les conteneurs Docker n'en
 * déclarent pas.
 */
const memoire = (entree: AssetEntry): number | null => {
  const chiffres = /\d+(?:[.,]\d+)?/.exec(entree["MEMORY"] ?? "");
  return chiffres ? Number(chiffres[0].replace(",", ".")) : null;
};

/**
 * L'état d'une machine virtuelle : son rang (les démarrées d'abord), son
 * libellé et la couleur de son tag. Ce que l'agent écrit d'autre reste tel
 * quel, en dernier.
 */
const etatVm = (
  statut: string | undefined,
): { rang: number; libelle: string; couleur?: string } => {
  const s = (statut ?? "").trim().toLowerCase();
  if (["running", "started", "up"].includes(s)) {
    return { rang: 0, libelle: "Démarrée", couleur: "green" };
  }
  if (["paused", "suspended", "saved"].includes(s)) {
    return { rang: 1, libelle: "En pause", couleur: "orange" };
  }
  if (["off", "stopped", "exited", "shutdown", "poweroff", "powered off"].includes(s)) {
    return { rang: 2, libelle: "Éteinte", couleur: "red" };
  }
  return { rang: 3, libelle: statut ?? "" };
};

/**
 * Les machines virtuelles et les conteneurs du poste, un tableau par type
 * (« Docker », « Parallels »…), les démarrées d'abord, présenté comme les
 * processus : 15 lignes de haut, la suite au fil du défilement.
 */
function MachinesVirtuelles({ section }: { section: AssetSection }) {
  const colonneMemoire: Colonne = {
    cle: "MEMORY",
    libelle: "Mémoire",
    valeur: memoire,
    rendu: (entree) => {
      const mo = memoire(entree);
      return texte(mo === null ? "" : taille(mo));
    },
    premierSens: "desc",
    adroite: true,
  };
  // La mémoire n'a sa colonne que si une machine du type en déclare une : les
  // conteneurs Docker n'en disent rien.
  const colonnesDe = (entrees: AssetEntry[]): Colonne[] => [
    champ("NAME", "Nom"),
    ...(entrees.some((entree) => memoire(entree) !== null) ? [colonneMemoire] : []),
    {
      cle: "STATUS",
      libelle: "Statut",
      valeur: (entree) => (entree["STATUS"] ? etatVm(entree["STATUS"]).rang : null),
      rendu: (entree) => {
        const etat = etatVm(entree["STATUS"]);
        return etat.couleur ? (
          <Badge color={etat.couleur} variant="filled" size="sm" radius="sm">
            {etat.libelle}
          </Badge>
        ) : (
          texte(etat.libelle)
        );
      },
    },
  ];
  const parType = new Map<string, AssetEntry[]>();
  // Par nom d'abord : à état égal, le tri par statut les garde dans cet ordre.
  const parNom = [...section.entries].sort((a, b) =>
    (a["NAME"] ?? "").localeCompare(b["NAME"] ?? "", "fr", { numeric: true, sensitivity: "base" }),
  );
  for (const entree of parNom) {
    const type = entree["VMTYPE"]?.trim() || "Autre";
    parType.set(type, [...(parType.get(type) ?? []), entree]);
  }
  const types = [...parType.keys()].sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" }),
  );
  // Chaque type sous son titre, au style des sous-catégories des widgets, et
  // dans son propre cadre gris : la section n'en pose pas (SANS_CADRE).
  return (
    <>
      {types.map((type, rang) => (
        <Box key={type} mt={rang === 0 ? 0 : 30}>
          <Title order={2} size={16} fw={400} c="var(--mantine-color-white)" mb={15}>
            {typeCarte(type)}
          </Title>
          <Box p="md" style={{ backgroundColor: FOND_CARTE, borderRadius: 10 }}>
            <TableauTriable
              colonnes={colonnesDe(parType.get(type)!)}
              entrees={parType.get(type)!}
              triInitial={{ cle: "STATUS", sens: "asc" }}
              largeurs={{ MEMORY: 100, STATUS: 120 }}
              parPage={15}
            />
          </Box>
        </Box>
      ))}
    </>
  );
}

// --- Batterie ---------------------------------------------------------------

/** Un libellé discret, et la valeur en dessous. */
function Valeur({
  libelle,
  valeur,
  adroite,
}: {
  libelle: string;
  valeur?: ReactNode;
  /** Vrai pour un nombre, qu'on aligne à droite. */
  adroite?: boolean;
}) {
  return (
    <Stack gap={2} ta={adroite ? "right" : undefined}>
      <Text size="xs" c="dimmed">
        {libelle}
      </Text>
      {/* Un bloc et non un paragraphe : la valeur peut porter un badge. */}
      <Text component="div" size="sm" style={{ wordBreak: "break-word" }}>
        {valeur || VIDE}
      </Text>
    </Stack>
  );
}

/**
 * Les batteries du poste, numérotées : nom et numéro de série. Le
 * reste de ce que l'agent remonte (capacité, chimie, fabricant) n'est pas
 * montré.
 */
function Batterie({ section }: { section: AssetSection }) {
  return (
    <LignesNumerotees
      entrees={section.entries}
      textes={2}
      nombres={0}
      valeurs={(entree) => (
        <>
          <Valeur libelle="Nom" valeur={entree["NAME"]} />
          <Valeur
            libelle="Numéro de série"
            valeur={<AvecCopie valeur={entree["SERIAL"]} />}
          />
        </>
      )}
    />
  );
}

/** L'état de charge d'une alimentation, tel que l'agent le donne, en français. */
const ETATS_ALIMENTATION: Record<string, string> = {
  charging: "En charge",
  charged: "Chargée",
  "fully charged": "Chargée",
  full: "Chargée",
  "not charging": "Pas en charge",
  discharging: "En décharge",
  ok: "OK",
};

/** Les états qui disent qu'une alimentation ne fait pas son travail. */
const ETATS_EN_DEFAUT = new Set(["not charging", "discharging", "error", "failed"]);

/**
 * Les alimentations du poste : nom, fabricant, puissance maximale et état,
 * en tag ; puis le numéro de série et si elle est branchée.
 */
function Alimentation({ section }: { section: AssetSection }) {
  return (
    <LignesNumerotees
      entrees={section.entries}
      textes={0}
      nombres={0}
      // La puissance et l'état à droite, à largeur fixe.
      colonnes={`1fr 1fr ${LARGEUR_NOMBRE + 20}px ${LARGEUR_ETAT}px`}
      valeurs={(entree) => {
        const statut = (entree["STATUS"] ?? "").trim();
        const cle = statut.toLowerCase();
        return (
          <>
            <Valeur libelle="Nom" valeur={entree["NAME"]} />
            <Valeur libelle="Fabricant" valeur={entree["MANUFACTURER"]} />
            <Valeur
              libelle="Puissance max"
              valeur={entree["POWER_MAX"] && `${entree["POWER_MAX"]} W`}
              adroite
            />
            <Valeur
              libelle="Statut"
              valeur={
                statut && (
                  <Badge
                    color={ETATS_EN_DEFAUT.has(cle) ? "red" : "green"}
                    variant="filled"
                    size="sm"
                    radius="sm"
                  >
                    {ETATS_ALIMENTATION[cle] ?? statut}
                  </Badge>
                )
              }
              adroite
            />
            {/* Sur deux colonnes : le numéro et son bouton tiennent sur une ligne. */}
            <Box style={{ gridColumn: "1 / 3" }}>
              <Valeur
                libelle="Numéro de série"
                valeur={<AvecCopie valeur={entree["SERIALNUMBER"]} />}
              />
            </Box>
            <Valeur libelle="Branchée" valeur={ouiNon(entree["PLUGGED"])} adroite />
          </>
        );
      }}
    />
  );
}

// --- Processeurs, mémoire, contrôleurs -------------------------------------

/** Le fond du numéro de chaque ligne : un gris neutre, foncé. */
const FOND_NUMERO = "#4a4a4a";

/** La largeur minimale du rectangle du numéro. */
const LARGEUR_NUMERO = 32;

/** La largeur des colonnes de nombres, alignés à droite. */
const LARGEUR_NOMBRE = 80;

/** La largeur de la première colonne, un mot court : fabricant, type. */
const LARGEUR_PREMIERE = 120;

/**
 * Les entrées d'une section, une par ligne : son numéro dans un rectangle
 * foncé — son rang, ou ce que dit `numero` —, puis ses valeurs. La première
 * colonne a sa largeur fixe, les autres colonnes de texte se partagent le
 * reste, les nombres viennent à droite, dans une colonne étroite chacun.
 * Plus de valeurs que de colonnes passent à la ligne.
 */
function LignesNumerotees({
  entrees,
  textes,
  nombres,
  valeurs,
  numero,
  premiere = LARGEUR_PREMIERE,
  aCote,
  colonnes: gabarit,
  largeurNumero,
}: {
  entrees: AssetEntry[];
  textes: number;
  nombres: number;
  valeurs: (entree: AssetEntry) => ReactNode;
  numero?: (entree: AssetEntry) => string | undefined;
  /** La largeur de la première colonne, en pixels. */
  premiere?: number;
  /** Ce qui vient à droite des valeurs, sur toute la hauteur de la ligne. */
  aCote?: (entree: AssetEntry) => ReactNode;
  /** Les colonnes de la grille, quand l'ordre par défaut ne convient pas. */
  colonnes?: string;
  /** Une largeur fixe pour le rectangle du numéro, au lieu de celle de son contenu. */
  largeurNumero?: number;
}) {
  const colonnes = gabarit ?? [
    `${premiere}px`,
    ...Array<string>(textes - 1).fill("1fr"),
    ...Array<string>(nombres).fill(`${LARGEUR_NOMBRE}px`),
  ].join(" ");
  return (
    // Chaque entrée sur son bloc gris, 20 px de marge intérieure, séparée de
    // la suivante par 2 px du fond de l'interface. La pile recouvre le cadre
    // gris de la section (sa marge « md » reprise en négatif) et en garde
    // l'arrondi.
    <Stack
      gap={2}
      m="calc(-1 * var(--mantine-spacing-md))"
      style={{
        backgroundColor: "var(--mantine-color-body)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {entrees.map((entree, rang) => (
        <Group
          key={rang}
          gap="lg"
          align="stretch"
          wrap="nowrap"
          p={20}
          style={{ backgroundColor: FOND_CARTE }}
        >
          <Center
            miw={LARGEUR_NUMERO}
            w={largeurNumero}
            px="xs"
            style={{ backgroundColor: FOND_NUMERO, borderRadius: 6 }}
          >
            <Text size="sm" fw={600} c="white" style={{ whiteSpace: "nowrap" }}>
              {numero ? numero(entree) || VIDE : rang + 1}
            </Text>
          </Center>
          <Box
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: colonnes,
              columnGap: "var(--mantine-spacing-lg)",
              rowGap: 4,
              // Plus haut que le texte, ce qui est à côté n'étire pas ses lignes.
              alignContent: "start",
            }}
          >
            {valeurs(entree)}
          </Box>
          {aCote?.(entree)}
        </Group>
      ))}
    </Stack>
  );
}

/** Les processeurs du poste : fabricant, modèle, cœurs et threads. */
function Processeurs({ section }: { section: AssetSection }) {
  return (
    <LignesNumerotees
      entrees={section.entries}
      textes={2}
      nombres={2}
      valeurs={(entree) => (
        <>
          <Valeur libelle="Fabricant" valeur={entree["MANUFACTURER"]} />
          <Valeur libelle="Modèle" valeur={entree["NAME"]?.trim()} />
          <Valeur libelle="Cœurs" valeur={entree["CORE"]} adroite />
          <Valeur libelle="Threads" valeur={entree["THREAD"]} adroite />
        </>
      )}
    />
  );
}

/** Le rang d'une carte selon son type : le Wi-Fi d'abord, puis l'Ethernet. */
const rangType = (type: string | undefined): number => {
  const t = (type ?? "").toLowerCase();
  return t === "wifi" ? 0 : t === "ethernet" ? 1 : 2;
};

/** Un type de carte, une majuscule en tête : « wifi » devient « Wifi ». */
const typeCarte = (type: string | undefined): string =>
  type ? type.charAt(0).toUpperCase() + type.slice(1) : "";

/** Un débit en Mb/s, comme l'agent le donne, dit en Gb/s dès le gigabit. */
const debit = (valeur: string | undefined): string => {
  const mb = Number(valeur);
  if (!valeur || Number.isNaN(mb) || mb <= 0) return valeur ?? "";
  return mb >= 1000
    ? `${(mb / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Gb/s`
    : `${mb.toLocaleString("fr-FR")} Mb/s`;
};

/** Un état en tag : vert « Activé », rouge « Désactivé ». */
function Etat({ actif }: { actif: boolean }) {
  return (
    <Badge color={actif ? "green" : "red"} variant="filled" size="sm" radius="sm">
      {actif ? "Activé" : "Désactivé"}
    </Badge>
  );
}

/**
 * Les cartes réseau du poste, les connectées en tête ; parmi elles comme
 * parmi les autres, le Wi-Fi d'abord, puis l'Ethernet, puis le reste. VIRTUALDEV n'est pas montré.
 */
function Reseaux({ section }: { section: AssetSection }) {
  // Les cartes connectées d'abord ; dans chaque groupe, le type départage.
  const deconnectee = (entree: AssetEntry) =>
    (entree["STATUS"] ?? "").toLowerCase() === "up" ? 0 : 1;
  const entrees = [...section.entries].sort(
    (a, b) => deconnectee(a) - deconnectee(b) || rangType(a["TYPE"]) - rangType(b["TYPE"]),
  );
  return (
    <LignesNumerotees
      entrees={entrees}
      textes={4}
      nombres={0}
      valeurs={(entree) => (
        <>
          {/* 1re ligne : ce qu'est la carte et son état. */}
          <Valeur libelle="Type" valeur={typeCarte(entree["TYPE"])} />
          <Valeur libelle="Nom" valeur={entree["DESCRIPTION"]} />
          <Valeur libelle="MAC" valeur={entree["MACADDR"]} />
          <Valeur
            libelle="Statut"
            valeur={
              entree["STATUS"] && <Etat actif={entree["STATUS"].toLowerCase() === "up"} />
            }
          />
          {/* 2e ligne : l'adressage IPv4, la quatrième colonne laissée vide.
              Sans adresse IPv4, la ligne n'est pas montrée. */}
          {entree["IPADDRESS"] && (
            <>
              <Valeur libelle="IPv4" valeur={entree["IPADDRESS"]} />
              <Valeur libelle="Masque" valeur={entree["IPMASK"]} />
              <Valeur libelle="Passerelle" valeur={entree["IPGATEWAY"]} />
              <Box />
            </>
          )}
          {/* 3e ligne : l'IPv6, souvent longue, sur toute la largeur ; cachée
              sans adresse IPv6. */}
          {entree["IPADDRESS6"] && (
            <Box style={{ gridColumn: "1 / -1" }}>
              <Valeur libelle="IPv6" valeur={entree["IPADDRESS6"]} />
            </Box>
          )}
          {/* 4e ligne : le VLAN du Paramétrage qui porte la carte, son nom
              puis son numéro en tag vert, comme au Résumé ; cachée sans VLAN.
              VLAN et VLAN_NAME viennent du serveur, pas de l'agent. */}
          {entree["VLAN"] && (
            <Box style={{ gridColumn: "1 / -1" }}>
              <Valeur
                libelle="VLAN"
                valeur={
                  <Group gap={6} wrap="nowrap">
                    {entree["VLAN_NAME"] && <span>{entree["VLAN_NAME"]}</span>}
                    <Badge color="green" variant="filled" size="sm" radius="sm">
                      VLAN {entree["VLAN"]}
                    </Badge>
                  </Group>
                }
              />
            </Box>
          )}
          {/* 5e ligne : MTU et vitesse. */}
          <Valeur libelle="MTU" valeur={entree["MTU"]} />
          <Valeur libelle="Vitesse" valeur={debit(entree["SPEED"])} />
        </>
      )}
    />
  );
}

/** Une capacité en Mo, comme l'agent la donne, dite en Go. */
const enGo = (valeur: string | undefined): string => {
  const mo = Number(valeur);
  return valeur && !Number.isNaN(mo)
    ? `${(mo / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`
    : "";
};

/**
 * Les barrettes du poste : capacité, type et description. Le numéro de slot
 * de l'agent n'est pas montré : celui de la ligne en tient lieu.
 */
function Memoire({ section }: { section: AssetSection }) {
  return (
    <LignesNumerotees
      entrees={section.entries}
      textes={2}
      nombres={1}
      // La capacité d'abord, puis le type et la description.
      colonnes={`${LARGEUR_PREMIERE}px ${LARGEUR_PREMIERE}px 1fr`}
      valeurs={(entree) => (
        <>
          <Valeur libelle="Capacité" valeur={enGo(entree["CAPACITY"])} />
          <Valeur libelle="Type" valeur={entree["TYPE"]} />
          <Valeur libelle="Description" valeur={entree["DESCRIPTION"]} />
        </>
      )}
    />
  );
}

/**
 * Le rectangle des contrôleurs porte leur emplacement PCI (« 00:1f.3 ») : il
 * a sa largeur à lui, fixe, pour que tous s'alignent.
 */
const LARGEUR_SLOT = 80;

/**
 * La largeur des libellés des contrôleurs : ce qu'il faut pour que leurs
 * valeurs commencent là où commence la seconde colonne des autres lignes
 * numérotées — le numéro de série d'une batterie —, le rectangle étant plus
 * large.
 */
const LARGEUR_LIBELLE = LARGEUR_NUMERO + LARGEUR_PREMIERE - LARGEUR_SLOT;

/** Les champs qu'on copie d'un clic : les numéros de série. */
const CHAMPS_COPIABLES = new Set(["SERIAL", "SERIALNUMBER", "ALTSERIAL", "SSN"]);

/**
 * Une valeur suivie d'un bouton qui la copie : un numéro de série se recopie
 * dans un ticket, chez le fabricant, rarement à la main sans erreur. Sans
 * valeur, rien à copier : ni bouton ni contenu, la ligne affiche son tiret.
 */
function AvecCopie({ valeur, children }: { valeur?: string; children?: ReactNode }) {
  if (!valeur) return children ?? VIDE;
  return (
    <Group gap={4} wrap="nowrap">
      {children ?? <span>{valeur}</span>}
      <CopyButton value={valeur}>
        {({ copied, copy }) => (
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            onClick={copy}
            aria-label="Copier le numéro de série"
            style={{ "--button-hover": NEUTRAL_HOVER, flexShrink: 0 } as CSSProperties}
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </Button>
        )}
      </CopyButton>
    </Group>
  );
}

/**
 * Le gabarit des étiquettes d'identifiants — VENDORID, PRODUCTID : quatre
 * chiffres hexadécimaux le plus souvent, davantage parfois. « D » est le plus
 * large d'entre eux une fois en capitales : un gabarit qui n'en a que, aussi
 * long que le plus long identifiant, donne la même largeur à toutes les
 * étiquettes, quels que soient leurs chiffres.
 */
const gabaritIdentifiants = (identifiants: (string | undefined)[]): string =>
  "D".repeat(Math.max(4, ...identifiants.map((id) => id?.length ?? 0)));

/** Un libellé discret à gauche, la valeur à droite, sur une même ligne. */
function Ligne({ libelle, valeur }: { libelle: string; valeur?: ReactNode }) {
  return (
    <>
      <Text size="sm" c="dimmed">
        {libelle}
      </Text>
      <Text component="div" size="sm" style={{ wordBreak: "break-word" }}>
        {valeur || VIDE}
      </Text>
    </>
  );
}

/**
 * Les contrôleurs du poste, repérés par leur emplacement PCI : nom, fabricant
 * — avec l'identifiant du fabricant au bord droit, dans l'étiquette verte
 * des références — et type, l'un sous l'autre.
 */
function Controleurs({ section }: { section: AssetSection }) {
  const gabarit = gabaritIdentifiants(section.entries.map((entree) => entree["VENDORID"]));
  return (
    <LignesNumerotees
      entrees={section.entries}
      textes={2}
      nombres={0}
      premiere={LARGEUR_LIBELLE}
      largeurNumero={LARGEUR_SLOT}
      numero={(entree) => entree["PCISLOT"]}
      valeurs={(entree) => (
        <>
          <Ligne libelle="Nom" valeur={entree["NAME"]} />
          <Ligne
            libelle="Fabricant"
            valeur={
              (entree["VENDORID"] || entree["MANUFACTURER"]) && (
                // L'étiquette au bord droit de la ligne : d'un contrôleur à
                // l'autre, elles s'alignent en colonne.
                <Group gap={8} wrap="nowrap" justify="space-between">
                  <span>{entree["MANUFACTURER"] || VIDE}</span>
                  {entree["VENDORID"] && (
                    <ReferenceTag reference={entree["VENDORID"]} gabarit={gabarit} copiable />
                  )}
                </Group>
              )
            }
          />
          <Ligne libelle="Type" valeur={entree["TYPE"]} />
        </>
      )}
    />
  );
}

/** La couleur de l'écran dessiné : le gris foncé des numéros. */
const BORD_ECRAN = FOND_NUMERO;

/** « 1920x1080 », comme l'agent la donne, se lit « 1920 x 1080 ». */
const espacerResolution = (resolution: string): string =>
  resolution.replace(/\s*[x×]\s*/i, " x ");

/**
 * Un écran dessiné, la résolution au milieu de sa dalle. Pied compris, il
 * tient dans la hauteur des trois lignes de texte d'une carte vidéo (moins de
 * 72 px) : plus haut, il étirait la ligne et écartait le texte.
 */
function Ecran({ resolution }: { resolution?: string }) {
  return (
    <Stack gap={0} align="center" style={{ flexShrink: 0 }}>
      <Center w={104} h={58} style={{ border: `3px solid ${BORD_ECRAN}`, borderRadius: 5 }}>
        <Text size="xs" fw={600} style={{ whiteSpace: "nowrap" }}>
          {resolution ? espacerResolution(resolution) : VIDE}
        </Text>
      </Center>
      {/* Le pied : une tige, puis la base. */}
      <Box w={8} h={6} style={{ backgroundColor: BORD_ECRAN }} />
      <Box w={36} h={3} style={{ backgroundColor: BORD_ECRAN, borderRadius: 2 }} />
    </Stack>
  );
}

/**
 * Les cartes vidéo du poste : puce, nom et emplacement PCI l'un sous l'autre,
 * et à côté un écran qui porte la résolution.
 */
function Video({ section }: { section: AssetSection }) {
  return (
    <LignesNumerotees
      entrees={section.entries}
      textes={2}
      nombres={0}
      valeurs={(entree) => (
        <>
          <Ligne libelle="Puce" valeur={entree["CHIPSET"]} />
          <Ligne libelle="Nom" valeur={entree["NAME"]} />
          <Ligne libelle="Slot PCI" valeur={entree["PCISLOT"]} />
        </>
      )}
      aCote={(entree) => <Ecran resolution={entree["RESOLUTION"]} />}
    />
  );
}

/**
 * Les périphériques audio du poste : nom, fabricant et description l'un sous
 * l'autre. La légende de l'agent (CAPTION) n'est pas montrée : elle répète
 * le nom.
 */
function Audio({ section }: { section: AssetSection }) {
  return (
    <LignesNumerotees
      entrees={section.entries}
      textes={2}
      nombres={0}
      valeurs={(entree) => (
        <>
          <Ligne libelle="Nom" valeur={entree["NAME"]} />
          <Ligne libelle="Fabricant" valeur={entree["MANUFACTURER"]} />
          <Ligne libelle="Description" valeur={entree["DESCRIPTION"]} />
        </>
      )}
    />
  );
}

/** Les champs d'une section, dans l'ordre où ils s'affichent, sous leur nom français. */
type Champs = [string, string][];

/**
 * Les lignes d'une entrée : ses champs connus en français, puis ceux qu'on ne
 * sait pas nommer, sous le nom de l'agent — sauf les écartés. Une valeur déjà
 * dite plus haut ne se répète pas : l'agent donne souvent le même texte comme
 * nom, légende et description, ou le numéro de série deux fois. Les nombres
 * et les « Oui » / « Non » se répètent, eux : deux champs à 0 ou à « Oui » ne
 * disent pas la même chose.
 */
const lignesDe = (
  entree: AssetEntry,
  champs: Champs,
  { ecartes = [], formats = {}, etiquettes = {} }: {
    ecartes?: string[];
    formats?: Record<string, (brute: string) => string>;
    etiquettes?: Record<string, string>;
  } = {},
): [string, string, string][] => {
  const connus = new Set([
    ...champs.map(([champ]) => champ),
    ...ecartes,
    ...Object.values(etiquettes),
  ]);
  const affiches: Champs = [
    // Un champ qui porte une étiquette a sa ligne dès que l'étiquette a une
    // valeur, même s'il n'en a pas lui-même.
    ...champs.filter(([champ]) => champ in entree || (etiquettes[champ] && entree[etiquettes[champ]])),
    ...Object.keys(entree)
      .filter((champ) => !connus.has(champ))
      .map((champ): [string, string] => [champ, champ]),
  ];
  const dites = new Set<string>();
  return affiches.flatMap(([champ, libelle]): [string, string, string][] => {
    const brute = entree[champ] ?? "";
    const valeur = formats[champ]?.(brute) ?? brute;
    const cle = valeur.trim().toLowerCase();
    const texte = /\p{L}/u.test(cle) && cle !== "oui" && cle !== "non";
    if (texte && dites.has(cle)) return [];
    if (texte) dites.add(cle);
    return [[champ, libelle, valeur]];
  });
};

/**
 * Une section en lignes numérotées : pour chaque entrée, ce que l'agent en
 * dit, l'un sous l'autre, en français. `etiquettes` associe à un champ un
 * autre champ — un identifiant —, montré dans l'étiquette verte des
 * références au bord droit de la ligne plutôt que sur une ligne à lui.
 */
function FichesNumerotees({
  section,
  champs,
  ecartes,
  formats,
  etiquettes = {},
  aCote,
}: {
  section: AssetSection;
  champs: Champs;
  ecartes?: string[];
  formats?: Record<string, (brute: string) => string>;
  etiquettes?: Record<string, string>;
  aCote?: (entree: AssetEntry) => ReactNode;
}) {
  // Une seule largeur pour toutes les étiquettes de la section.
  const gabarit = gabaritIdentifiants(
    section.entries.flatMap((entree) => Object.values(etiquettes).map((e) => entree[e])),
  );
  return (
    <LignesNumerotees
      entrees={section.entries}
      textes={2}
      nombres={0}
      valeurs={(entree) =>
        lignesDe(entree, champs, { ecartes, formats, etiquettes }).map(
          ([champ, libelle, valeur]) => {
            const etiquette = etiquettes[champ];
            const id = etiquette ? entree[etiquette] : undefined;
            const contenu = id ? (
              // L'étiquette au bord droit de la ligne : d'une entrée à
              // l'autre, elles s'alignent en colonne.
              <Group gap={8} wrap="nowrap" justify="space-between">
                <span>{valeur || VIDE}</span>
                <ReferenceTag reference={id} gabarit={gabarit} copiable />
              </Group>
            ) : (
              valeur
            );
            return (
              <Ligne
                key={champ}
                libelle={libelle}
                valeur={
                  CHAMPS_COPIABLES.has(champ) ? <AvecCopie valeur={valeur} /> : contenu
                }
              />
            );
          },
        )
      }
      aCote={aCote}
    />
  );
}

const CHAMPS_STOCKAGE: Champs = [
  ["NAME", "Nom"],
  ["TYPE", "Type"],
  ["MANUFACTURER", "Fabricant"],
  ["MODEL", "Modèle"],
  ["DESCRIPTION", "Description"],
  ["INTERFACE", "Interface"],
  ["SERIAL", "Numéro de série"],
  ["SERIALNUMBER", "Numéro de série"],
  ["FIRMWARE", "Micrologiciel"],
  ["SCSI_COID", "Contrôleur SCSI"],
  ["SCSI_CHID", "Canal SCSI"],
  ["SCSI_UNID", "Unité SCSI"],
  ["SCSI_LUN", "LUN SCSI"],
];

/** La part libre de l'anneau : un gris neutre et clair, pas celui de Mantine qui tire sur le bleu. */
const FOND_ANNEAU = "light-dark(#e0e0e0, var(--mantine-color-dark-4))";

/**
 * La capacité d'un disque dans un anneau : sa part de la capacité totale du
 * poste, sa taille au milieu. Un disque dont l'agent ne donne pas la taille
 * garde un anneau vide et le tiret.
 */
function PartDisque({ capacite, total }: { capacite: number; total: number }) {
  const connue = capacite > 0;
  return (
    <RingProgress
      size={88}
      thickness={9}
      rootColor={FOND_ANNEAU}
      roundCaps
      style={{ flexShrink: 0, alignSelf: "flex-start" }}
      sections={connue && total > 0 ? [{ value: (capacite / total) * 100, color: "blue" }] : []}
      label={
        <Text size="xs" fw={700} ta="center" style={{ whiteSpace: "nowrap" }}>
          {connue ? taille(capacite) : VIDE}
        </Text>
      }
    />
  );
}

/**
 * Les supports de stockage du poste. La capacité ne s'écrit pas en ligne :
 * l'anneau à droite la porte, avec la part qu'elle fait du total du poste.
 */
function Stockage({ section }: { section: AssetSection }) {
  const capacite = (entree: AssetEntry) => Number(entree["DISKSIZE"]) || 0;
  const total = section.entries.reduce((somme, entree) => somme + capacite(entree), 0);
  return (
    <FichesNumerotees
      section={section}
      champs={CHAMPS_STOCKAGE}
      ecartes={["DISKSIZE"]}
      aCote={(entree) => <PartDisque capacite={capacite(entree)} total={total} />}
    />
  );
}

const CHAMPS_ENTREES: Champs = [
  ["NAME", "Nom"],
  ["CAPTION", "Légende"],
  ["TYPE", "Type"],
  ["MANUFACTURER", "Fabricant"],
  ["DESCRIPTION", "Description"],
  ["INTERFACE", "Interface"],
  ["POINTINGTYPE", "Pointage"],
  ["LAYOUT", "Disposition"],
];

/** Les claviers, souris et autres périphériques d'entrée du poste. */
function Entrees({ section }: { section: AssetSection }) {
  return <FichesNumerotees section={section} champs={CHAMPS_ENTREES} />;
}

const CHAMPS_MONITEURS: Champs = [
  ["NAME", "Nom"],
  ["CAPTION", "Légende"],
  ["MANUFACTURER", "Fabricant"],
  ["DESCRIPTION", "Description"],
  ["TYPE", "Type"],
  ["PORT", "Port"],
  ["SERIAL", "Numéro de série"],
  ["ALTSERIAL", "Autre numéro de série"],
];

/**
 * Les moniteurs du poste. BASE64 et UUENCODE portent l'EDID brut de l'écran :
 * illisible, on ne le montre pas.
 */
function Moniteurs({ section }: { section: AssetSection }) {
  return (
    <FichesNumerotees section={section} champs={CHAMPS_MONITEURS} ecartes={["BASE64", "UUENCODE"]} />
  );
}

const CHAMPS_IMPRIMANTES: Champs = [
  ["NAME", "Nom"],
  ["DRIVER", "Pilote"],
  ["PORT", "Port"],
  ["DESCRIPTION", "Description"],
  ["COMMENT", "Commentaire"],
  ["NETWORK", "Réseau"],
  ["LOCAL", "Locale"],
  ["SHARED", "Partagée"],
  ["SHARENAME", "Nom de partage"],
  ["SERVERNAME", "Serveur"],
  ["SERIAL", "Numéro de série"],
];

/**
 * Les imprimantes installées sur le poste. Le processeur d'impression, le
 * statut et la résolution ne sont pas montrés.
 */
function Imprimantes({ section }: { section: AssetSection }) {
  return (
    <FichesNumerotees
      section={section}
      champs={CHAMPS_IMPRIMANTES}
      ecartes={["PRINTPROCESSOR", "STATUS", "RESOLUTION"]}
      formats={{ NETWORK: ouiNon, LOCAL: ouiNon, SHARED: ouiNon }}
    />
  );
}

const CHAMPS_USB: Champs = [
  ["NAME", "Nom"],
  ["CAPTION", "Légende"],
  ["MANUFACTURER", "Fabricant"],
  ["SERIAL", "Numéro de série"],
  ["CLASS", "Classe"],
  ["SUBCLASS", "Sous-classe"],
];

/**
 * Les périphériques USB branchés au poste. L'identifiant du fabricant suit
 * son nom, celui du produit le nom du périphérique, chacun en étiquette au
 * bord droit.
 */
function Usb({ section }: { section: AssetSection }) {
  return (
    <FichesNumerotees
      section={section}
      champs={CHAMPS_USB}
      etiquettes={{ NAME: "PRODUCTID", MANUFACTURER: "VENDORID" }}
    />
  );
}

/** Les champs du BIOS qu'on sait nommer ; les autres gardent le nom de l'agent. */
const LIBELLES_BIOS: Record<string, string> = {
  SMANUFACTURER: "Fabricant",
  SMODEL: "Modèle",
  SSN: "Numéro de série",
};

/**
 * Le BIOS du poste, un champ par ligne. Il n'a pas de numéro, mais ses valeurs
 * commencent là où commencent celles des lignes numérotées après la première
 * colonne — le modèle d'un processeur, par exemple : le libellé occupe le
 * rectangle, la première colonne et les deux écarts.
 */
function Bios({ section }: { section: AssetSection }) {
  return (
    <Stack gap={20}>
      {section.entries.map((entree, rang) => (
        <Box
          key={rang}
          style={{
            display: "grid",
            gridTemplateColumns:
              `calc(${LARGEUR_NUMERO + LARGEUR_PREMIERE}px + 2 * var(--mantine-spacing-lg)) 1fr`,
            rowGap: 4,
          }}
        >
          {Object.keys(entree).map((champ) => (
            <Ligne
              key={champ}
              libelle={LIBELLES_BIOS[champ] ?? champ}
              valeur={
                CHAMPS_COPIABLES.has(champ) ? <AvecCopie valeur={entree[champ]} /> : entree[champ]
              }
            />
          ))}
        </Box>
      ))}
    </Stack>
  );
}

/**
 * Les sections qui posent elles-mêmes leurs cadres gris, au lieu d'être
 * rangées dans celui de la section : leurs titres viennent hors des cadres.
 */
export const SANS_CADRE = new Set(["OPERATINGSYSTEM", "VIRTUALMACHINES"]);

/** Les sections qui ont leur tableau ; les autres restent en fiches. */
export const TABLEAUX: Record<string, ComponentType<{ section: AssetSection }>> = {
  ANTIVIRUS: Protections,
  BATTERIES: Batterie,
  BIOS: Bios,
  CONTROLLERS: Controleurs,
  CPUS: Processeurs,
  DRIVES: Volumes,
  FIREWALL: PareFeu,
  INPUTS: Entrees,
  LOCAL_GROUPS: Groupes,
  LOCAL_USERS: Comptes,
  MEMORIES: Memoire,
  MONITORS: Moniteurs,
  NETWORKS: Reseaux,
  POWERSUPPLIES: Alimentation,
  PRINTERS: Imprimantes,
  PROCESSES: Processus,
  SOFTWARES: Logiciels,
  SOUNDS: Audio,
  STORAGES: Stockage,
  USBDEVICES: Usb,
  VIDEOS: Video,
  VIRTUALMACHINES: MachinesVirtuelles,
};
