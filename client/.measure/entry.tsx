import "@mantine/core/styles.css";
import "../src/assets/styles/tabs.css";
import { createRoot } from "react-dom/client";
import { Button, MantineProvider, Tabs, ActionIcon } from "@mantine/core";
import { IconChevronDown, IconPlus } from "@tabler/icons-react";
import { useEffect } from "react";
import { tabStyle } from "../src/themes/tabs";
const btn = (
  <span style={{ display: "inline-flex", marginLeft: 12 }}>
    <Button component="span" role="button" fw={300} styles={{ section: { marginInlineStart: 2 } }}
      variant="transparent" color="gray" size="xs" px={0} h="auto" rightSection={<IconChevronDown size={14} />}>
      Aucun contexte
    </Button>
  </span>
);
function Row({ id, withBtn, tab }: { id: string; withBtn?: boolean; tab: boolean }) {
  return (
    <Tabs value="a" variant="outline" className="milo-page-tabs">
      <Tabs.List id={id} mih={40}>
        {tab && (
          <Tabs.Tab value="a" style={tabStyle(true)}>
            <span style={{ display: "inline-flex", alignItems: "baseline" }}>
              Test{withBtn && btn}
            </span>
          </Tabs.Tab>
        )}
        <ActionIcon variant="transparent" size="sm" ml={4} style={{ alignSelf: "center" }}><IconPlus size={16} /></ActionIcon>
      </Tabs.List>
    </Tabs>
  );
}
function App() {
  useEffect(() => {
    const out = ["none", "plain", "btn"].map((id) => { const l = document.getElementById(id)!; const t = l.querySelector('[role=tab]'); return `${id}=${l.getBoundingClientRect().height} tab=${t?.getBoundingClientRect().height}`; });
    document.getElementById("out")!.textContent = out.join(" | ");
  });
  return (
    <MantineProvider>
      <div style={{ ["--milo-main-tab-active-size" as string]: "18px" /*SZ*/, ["--milo-main-tab-size" as string]: "14px", ["--milo-main-tab-active-border-width" as string]: "1px", ["--milo-main-tab-active-weight" as string]: 400 }}>
      <Row id="none" tab={false} />
      <Row id="plain" tab />
      <Row id="btn" tab withBtn />
      </div>
      <pre id="out" />
    </MantineProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
