import { IconCloud, IconServer2 } from "@tabler/icons-react";

interface DirectoryOriginProps {
  synced?: boolean;
  /**
   * The width of the box where the icon is centered. In the actors list, that
   * of the favorites button (ActionIcon "sm"): the icon falls under the star of
   * the rows above.
   */
  width?: number | string;
}

/**
 * The origin of a directory user or group, placed at the end of its row:
 * synchronized from the local Active Directory, or created in the cloud. Two
 * accounts with the same name and address can thus be told apart.
 */
export default function DirectoryOrigin({ synced, width }: DirectoryOriginProps) {
  const Icon = synced ? IconServer2 : IconCloud;
  const label = synced ? "Active Directory (AD DS)" : "Cloud";
  return (
    <span
      title={label}
      aria-label={label}
      style={{ display: "flex", justifyContent: "center", flexShrink: 0, width }}
    >
      <Icon size={16} color="var(--mantine-color-dimmed)" />
    </span>
  );
}
