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

const SIZE = 16;

/** Un logo de marque (brandLogos.ts), à la taille des icônes Tabler. */
function Mark({
  logo,
  color,
  size = SIZE,
}: {
  logo: BrandLogo;
  color?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color ?? `#${logo.hex}`}
      role="img"
      aria-label={logo.title}
      style={{ flexShrink: 0, display: "block" }}
    >
      <path d={logo.path} />
    </svg>
  );
}

type TablerIcon = ComponentType<{ size?: number; style?: React.CSSProperties }>;

/** Chaque famille et son logo : Tabler quand il l'a, Simple Icons sinon. */
const LOGOS_OS: Record<AssetOsFamily, TablerIcon | BrandLogo> = {
  windows: IconBrandWindows,
  macos: IconBrandApple,
  ubuntu: IconBrandUbuntu,
  debian: IconBrandDebian,
  redhat: IconBrandRedhat,
  fedora: BRAND_LOGOS.fedora,
  linux: BRAND_LOGOS.linux,
  other: IconDeviceDesktop,
};

const isBrand = (logo: TablerIcon | BrandLogo): logo is BrandLogo =>
  typeof logo === "object" && "path" in logo;

function OsIcon({ icon: Icon, size }: { icon: TablerIcon; size: number }) {
  return <Icon size={size} />;
}

/**
 * Le logo du système, gris comme le texte secondaire. À la taille des icônes
 * de la liste, sauf quand la fiche le veut plus grand.
 */
export function OsLogo({ os, size = SIZE }: { os: Asset["os"]; size?: number }) {
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
      {isBrand(logo) ? (
        <Mark logo={logo} color="currentColor" size={size} />
      ) : (
        <OsIcon icon={logo} size={size} />
      )}
    </span>
  );
}

/**
 * Les éditeurs reconnus, lus dans le nom de la protection et dans celui de son
 * éditeur. Defender n'a pas de logo libre : il prend celui de Windows, dont il
 * fait partie.
 */
const PUBLISHERS: { pattern: RegExp; logo: BrandLogo | "defender" }[] = [
  { pattern: /defender|microsoft/i, logo: "defender" },
  { pattern: /avast/i, logo: BRAND_LOGOS.avast },
  { pattern: /avira/i, logo: BRAND_LOGOS.avira },
  { pattern: /bitdefender/i, logo: BRAND_LOGOS.bitdefender },
  { pattern: /kaspersky/i, logo: BRAND_LOGOS.kaspersky },
  { pattern: /malwarebytes/i, logo: BRAND_LOGOS.malwarebytes },
  { pattern: /mcafee/i, logo: BRAND_LOGOS.mcafee },
  { pattern: /norton/i, logo: BRAND_LOGOS.norton },
  { pattern: /symantec/i, logo: BRAND_LOGOS.symantec },
  { pattern: /trend ?micro/i, logo: BRAND_LOGOS.trendmicro },
];

/** Le bleu de Windows, pour Defender. */
const WINDOWS_BLUE = "#0078D4";

/** Le logo de l'éditeur de la protection ; un bouclier quand on ne le connaît pas. */
export function ProtectionLogo({ protection }: { protection: AssetProtection }) {
  const text = `${protection.name} ${protection.company}`;
  // Bitdefender contient « defender » : les marques précises passent avant.
  const found =
    PUBLISHERS.slice(1).find((e) => e.pattern.test(text)) ??
    (PUBLISHERS[0]!.pattern.test(text) ? PUBLISHERS[0] : undefined);
  if (!found) return <IconShieldCheck size={SIZE} style={{ flexShrink: 0 }} />;
  if (found.logo === "defender") {
    return <IconBrandWindows size={SIZE} color={WINDOWS_BLUE} style={{ flexShrink: 0 }} />;
  }
  return <Mark logo={found.logo} />;
}
