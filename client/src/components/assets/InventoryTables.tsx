import {
  Center,
  Checkbox,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { STRONG_TEXT } from "../../themes/colors";
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
function EnTete({ colonne, tri, onTri }: { colonne: Colonne; tri: Tri; onTri: () => void }) {
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
    <Table verticalSpacing={espacement} horizontalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          {colonnes.map((colonne) => (
            <EnTete
              key={colonne.cle}
              colonne={colonne}
              tri={tri}
              onTri={() => trier(colonne)}
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

/** Une taille donnée en Mo par l'agent, lisible : « 476 Go », « 512 Mo ». */
export const taille = (mo: number): string =>
  mo >= 1024
    ? `${(mo / 1024).toLocaleString("fr-FR", { maximumFractionDigits: mo >= 10 * 1024 ? 0 : 1 })} Go`
    : `${Math.round(mo).toLocaleString("fr-FR")} Mo`;

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
 * Les comptes locaux du poste, par nom. Le dossier personnel ne vient que de
 * Linux et de macOS : la colonne n'existe que si l'agent en donne un.
 */
function Comptes({ section }: { section: AssetSection }) {
  const dossiers = section.entries.some((entree) => entree["HOME"]);
  return (
    <TableauTriable
      colonnes={[champ("NAME", "Nom"), ...(dossiers ? [champ("HOME", "Dossier")] : [])]}
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
function Valeur({ libelle, valeur }: { libelle: string; valeur?: string }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {libelle}
      </Text>
      <Text size="sm" style={{ wordBreak: "break-word" }}>
        {valeur || VIDE}
      </Text>
    </Stack>
  );
}

/**
 * La batterie du poste : son nom et son numéro de série, côte à côte. Le
 * reste de ce que l'agent remonte (capacité, chimie, fabricant) n'est pas
 * montré.
 */
function Batterie({ section }: { section: AssetSection }) {
  return (
    <Stack gap="lg">
      {section.entries.map((entree, rang) => (
        <SimpleGrid key={rang} cols={2} spacing="lg">
          <Valeur libelle="Nom" valeur={entree["NAME"]} />
          <Valeur libelle="Numéro de série" valeur={entree["SERIAL"]} />
        </SimpleGrid>
      ))}
    </Stack>
  );
}

/** Les sections qui ont leur tableau ; les autres restent en fiches. */
export const TABLEAUX: Record<string, ComponentType<{ section: AssetSection }>> = {
  ANTIVIRUS: Protections,
  BATTERIES: Batterie,
  DRIVES: Volumes,
  LOCAL_GROUPS: Groupes,
  LOCAL_USERS: Comptes,
  PROCESSES: Processus,
  SOFTWARES: Logiciels,
  VIRTUALMACHINES: MachinesVirtuelles,
};
