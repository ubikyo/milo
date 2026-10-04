import { Button, Menu } from "@mantine/core";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../../api";
import { ACTIONS_BUTTON_STYLE, ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import classes from "../../assets/styles/WorkspaceMenu.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import type { PublicUser } from "@milo/shared";

// The workspace one works in, left of the account: only shown to those who have
// several. Choosing another reloads the application — its views, its
// boards, its contexts and its rights are all those of the other workspace;
// nothing on screen is valid anymore.

export default function WorkspaceMenu({ user }: { user: PublicUser }) {
  const [switching, setSwitching] = useState(false);
  if (user.workspaces.length < 2) return null;
  const current = user.workspaces.find((w) => w.id === user.workspace);

  const select = async (id: number) => {
    if (id === user.workspace) return;
    setSwitching(true);
    try {
      await api.switchWorkspace(id);
      window.location.reload();
    } catch (e) {
      notifyError(errorMessage(e));
      setSwitching(false);
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
        {/* Bare text, like "Actions": no background nor padding, only the
            text reacts to hover. */}
        <Button
          variant="subtle"
          size="xs"
          rightSection={<IconChevronDown size={14} />}
          aria-label="Workspace"
          loading={switching}
          style={ACTIONS_BUTTON_STYLE}
        >
          {current?.name ?? "Workspace"}
        </Button>
      </Menu.Target>
      <Menu.Dropdown miw={200}>
        {user.workspaces.map((w) => (
          <Menu.Item
            key={w.id}
            className={classes.item}
            onClick={() => void select(w.id)}
            // The tick of the current workspace; the others keep its place,
            // so that names stay aligned.
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
