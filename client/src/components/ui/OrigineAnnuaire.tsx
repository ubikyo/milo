import { IconCloud, IconServer2 } from "@tabler/icons-react";

interface DirectoryOriginProps {
  synced?: boolean;
  /**
   * La largeur de la case où l'icône se centre. Dans la liste des acteurs,
   * celle du bouton des favoris (ActionIcon « sm ») : l'icône tombe sous
   * l'étoile des lignes du dessus.
   */
  largeur?: number | string;
}

/**
 * L'origine d'un utilisateur ou d'un groupe de l'annuaire, posée au bout de
 * sa ligne : synchronisé depuis l'Active Directory local, ou créé dans le
 * cloud. Deux comptes de même nom et de même adresse se distinguent ainsi.
 */
export default function DirectoryOrigin({ synced, largeur }: DirectoryOriginProps) {
  const Icon = synced ? IconServer2 : IconCloud;
  const label = synced ? "Active Directory (AD DS)" : "Cloud";
  return (
    <span
      title={label}
      aria-label={label}
      style={{ display: "flex", justifyContent: "center", flexShrink: 0, width: largeur }}
    >
      <Icon size={16} color="var(--mantine-color-dimmed)" />
    </span>
  );
}
