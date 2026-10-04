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

// The workstation list logos: the system after the name, the protection
// vendor in its column.

const SIZE = 16;

/** A brand logo (brandLogos.ts), at the size of Tabler icons. */
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

/** Each family and its logo: Tabler when it has it, Simple Icons otherwise. */
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
 * The system logo, gray like secondary text. At the size of the list
 * icons, except when the record wants it bigger.
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
 * The recognized vendors, read from the protection name and from that of its
 * vendor. Defender has no free logo: it takes Windows', which it is
 * part of.
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

/** Windows blue, for Defender. */
const WINDOWS_BLUE = "#0078D4";

/** The protection vendor logo; a shield when it is unknown. */
export function ProtectionLogo({ protection }: { protection: AssetProtection }) {
  const text = `${protection.name} ${protection.company}`;
  // Bitdefender contains "defender": specific brands come first.
  const found =
    PUBLISHERS.slice(1).find((e) => e.pattern.test(text)) ??
    (PUBLISHERS[0]!.pattern.test(text) ? PUBLISHERS[0] : undefined);
  if (!found) return <IconShieldCheck size={SIZE} style={{ flexShrink: 0 }} />;
  if (found.logo === "defender") {
    return <IconBrandWindows size={SIZE} color={WINDOWS_BLUE} style={{ flexShrink: 0 }} />;
  }
  return <Mark logo={found.logo} />;
}
