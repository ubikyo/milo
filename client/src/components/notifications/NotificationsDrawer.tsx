import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Menu,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import {
  IconBell,
  IconChevronDown,
  IconFolder,
  IconHeadset,
  IconHeartbeat,
  IconLayoutDashboard,
  IconLayoutKanban,
  IconSettings,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import type { Notification, NotificationKind } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import {
  ACTIONS_BUTTON_STYLE,
  DRAWER_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import classes from "../../assets/styles/NotificationsDrawer.module.css";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import EmptyPanel from "../ui/EmptyPanel";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";

// The latest notifications received, opened from the account menu. On
// screen, a notification passes and fades; here, it stays until
// it is deleted — one by one, by its cross, or all through the
// "Actions" menu. A click on a row opens the item it is about; one
// announcing a deletion opens nothing, and carries a trash can.

const ICONS: Record<NotificationKind, ComponentType<{ size?: number }>> = {
  project: IconFolder,
  card: IconLayoutKanban,
  support: IconHeadset,
  access: IconHeartbeat,
  board: IconLayoutDashboard,
  settings: IconSettings,
};

const DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const DAY_WITH_YEAR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** The date and time, with the year if it is not the same. */
const whenLabel = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getFullYear() === new Date().getFullYear()) return DAY.format(date);
  return DAY_WITH_YEAR.format(date);
};

interface NotificationsDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** Opens the item the notification is about. */
  onOpen: (notification: Notification) => void;
  /**
   * Changes with each notification received: the open drawer rereads, and the
   * newcomer is added without having to reopen it.
   */
  revision: number;
}

export default function NotificationsDrawer({
  opened,
  onClose,
  onOpen,
  revision,
}: NotificationsDrawerProps) {
  const [list, setList] = useState<Notification[] | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!opened) return;
    let active = true;
    api
      .getNotifications()
      .then((fetched) => active && setList(fetched))
      .catch((e) => active && notifyError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [opened, revision]);

  // Each deletion is sent at once; the row goes away without waiting for the
  // response, and comes back if the server refuses.
  const remove = async (notification: Notification) => {
    const before = list;
    setList((l) => l?.filter((n) => n.id !== notification.id) ?? null);
    try {
      await api.deleteNotification(notification.id);
    } catch (e) {
      setList(before);
      notifyError(errorMessage(e));
    }
  };

  const deleteAll = async () => {
    setConfirm(false);
    try {
      await api.clearNotifications();
      setList([]);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={560}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        styles={DRAWER_STYLES}
      >
        {/* The same row of tabs as the other drawers: a single pane,
            and the "Actions" menu at the end, where it is expected. */}
        <Tabs
          defaultValue="notifications"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
          styles={DRAWER_TABS_STYLES}
        >
          <Tabs.List mb="md">
            <Tabs.Tab
              value="notifications"
              leftSection={<IconBell size={16} />}
              style={tabStyle(true)}
            >
              Notifications
            </Tabs.Tab>

            <Menu
              position="bottom-end"
              withinPortal
              shadow="md"
              offset={DRAWER_MENU_OFFSET}
              styles={TAB_MENU_STYLES}
            >
              <Menu.Target>
                <Button
                  variant="subtle"
                  color="gray"
                  rightSection={<IconChevronDown size={14} />}
                  ml="auto"
                  mb={4}
                  style={
                    {
                      alignSelf: "center",
                      ...ACTIONS_BUTTON_STYLE,
                    } as CSSProperties
                  }
                >
                  Actions
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color={RED}
                  leftSection={<IconTrash size={16} />}
                  disabled={!list || list.length === 0}
                  onClick={() => setConfirm(true)}
                >
                  Supprimer les notifications
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Tabs.List>

          <Tabs.Panel value="notifications" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea fill>
              <Stack gap={30} style={{ flex: 1, minHeight: 0 }}>
                {list && list.length === 0 && (
                  <EmptyPanel icon={IconBell} message="Aucune notification" />
                )}

                {list?.map((notification) => {
                  const Icon = notification.deleted
                    ? IconTrash
                    : (ICONS[notification.kind] ?? IconBell);
                  const openable = !notification.deleted;
                  return (
                    <div
                      key={notification.id}
                      className={classes.row}
                      data-openable={openable || undefined}
                      role={openable ? "button" : undefined}
                      tabIndex={openable ? 0 : undefined}
                      onClick={
                        openable ? () => onOpen(notification) : undefined
                      }
                      onKeyDown={
                        openable
                          ? (event) => {
                              if (event.key === "Enter") onOpen(notification);
                            }
                          : undefined
                      }
                    >
                      <Group className={classes.header} gap="sm" wrap="nowrap">
                        <Icon size={16} />
                        <Text
                          size="sm"
                          fw={600}
                          truncate
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          {notification.title}
                        </Text>
                        <Group gap={0} wrap="nowrap">
                          <Text size="xs" className={classes.date}>
                            {whenLabel(notification.created_at)}
                          </Text>
                          <div className={classes.cross}>
                            <ActionIcon
                              className={classes.remove}
                              variant="transparent"
                              size="sm"
                              style={{ "--ai-color": "#fff" } as CSSProperties}
                              aria-label="Supprimer la notification"
                              onClick={(event) => {
                                event.stopPropagation();
                                void remove(notification);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <IconX size={14} />
                            </ActionIcon>
                          </div>
                        </Group>
                      </Group>
                      <Text className={classes.body} size="sm">
                        {notification.author} {notification.message}
                      </Text>
                    </div>
                  );
                })}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
        </Tabs>

        <Footer>
          <CloseButton onClick={onClose} />
        </Footer>
      </Drawer>

      <DeleteConfirmModal
        opened={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={deleteAll}
        title="Supprimer les notifications"
        message={
          <>
            Voulez-vous vraiment supprimer toutes les notifications ? Cette
            action est irréversible.
          </>
        }
      />
    </>
  );
}
