import {
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  CopyButton,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconSelector,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { NEUTRAL_HOVER, STRONG_TEXT } from "../../themes/colors";
import { ReferenceTag } from "../ui/ReferenceTag";
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
}: {
  colonnes: Colonne[];
  entrees: AssetEntry[];
  triInitial: Tri;
  espacement?: number;
}) {
  const [tri, setTri] = useState<Tri>(triInitial);
  // Chaque tableau de l'inventaire se reconnaît à ses colonnes.
  const cles = colonnes.map((c) => c.cle);
  const redim = useColonnesRedimensionnables(`inventaire.${cles.join("-")}`, cles);

  const trier = (colonne: Colonne) =>
    setTri((courant) =>
      courant.cle === colonne.cle
        ? { cle: colonne.cle, sens: courant.sens === "asc" ? "desc" : "asc" }
        : { cle: colonne.cle, sens: colonne.premierSens ?? "asc" },
    );

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

  return (
    <Table {...redim.tableProps} verticalSpacing={espacement} horizontalSpacing="xs">
      {redim.colgroup}
      <Table.Thead>
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
        {triees.map((entree, rang) => (
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
}

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

/**
 * Les volumes du poste : il y en a souvent trois ou quatre, et leurs fiches à
 * la suite ne se comparaient pas. La lettre ne vient que de Windows ; la
 * colonne n'existe que si l'agent en donne une. L'espace se trie sur la part
 * occupée, le plus plein en tête au premier clic.
 */
function Volumes({ section }: { section: AssetSection }) {
  const lettres = section.entries.some((entree) => entree["LETTER"]);
  const colonnes: Colonne[] = [
    ...(lettres ? [champ("LETTER", "Lettre")] : []),
    champ("TYPE", "Type"),
    {
      cle: "FILESYSTEM",
      libelle: "Système de fichiers",
      valeur: (entree) => systemeDeFichiers(entree["FILESYSTEM"]),
      rendu: (entree) => texte(systemeDeFichiers(entree["FILESYSTEM"])),
    },
    {
      cle: "ENCRYPT_STATUS",
      libelle: "Chiffré",
      valeur: (entree) => ouiNon(entree["ENCRYPT_STATUS"]),
      rendu: (entree) => texte(ouiNon(entree["ENCRYPT_STATUS"])),
    },
    {
      cle: "ESPACE",
      libelle: "Espace",
      valeur: occupation,
      rendu: (entree) => <Occupation entry={entree} />,
      premierSens: "desc",
      largeur: "30%",
    },
  ];
  return (
    <TableauTriable
      colonnes={colonnes}
      entrees={section.entries}
      triInitial={{ cle: lettres ? "LETTER" : "TYPE", sens: "asc" }}
      espacement={6}
    />
  );
}

// --- EPP / EDR --------------------------------------------------------------

/**
 * Les protections du poste — antivirus, EPP, EDR —, telles que Windows les
 * déclare au centre de sécurité. Il y en a souvent deux, Defender resté en
 * retrait à côté de celle qu'on a installée : les actives d'abord.
 */
function Protections({ section }: { section: AssetSection }) {
  const colonnes: Colonne[] = [
    champ("NAME", "Nom"),
    champ("COMPANY", "Éditeur"),
    { ...champ("VERSION", "Version"), adroite: true },
    {
      cle: "ENABLED",
      libelle: "Actif ?",
      valeur: (entree) => ouiNon(entree["ENABLED"]),
      // En lecture seule : c'est ce que l'agent a lu, pas un réglage. Une
      // valeur que l'agent n'a pas donnée garde son tiret.
      rendu: (entree) =>
        ouiNon(entree["ENABLED"]) === "Oui" || ouiNon(entree["ENABLED"]) === "Non" ? (
          <Checkbox
            checked={ouiNon(entree["ENABLED"]) === "Oui"}
            readOnly
            size="xs"
            aria-label="Actif"
          />
        ) : (
          texte(entree["ENABLED"])
        ),
    },
  ];
  return (
    <TableauTriable
      colonnes={colonnes}
      entrees={section.entries}
      triInitial={{ cle: "ENABLED", sens: "desc" }}
      espacement={6}
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
    />
  );
}

// --- Comptes et groupes -----------------------------------------------------

/** Les groupes locaux du poste, par nom. */
function Groupes({ section }: { section: AssetSection }) {
  return (
    <TableauTriable
      colonnes={[champ("NAME", "Nom")]}
      entrees={section.entries}
      triInitial={{ cle: "NAME", sens: "asc" }}
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

/** Les machines virtuelles et les conteneurs du poste, par nom. */
function MachinesVirtuelles({ section }: { section: AssetSection }) {
  const colonnes: Colonne[] = [
    champ("NAME", "Nom"),
    {
      cle: "MEMORY",
      libelle: "Mémoire",
      valeur: memoire,
      rendu: (entree) => {
        const mo = memoire(entree);
        return texte(mo === null ? "" : taille(mo));
      },
      premierSens: "desc",
      adroite: true,
    },
    champ("STATUS", "Statut"),
    champ("VMTYPE", "Type"),
  ];
  return (
    <TableauTriable
      colonnes={colonnes}
      entrees={section.entries}
      triInitial={{ cle: "NAME", sens: "asc" }}
    />
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
    <Stack gap={20}>
      {entrees.map((entree, rang) => (
        <Group key={rang} gap="lg" align="stretch" wrap="nowrap">
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

/** Une capacité en Mo, comme l'agent la donne, dite en Go ou en To. */
const enTaille = (brute: string): string => {
  const mo = Number(brute);
  return brute && !Number.isNaN(mo) ? taille(mo) : brute;
};

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
}: {
  section: AssetSection;
  champs: Champs;
  ecartes?: string[];
  formats?: Record<string, (brute: string) => string>;
  etiquettes?: Record<string, string>;
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
  ["DISKSIZE", "Capacité"],
  ["SERIAL", "Numéro de série"],
  ["SERIALNUMBER", "Numéro de série"],
  ["FIRMWARE", "Micrologiciel"],
  ["SCSI_COID", "Contrôleur SCSI"],
  ["SCSI_CHID", "Canal SCSI"],
  ["SCSI_UNID", "Unité SCSI"],
  ["SCSI_LUN", "LUN SCSI"],
];

/** Les supports de stockage du poste. */
function Stockage({ section }: { section: AssetSection }) {
  return (
    <FichesNumerotees section={section} champs={CHAMPS_STOCKAGE} formats={{ DISKSIZE: enTaille }} />
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

/** Les sections qui ont leur tableau ; les autres restent en fiches. */
export const TABLEAUX: Record<string, ComponentType<{ section: AssetSection }>> = {
  ANTIVIRUS: Protections,
  BATTERIES: Batterie,
  BIOS: Bios,
  CONTROLLERS: Controleurs,
  CPUS: Processeurs,
  DRIVES: Volumes,
  INPUTS: Entrees,
  LOCAL_GROUPS: Groupes,
  LOCAL_USERS: Comptes,
  MEMORIES: Memoire,
  MONITORS: Moniteurs,
  PRINTERS: Imprimantes,
  PROCESSES: Processus,
  SOFTWARES: Logiciels,
  SOUNDS: Audio,
  STORAGES: Stockage,
  USBDEVICES: Usb,
  VIDEOS: Video,
  VIRTUALMACHINES: MachinesVirtuelles,
};
