import { Box, Button, Group, Modal, ScrollArea, Stack, Tabs, Title } from "@mantine/core";
import { IconAppWindow } from "@tabler/icons-react";
import type { Subview } from "@milo/shared";
import {
  SETTINGS_HEIGHT_MAX,
  SETTINGS_OWN_HEIGHT,
  SETTINGS_SCROLLBAR_STYLES,
  SETTINGS_WINDOW_WIDTH,
} from "../../themes/modals";
import { tabStyle } from "../../themes/tabs";
import { themeWindow } from "../../lib/themeWindow";
import classes from "../../assets/styles/SettingsModal.module.css";
import { MODAL_HEADER, PADDING_LEFT, TABS_WIDTH } from "../settings/SettingsModal";
import CloseButton from "./CloseButton";
import Footer from "./Footer";

// A "modal" sub-view, opened from the list under its view's tab: Settings'
// window (SettingsModal) — its size, header, tabs' column, panel title and
// buttons. For now, a single tab, "Défaut", with nothing in it yet.

const TAB = "default";
const TAB_LABEL = "Défaut";

interface SubviewModalProps {
  subview: Subview | null;
  onClose: () => void;
}

export default function SubviewModal({ subview, onClose }: SubviewModalProps) {
  return (
    <Modal
      opened={subview !== null}
      onClose={onClose}
      title={subview?.name}
      centered
      size={SETTINGS_WINDOW_WIDTH}
      padding={PADDING_LEFT}
      withCloseButton={false}
      classNames={{ content: classes.window }}
      attributes={themeWindow("subview")}
      styles={{
        ...MODAL_HEADER,
        content: {
          backgroundColor: "var(--milo-settings-bg)",
          // Settings' own height, whatever the themes give the other windows.
          height: SETTINGS_OWN_HEIGHT,
          maxHeight: SETTINGS_HEIGHT_MAX,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        },
        body: {
          ...MODAL_HEADER.body,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <Tabs value={TAB} orientation="vertical" style={{ flex: 1, minHeight: 0 }}>
        {/* The tabs' width, plus the window's inset their background takes
            in (tabs.css). */}
        <Tabs.List style={{ width: `calc(${TABS_WIDTH} + ${PADDING_LEFT})`, flexShrink: 0 }}>
          <Tabs.Tab value={TAB} leftSection={<IconAppWindow size={16} />} style={tabStyle(true)}>
            {TAB_LABEL}
          </Tabs.Tab>
        </Tabs.List>

        {/* The panel, then the buttons under it: the tabs' column runs down
            to the window's bottom (tabs.css). */}
        <Box
          p="var(--milo-settings-panel-padding)"
          style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          <Tabs.Panel
            value={TAB}
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
              <Group
                justify="space-between"
                align="center"
                wrap="nowrap"
                mb="var(--milo-settings-title-margin-bottom)"
              >
                <Title
                  order={4}
                  c="var(--milo-settings-title-text)"
                  size="var(--milo-settings-title-size)"
                  fw="var(--milo-settings-title-weight)"
                >
                  {TAB_LABEL}
                </Title>
              </Group>
              <ScrollArea
                type="auto"
                scrollbarSize="var(--milo-settings-scrollbar-width)"
                styles={SETTINGS_SCROLLBAR_STYLES}
                classNames={{ scrollbar: classes.scrollbar }}
                style={{ flex: 1, minHeight: 0 }}
              />
            </Stack>
          </Tabs.Panel>

          {/* Nothing to save yet: "Enregistrer" waits for the tab's content. */}
          <Footer>
            <CloseButton onClick={onClose} />
            <Button color="teal" disabled>
              Enregistrer
            </Button>
          </Footer>
        </Box>
      </Tabs>
    </Modal>
  );
}
