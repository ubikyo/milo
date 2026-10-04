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
  IconLayoutKanban,
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

// Les dernières notifications reçues, ouvertes depuis le menu du compte. À
// l'écran, une notification passe et s'efface ; ici, elle reste jusqu'à ce
// qu'on la supprime — une à une, par sa croix, ou toutes par le menu
// « Actions ». Un clic sur une ligne ouvre l'élément dont elle parle ; celle
// qui annonce une suppression n'ouvre rien, et porte une corbeille.

const ICONS: Record<NotificationKind, ComponentType<{ size?: number }>> = {
  project: IconFolder,
  card: IconLayoutKanban,
  support: IconHeadset,
  access: IconHeartbeat,
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

/** La date et l'heure, avec l'année si ce n'est pas la même. */
const whenLabel = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getFullYear() === new Date().getFullYear()) return DAY.format(date);
  return DAY_WITH_YEAR.format(date);
};

interface NotificationsDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** Ouvre l'élément dont parle la notification. */
  onOpen: (notification: Notification) => void;
  /**
   * Change à chaque notification reçue : le tiroir ouvert se relit, et la
   * nouvelle venue s'y ajoute sans qu'il faille le rouvrir.
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

  // Chaque suppression part aussitôt ; la ligne s'en va sans attendre la
  // réponse, et revient si le serveur refuse.
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
        {/* La même rangée d'onglets que les autres tiroirs : un seul volet,
            et le menu « Actions » au bout, où on le cherche. */}
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

        <Group justify="flex-end" pt="md">
          <CloseButton onClick={onClose} />
        </Group>
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
