import { Button, Menu } from "@mantine/core";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import { messageErreur, notifierErreur } from "../../lib/errors";
import type { PublicUser } from "@milo/shared";

// Le workspace où l'on travaille, à gauche du compte : ne paraît qu'à qui en a
// plusieurs. En choisir un autre recharge l'application — ses vues, ses
// tableaux, ses contextes et ses droits sont tous ceux de l'autre workspace ;
// rien de ce qui est à l'écran ne vaut plus.

export default function WorkspaceMenu({ user }: { user: PublicUser }) {
  const [changement, setChangement] = useState(false);
  if (user.workspaces.length < 2) return null;
  const courant = user.workspaces.find((w) => w.id === user.workspace);

  const choisir = async (id: number) => {
    if (id === user.workspace) return;
    setChangement(true);
    try {
      await api.switchWorkspace(id);
      window.location.reload();
    } catch (e) {
      notifierErreur(messageErreur(e));
      setChangement(false);
    }
  };

  return (
    <Menu
      position="bottom-end"
      withinPortal
      offset={ROW_MENU_OFFSET}
      styles={TAB_MENU_STYLES}
    >
      <Menu.Target>
        {/* Le même bouton que la liste des contextes. */}
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          rightSection={<IconChevronDown size={14} />}
          aria-label="Workspace"
          loading={changement}
          style={{ "--button-hover": NEUTRAL_HOVER } as CSSProperties}
        >
          {courant?.name ?? "Workspace"}
        </Button>
      </Menu.Target>
      <Menu.Dropdown miw={200}>
        {user.workspaces.map((w) => (
          <Menu.Item
            key={w.id}
            onClick={() => void choisir(w.id)}
            // La coche du workspace courant ; les autres gardent sa place,
            // pour que les noms restent alignés.
            leftSection={
              <IconCheck size={16} style={{ opacity: w.id === user.workspace ? 1 : 0 }} />
            }
          >
            {w.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
