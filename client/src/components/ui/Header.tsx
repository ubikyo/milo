import { ActionIcon, Avatar, Group, Menu, Select } from "@mantine/core";
import { IconLogout, IconSettings, IconUserCog } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { initialsOf } from "./ActorAvatars.jsx";
import Logo from "./Logo.jsx";

export default function Header({
  companies,
  companyFilter,
  onCompanyFilterChange,
  onOpenSettings,
  user,
  onLogout,
  onOpenPreferences,
  mode,
}) {
  // Le tableau pose sa barre de défilement le long du trait qui ferme
  // l'entête : il lui faut sa hauteur, que seul l'entête connaît. Elle est
  // publiée en variable CSS et suivie, car elle change avec la largeur de la
  // fenêtre comme avec la taille du texte.
  const entete = useRef(null);
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

  // « Toutes les sociétés » existe partout sauf en mode Tâches, où les listes
  // appartiennent à une société précise.
  const companyOptions = [
    ...(mode === "tasks" ? [] : [{ value: "all", label: "Toutes les sociétés" }]),
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
        {/* Toujours visible : c'est elle qui détermine les listes de tâches. */}
        <Select
          aria-label="Société"
          data={companyOptions}
          value={companyFilter}
          onChange={(value) => value && onCompanyFilterChange(value)}
          allowDeselect={false}
          w={200}
        />

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
