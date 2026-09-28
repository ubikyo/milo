import { ActionIcon, Avatar, Group, Menu, Select } from "@mantine/core";
import { IconLogout, IconSettings, IconUserCog } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { initialsOf } from "./ActorAvatars";
import Logo from "./Logo";
import type { Company, Mode, PublicUser } from "@milo/shared";

interface HeaderProps {
  companies: Company[];
  companyFilter: string;
  onCompanyFilterChange: (value: string) => void;
  onOpenSettings: () => void;
  user: PublicUser;
  onLogout: () => void;
  onOpenPreferences: () => void;
  mode: Mode;
}

export default function Header({
  companies,
  companyFilter,
  onCompanyFilterChange,
  onOpenSettings,
  user,
  onLogout,
  onOpenPreferences,
  mode,
}: HeaderProps) {
  // Le tableau pose sa barre de défilement le long du trait qui ferme
  // l'entête : il lui faut sa hauteur, que seul l'entête connaît. Elle est
  // publiée en variable CSS et suivie, car elle change avec la largeur de la
  // fenêtre comme avec la taille du texte.
  const entete = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = entete.current;
    if (!element) return;
    const publier = () =>
      document.documentElement.style.setProperty(
        "--milo-header-height",
        `${element.offsetHeight}px`,
      );
    publier();
    const observateur = new ResizeObserver(publier);
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  // Le mode Accès ne connaît pas les sociétés : ses catégories ne pendent à
  // rien. La liste n'y aurait aucun effet, elle ne s'y montre donc pas.
  const avecSocietes = mode !== "access";

  // « Toutes les sociétés » existe partout sauf en mode Tâches et en mode
  // Support, où les listes comme les demandes appartiennent à une société
  // précise.
  const uneSeuleSociete = mode === "tasks" || mode === "support";
  const companyOptions = [
    ...(uneSeuleSociete ? [] : [{ value: "all", label: "Toutes les sociétés" }]),
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <Group
      ref={entete}
      justify="space-between"
      px="xl"
      py="md"
      style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
    >
      {/* Le choix du mode est en bas à gauche, face au « ? ». */}
      <Logo variant={2} h={40} />

      <Group>
        {/* C'est elle qui détermine les listes de tâches, les demandes de
            support, et le filtre des projets. Le mode Accès, lui, l'ignore. */}
        {avecSocietes && (
          <Select
            aria-label="Société"
            data={companyOptions}
            value={companyFilter}
            onChange={(value) => value && onCompanyFilterChange(value)}
            allowDeselect={false}
            w={200}
          />
        )}

        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            {/* Ni bulle d'aide, ni fond au survol, ni anneau de focus : le
                menu qui s'ouvre porte déjà le nom et l'adresse. */}
            <ActionIcon
              variant="transparent"
              size="lg"
              aria-label="Compte"
              style={{ outline: "none" }}
            >
              <Avatar size={28} radius="xl" color="teal" variant="filled" src={user?.gravatar_url || null}>
                {initialsOf(user?.name)}
              </Avatar>
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconUserCog size={16} />} onClick={onOpenPreferences}>
              Profil
            </Menu.Item>
            <Menu.Item leftSection={<IconSettings size={16} />} onClick={onOpenSettings}>
              Paramétrage
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item leftSection={<IconLogout size={16} />} onClick={onLogout}>
              Déconnexion
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
