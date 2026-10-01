import {
  IconBrandApple,
  IconBrandDebian,
  IconBrandRedhat,
  IconBrandUbuntu,
  IconBrandWindows,
  IconDeviceDesktop,
  IconShieldCheck,
} from "@tabler/icons-react";
import { BRAND_LOGOS, type BrandLogo } from "./brandLogos";
import type { ComponentType } from "react";
import type { Asset, AssetOsFamily, AssetProtection } from "@milo/shared";

// Les logos de la liste des postes : le système après le nom, l'éditeur de la
// protection dans sa colonne.

const TAILLE = 16;

/** Un logo de marque (brandLogos.ts), à la taille des icônes Tabler. */
function Marque({ logo, couleur }: { logo: BrandLogo; couleur?: string }) {
  return (
    <svg
      width={TAILLE}
      height={TAILLE}
      viewBox="0 0 24 24"
      fill={couleur ?? `#${logo.hex}`}
      role="img"
      aria-label={logo.title}
      style={{ flexShrink: 0, display: "block" }}
    >
      <path d={logo.path} />
    </svg>
  );
}

type IconeTabler = ComponentType<{ size?: number; style?: React.CSSProperties }>;

/** Chaque famille et son logo : Tabler quand il l'a, Simple Icons sinon. */
const LOGOS_OS: Record<AssetOsFamily, IconeTabler | BrandLogo> = {
  windows: IconBrandWindows,
  macos: IconBrandApple,
  ubuntu: IconBrandUbuntu,
  debian: IconBrandDebian,
  redhat: IconBrandRedhat,
  fedora: BRAND_LOGOS.fedora,
  linux: BRAND_LOGOS.linux,
  other: IconDeviceDesktop,
};

const estMarque = (logo: IconeTabler | BrandLogo): logo is BrandLogo =>
  typeof logo === "object" && "path" in logo;

function IconeOs({ icone: Icone }: { icone: IconeTabler }) {
  return <Icone size={TAILLE} />;
}

/** Le logo du système, gris comme le texte secondaire. */
export function OsLogo({ os }: { os: Asset["os"] }) {
  if (!os) return null;
  const logo = LOGOS_OS[os.family];
  return (
    <span
      style={{
        display: "inline-flex",
        color: "var(--mantine-color-dimmed)",
        flexShrink: 0,
      }}
    >
      {estMarque(logo) ? <Marque logo={logo} couleur="currentColor" /> : <IconeOs icone={logo} />}
    </span>
  );
}

/**
 * Les éditeurs reconnus, lus dans le nom de la protection et dans celui de son
 * éditeur. Defender n'a pas de logo libre : il prend celui de Windows, dont il
 * fait partie.
 */
const EDITEURS: { motif: RegExp; logo: BrandLogo | "defender" }[] = [
  { motif: /defender|microsoft/i, logo: "defender" },
  { motif: /avast/i, logo: BRAND_LOGOS.avast },
  { motif: /avira/i, logo: BRAND_LOGOS.avira },
  { motif: /bitdefender/i, logo: BRAND_LOGOS.bitdefender },
  { motif: /kaspersky/i, logo: BRAND_LOGOS.kaspersky },
  { motif: /malwarebytes/i, logo: BRAND_LOGOS.malwarebytes },
  { motif: /mcafee/i, logo: BRAND_LOGOS.mcafee },
  { motif: /norton/i, logo: BRAND_LOGOS.norton },
  { motif: /symantec/i, logo: BRAND_LOGOS.symantec },
  { motif: /trend ?micro/i, logo: BRAND_LOGOS.trendmicro },
];

/** Le bleu de Windows, pour Defender. */
const BLEU_WINDOWS = "#0078D4";

/** Le logo de l'éditeur de la protection ; un bouclier quand on ne le connaît pas. */
export function ProtectionLogo({ protection }: { protection: AssetProtection }) {
  const texte = `${protection.name} ${protection.company}`;
  // Bitdefender contient « defender » : les marques précises passent avant.
  const trouve =
    EDITEURS.slice(1).find((e) => e.motif.test(texte)) ??
    (EDITEURS[0]!.motif.test(texte) ? EDITEURS[0] : undefined);
  if (!trouve) return <IconShieldCheck size={TAILLE} style={{ flexShrink: 0 }} />;
  if (trouve.logo === "defender") {
    return <IconBrandWindows size={TAILLE} color={BLEU_WINDOWS} style={{ flexShrink: 0 }} />;
  }
  return <Marque logo={trouve.logo} />;
}
