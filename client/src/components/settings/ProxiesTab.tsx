import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  CopyButton,
  Group,
  Input,
  Modal,
  Stack,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy, IconInfoCircle, IconTopologyStar3 } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useState } from "react";
import type { ReactNode } from "react";
import type { CreatedMiloProxy, MiloProxy } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { useProxies } from "../../lib/proxies";
import { themeWindow } from "../../lib/themeWindow";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { GREEN, RED } from "../../themes/colors";
import CloseButton from "../ui/CloseButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import Footer from "../ui/Footer";
import {
  EmptyList,
  INPUT_INSET,
  ListFooter,
  ListHeader,
  FIRST_FIELD_MARGIN,
  NAME_INSET,
  NAME_MIN_WIDTH,
  RowCheckbox,
  RowField,
  pluralize,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
import listClasses from "../../assets/styles/SettingsList.module.css";

// The "Proxies" section of Settings ("Paramétrage"): the Milo Proxy services
// running on the sites' networks, through which Milo reaches their printers
// (shared/proxies.ts). A row per proxy, drawn like the other editable lists
// (DrawerRows): its name, edited in place, then where it stands — green
// "Connecté", red "Hors connexion", what it said of itself in its title —, kept up to date by
// the server as soon as it changes. "Ajouter un proxy" adds a row: once named,
// the proxy is created and its token shown in a window, once, with the lines
// to put in its configuration.

/** Wide enough for "Hors connexion", so the rows' ends stay aligned. */
const STATE_WIDTH = 120;

const onError = (e: unknown) => notifyError(errorMessage(e));

/** Where the proxy's configuration lives, on its machine. */
const CONFIG_PATH = "/etc/milo.proxy.conf";

/** The lines of its configuration: this Milo, and its token. */
const configOf = (token: string) => `server=${window.location.host}\ntoken=${token}`;

/**
 * "srv-print-01 · v1.0.0 · 10.0.0.4": what it said of itself; when it was
 * last seen. Never connected, it has said nothing: empty.
 */
const detailsOf = (proxy: MiloProxy) => {
  const said = [proxy.hostname, proxy.version && `v${proxy.version}`, proxy.address].filter(Boolean).join(" · ");
  const seen = proxy.last_seen_at ? dayjs(proxy.last_seen_at).format("DD/MM/YYYY HH:mm") : "";
  return seen ? `${said}\n${proxy.connected ? "Connecté depuis" : "Vu pour la dernière fois"} le ${seen}` : said;
};

/**
 * Green "Connecté", red "Hors connexion", against the row's end; what the
 * proxy said of itself in its title.
 */
function ProxyState({ proxy }: { proxy: MiloProxy }) {
  const { connected } = proxy;
  return (
    <Box w={STATE_WIDTH} style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
      <Badge
        color={connected ? GREEN : RED}
        variant="filled"
        size="sm"
        radius="sm"
        tt="none"
        fw={600}
        title={detailsOf(proxy) || undefined}
        // In the Settings, their tags' look; connected, its background too.
        data-list-tag={connected ? "filled" : ""}
      >
        {connected ? "Connecté" : "Hors connexion"}
      </Badge>
    </Box>
  );
}

/** A copy button, at a field's end. */
function CopyIcon({ value }: { value: string }) {
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copié" : "Copier"} withArrow>
          <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/**
 * The token just generated, in its window, as the lines of the proxy's
 * configuration: shown this once — only its fingerprint is kept. A click
 * beside it does not close it: the token would be lost.
 */
function CreatedProxyModal({ created, onClose }: { created: CreatedMiloProxy | null; onClose: () => void }) {
  const config = created ? configOf(created.token) : "";
  return (
    <Modal
      attributes={themeWindow("proxy-token")}
      opened={Boolean(created)}
      onClose={onClose}
      title={created ? `Proxy « ${created.proxy.name} »` : "Proxy"}
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      closeOnClickOutside={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {created && (
        <Stack gap="md">
          <Textarea
            label={`À ajouter dans ${CONFIG_PATH}`}
            value={config}
            readOnly
            autosize
            minRows={2}
            onFocus={(e) => e.currentTarget.select()}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            rightSection={<CopyIcon value={config} />}
            rightSectionProps={{ style: { alignItems: "flex-start", paddingTop: 4 } }}
          />
          {/* The Profile's look ("Notifications groupées"). */}
          <Alert variant="default" color="blue" icon={<IconInfoCircle size={18} />}>
            Copiez ces lignes dans la configuration du proxy, puis redémarrez-le
            (sudo systemctl restart milo-proxy). Une fois cette fenêtre fermée, le token ne
            pourra plus être consulté : il faudra le régénérer.
          </Alert>
          <Footer parentGap="var(--mantine-spacing-md)">
            <CloseButton onClick={onClose} />
          </Footer>
        </Stack>
      )}
    </Modal>
  );
}

export default function ProxiesTab({ canEdit }: { canEdit: boolean }) {
  const { proxies, reload } = useProxies(onError);
  // The added row, waiting for its name.
  const [draft, setDraft] = useState(false);
  const [created, setCreated] = useState<CreatedMiloProxy | null>(null);
  const selection = useRowSelection(proxies.map((p) => p.id));
  const [toDelete, setToDelete] = useState<MiloProxy[]>([]);

  /** An API call, followed by re-reading the proxies. */
  const write = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError(e);
    }
    await reload();
  };

  /** The added row, named: created, its token shown. Left empty, it goes. */
  const create = async (name: string) => {
    if (!name) {
      setDraft(false);
      return;
    }
    try {
      setCreated(await api.createProxy({ name }));
      setDraft(false);
    } catch (e) {
      onError(e);
    }
    await reload();
  };

  const total = proxies.length + (draft ? 1 : 0);

  /** A row's style: the columns' header opens the stack (ListHeader). */
  const proxyRowStyle = (rank: number) => rowStyle(rank + 1, total + 1, false, canEdit ? "checkbox" : "simple");

  /** The name field: behind a checkbox, it moves back to align with it. */
  const nameSlot = (field: ReactNode, added = false) =>
    canEdit ? (
      <Box
        style={{
          flex: 1,
          minWidth: NAME_MIN_WIDTH,
          display: "flex",
          // Added, without a checkbox before it: it opens the row.
          marginLeft: added ? FIRST_FIELD_MARGIN : -NAME_INSET,
        }}
      >
        {field}
      </Box>
    ) : (
      field
    );

  /** The columns' titles, over the fields of the rows. */
  const columns = [
    {
      label: "Nom",
      style: { flex: 1, minWidth: NAME_MIN_WIDTH, marginLeft: canEdit ? -NAME_INSET : 0 },
      inset: INPUT_INSET,
    },
    { label: "État", style: { width: STATE_WIDTH }, end: true, inset: 0 },
  ];

  return (
    <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <Stack gap="xl" data-settings-lists>
        <Input.Wrapper label="Proxies" className={listClasses.list} data-settings-list>
          {total === 0 ? (
            <EmptyList icon={IconTopologyStar3} message="Aucun proxy" />
          ) : (
            <Stack gap={1}>
              <ListHeader columns={columns} kind={canEdit ? "checkbox" : "simple"} />
              {proxies.map((proxy, rank) => (
                <Group key={proxy.id} gap="sm" wrap="nowrap" style={proxyRowStyle(rank)}>
                  {canEdit && (
                    <RowCheckbox
                      label={`Sélectionner ${proxy.name}`}
                      checked={selection.isChecked(proxy.id)}
                      onChange={(on) => selection.toggle(proxy.id, on)}
                    />
                  )}
                  {nameSlot(
                    <RowField
                      name={proxy.name}
                      placeholder="Nom du proxy"
                      label={`Nom de ${proxy.name}`}
                      readOnly={!canEdit}
                      onValidate={(name) => {
                        if (name && name !== proxy.name) {
                          void write(() => api.updateProxy(proxy.id, { name }));
                        }
                      }}
                    />,
                  )}
                  <ProxyState proxy={proxy} />
                </Group>
              ))}
              {draft && (
                <Group gap="sm" wrap="nowrap" style={proxyRowStyle(total - 1)}>
                  {nameSlot(
                    <RowField
                      name=""
                      placeholder="Nom du proxy"
                      label="Nom du proxy à ajouter"
                      autoFocus
                      onValidate={(name) => void create(name)}
                    />,
                    true,
                  )}
                  {/* Not created yet: an empty space keeps the rows' ends aligned. */}
                  <Box w={STATE_WIDTH} style={{ flexShrink: 0 }} />
                </Group>
              )}
            </Stack>
          )}
          {canEdit && (
            <ListFooter
              addLabel="Ajouter un proxy"
              onAdd={() => setDraft(true)}
              checkedCount={selection.checked.length}
              onDeleteChecked={() => setToDelete(proxies.filter((p) => selection.isChecked(p.id)))}
            />
          )}
        </Input.Wrapper>
      </Stack>

      <CreatedProxyModal created={created} onClose={() => setCreated(null)} />

      <DeleteConfirmModal
        opened={toDelete.length > 0}
        onClose={() => setToDelete([])}
        onConfirm={async () => {
          const list = toDelete;
          setToDelete([]);
          selection.reset();
          await write(() => Promise.all(list.map((p) => api.deleteProxy(p.id))));
        }}
        title={toDelete.length > 1 ? `Supprimer ${pluralize(toDelete.length, "proxy")}` : "Supprimer le proxy"}
        message={
          <>
            {toDelete.length > 1
              ? `Voulez-vous vraiment supprimer ces ${pluralize(toDelete.length, "proxy")} ?`
              : `Voulez-vous vraiment supprimer « ${toDelete[0]?.name} » ?`}{" "}
            Les imprimantes qui passent par {toDelete.length > 1 ? "eux" : "lui"} seront
            jointes directement. Cette action est irréversible.
          </>
        }
      />
    </fieldset>
  );
}
