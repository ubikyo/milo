import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Checkbox,
  Combobox,
  CopyButton,
  Group,
  Input,
  InputBase,
  Modal,
  Select,
  Stack,
  TextInput,
  Tooltip,
  useCombobox,
} from "@mantine/core";
import { IconCheck, IconChevronDown, IconCopy, IconInfoCircle, IconKey } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { API_TOKEN_ACCESSES, API_TOKEN_ACCESS_LABELS, API_TOKEN_DURATIONS } from "@milo/shared";
import type { ApiToken, ApiTokenAccess, ApiTokenDuration, ApiTokenInput, CreatedApiToken, WorkspaceRef } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { themeWindow } from "../../lib/themeWindow";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { GREEN, RED } from "../../themes/colors";
import { SELECT_CLASSES } from "../../themes/selects";
import CloseButton from "../ui/CloseButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import Footer from "../ui/Footer";
import {
  EmptyList,
  INPUT_STYLE,
  ListFooter,
  CHECKBOX_SPAN,
  FIRST_FIELD_MARGIN,
  NAME_INSET,
  ROUNDING,
  RowCheckbox,
  RowField,
  pickKeys,
  pluralize,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
import listClasses from "../../assets/styles/SettingsList.module.css";

// The "API" section of Settings ("Paramétrage"): the tokens an outside client
// — a chat connected through MCP, a script — reaches Milo with. A row per
// token, drawn like the other editable lists (DrawerRows): its name, its
// workspaces (counted) and what it may do, edited in place, then where it
// stands — expired, used or not. "Générer un token" adds a row to fill in:
// the token is created once all its fields are, then shown in a window,
// once. Revoking one refuses its next request.

const NAME_WIDTH = 150;
const ACCESS_WIDTH = 140;
const DURATION_WIDTH = 110;
/** The arrow's room in a row's picker, tighter than Mantine's (the field's height). */
const CHEVRON_WIDTH = 22;

const ACCESSES = API_TOKEN_ACCESSES.map((a) => ({ value: a, label: API_TOKEN_ACCESS_LABELS[a] }));

const DURATION_LABELS: Record<string, string> = {
  "30": "30 jours",
  "90": "90 jours",
  "365": "1 an",
  none: "Aucune",
};

const DURATIONS = API_TOKEN_DURATIONS.map((d) => {
  const value = d === null ? "none" : String(d);
  return { value, label: DURATION_LABELS[value] ?? value };
});

const durationOf = (value: string): ApiTokenDuration =>
  value === "none" ? null : (Number(value) as ApiTokenDuration);

const onError = (e: unknown) => notifyError(errorMessage(e));

const day = (iso: string) => dayjs(iso).format("DD/MM/YYYY");

const expired = (token: ApiToken) =>
  Boolean(token.expires_at) && dayjs(token.expires_at).isBefore(dayjs());

/** The added row, while it waits for all its fields. */
interface Draft {
  name: string;
  workspaces: string[];
  access: ApiTokenAccess | null;
  duration: string | null;
}

const EMPTY_DRAFT: Draft = { name: "", workspaces: [], access: null, duration: null };

/** A row's field: transparent over its gray, the window's background once entered. */
const fieldStyle = (entered: boolean): CSSProperties =>
  entered ? INPUT_STYLE : { backgroundColor: "transparent", borderWidth: 0 };

/** A row's field, framed in red while it is required and still empty. */
const MISSING_STYLE: CSSProperties = { backgroundColor: "transparent", border: `1px solid ${RED}` };

interface FieldProps<T> {
  value: T;
  onChange: (value: T) => void;
  /** Its row's name, for screen readers: "Accès de …". */
  of: string;
  /** Still to be chosen before the token can be created: framed in red. */
  missing?: boolean;
}

/** Where the token stands, at the row's end; the details in its title. */
function TokenState({ token }: { token: ApiToken }) {
  const [label, color] = expired(token)
    ? ["Expiré", RED]
    : token.last_used_at
      ? ["Utilisé", GREEN]
      : ["Inutilisé", RED];
  const details = [
    `Token …${token.hint}`,
    `Généré le ${day(token.created_at)}${token.created_by ? ` par ${token.created_by}` : ""}`,
    token.last_used_at ? `Utilisé le ${day(token.last_used_at)}` : "Jamais utilisé",
    token.expires_at ? `Expire le ${day(token.expires_at)}` : "Sans expiration",
  ].join("\n");
  return (
    <Badge
      color={color}
      variant="filled"
      size="sm"
      radius="sm"
      tt="none"
      fw={600}
      style={{ flexShrink: 0 }}
      title={details}
      data-list-tag="filled"
    >
      {label}
    </Badge>
  );
}

/** A row's select — what it may do, how long it lasts. */
function RowSelect({
  value,
  onChange,
  data,
  width,
  label,
  placeholder,
  missing = false,
}: {
  value: string | null;
  onChange: (value: string) => void;
  data: { value: string; label: string }[];
  width: number;
  label: string;
  placeholder: string;
  missing?: boolean;
}) {
  const [entered, setEntered] = useState(false);
  return (
    <Select
      size="xs"
      radius={ROUNDING}
      w={width}
      style={{ flexShrink: 0 }}
      data={data}
      value={value}
      placeholder={placeholder}
      rightSectionWidth={CHEVRON_WIDTH}
      onChange={(v) => v && v !== value && onChange(v)}
      allowDeselect={false}
      {...pickKeys}
      comboboxProps={{ withinPortal: true }}
      classNames={{ dropdown: listClasses.dropdown, option: listClasses.option }}
      onFocus={() => setEntered(true)}
      onBlur={() => setEntered(false)}
      styles={{ input: missing && !entered ? MISSING_STYLE : fieldStyle(entered) }}
      aria-label={label}
    />
  );
}

function AccessField({ value, onChange, of, missing }: FieldProps<ApiTokenAccess | null>) {
  return (
    <RowSelect
      value={value}
      onChange={(v) => {
        const access = API_TOKEN_ACCESSES.find((a) => a === v);
        if (access) onChange(access);
      }}
      data={ACCESSES}
      width={ACCESS_WIDTH}
      label={`Accès ${of}`}
      placeholder="Droits"
      missing={missing}
    />
  );
}

/**
 * Its workspaces, counted: "2 workspaces", their names in its title. The list
 * checks them; the choice is sent when it closes.
 */
function WorkspacesField({
  value,
  onChange,
  of,
  missing = false,
  choices,
}: FieldProps<string[]> & { choices: WorkspaceRef[] }) {
  const [checked, setChecked] = useState(value);
  const [entered, setEntered] = useState(false);
  useEffect(() => setChecked(value), [value]);
  const combobox = useCombobox({
    onDropdownOpen: () => setEntered(true),
    onDropdownClose: () => {
      setEntered(false);
      if (checked.join() !== value.join()) onChange(checked);
    },
  });
  const toggle = (id: string) =>
    setChecked((before) =>
      before.includes(id)
        ? before.filter((v) => v !== id)
        : // In the order of the choices.
          choices.map((w) => String(w.id)).filter((v) => v === id || before.includes(v)),
    );
  const names = choices.filter((w) => checked.includes(String(w.id))).map((w) => w.name);
  return (
    <Combobox
      store={combobox}
      onOptionSubmit={toggle}
      withinPortal
      shadow="md"
      width={280}
      position="bottom-start"
      // Styled as a select (themes/selects.ts), with the lists' look.
      classNames={{
        dropdown: `${SELECT_CLASSES.dropdown} ${listClasses.dropdown}`,
        option: `${SELECT_CLASSES.option} ${listClasses.option}`,
      }}
    >
      <Combobox.Target>
        <InputBase
          component="button"
          type="button"
          size="xs"
          radius={ROUNDING}
          pointer
          classNames={{ root: SELECT_CLASSES.root, input: SELECT_CLASSES.input, section: SELECT_CLASSES.section }}
          aria-label={`Workspaces ${of}`}
          title={names.join("\n") || undefined}
          style={{ flex: 1, minWidth: 0 }}
          styles={{ input: { ...(missing && !entered ? MISSING_STYLE : fieldStyle(entered)), cursor: "pointer" } }}
          rightSection={<IconChevronDown size={14} />}
          rightSectionWidth={CHEVRON_WIDTH}
          rightSectionPointerEvents="none"
          onClick={() => combobox.toggleDropdown()}
          {...pickKeys}
        >
          {checked.length > 0 ? (
            pluralize(checked.length, "workspace")
          ) : (
            <Input.Placeholder>Workspaces</Input.Placeholder>
          )}
        </InputBase>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {choices.map((w) => (
            <Combobox.Option value={String(w.id)} key={w.id}>
              <Group gap="sm" wrap="nowrap">
                <Checkbox
                  size="xs"
                  color="teal"
                  checked={checked.includes(String(w.id))}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                  style={{ pointerEvents: "none" }}
                />
                <span>{w.name}</span>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

/**
 * The token just created, in its window: shown this once — only its
 * fingerprint is kept. A click beside it does not close it: the token would
 * be lost.
 */
function CreatedTokenModal({ created, onClose }: { created: CreatedApiToken | null; onClose: () => void }) {
  return (
    <Modal
      attributes={themeWindow("api-token")}
      opened={Boolean(created)}
      onClose={onClose}
      title="Token"
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      closeOnClickOutside={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {created && (
        <Stack gap="md">
          <TextInput
            label="Token"
            value={created.secret}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            rightSection={
              <CopyButton value={created.secret}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copié" : "Copier"} withArrow>
                    <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy}>
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            }
          />
          {/* The Profile's look ("Notifications groupées"). */}
          <Alert variant="default" color="blue" icon={<IconInfoCircle size={18} />}>
            Copiez et conservez le token ci-dessus en lieu sûr. Une fois cette fenêtre fermée, il
            ne sera plus possible de le consulter.
          </Alert>
          <Footer parentGap="var(--mantine-spacing-md)">
            <CloseButton onClick={onClose} />
          </Footer>
        </Stack>
      )}
    </Modal>
  );
}

export default function ApiTab({
  canEdit,
  workspaces,
}: {
  canEdit: boolean;
  /** The account's: those a token may be given. */
  workspaces: WorkspaceRef[];
}) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  // The added row, waiting for all its fields.
  const [draft, setDraft] = useState<Draft | null>(null);
  // The token just created, until its window closes.
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const selection = useRowSelection(tokens.map((t) => t.id));
  const [toRevoke, setToRevoke] = useState<ApiToken[]>([]);

  const reload = useCallback(async () => {
    try {
      setTokens(await api.getApiTokens());
    } catch (e) {
      onError(e);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** An API call, followed by re-reading the tokens. */
  const write = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError(e);
    }
    await reload();
  };

  const change = (token: ApiToken, data: ApiTokenInput) =>
    void write(() => api.updateApiToken(token.id, data));

  /**
   * The added row, changed: created once complete — kept as it is if the
   * server refuses it —, gone once emptied.
   */
  const changeDraft = async (change: Partial<Draft>) => {
    if (!draft) return;
    const next = { ...draft, ...change };
    if (!next.name && next.workspaces.length === 0 && !next.access && !next.duration) {
      setDraft(null);
      return;
    }
    setDraft(next);
    if (!next.name || next.workspaces.length === 0 || !next.access || !next.duration) return;
    try {
      setCreated(
        await api.createApiToken({
          name: next.name,
          access: next.access,
          workspaces: next.workspaces.map(Number),
          duration: durationOf(next.duration),
        }),
      );
      setDraft(null);
    } catch (e) {
      onError(e);
    }
    await reload();
  };

  /** Those a token may be given, plus those it already has. */
  const choicesOf = (token: ApiToken) => [
    ...workspaces,
    ...token.workspaces.filter((w) => !workspaces.some((o) => o.id === w.id)),
  ];

  const total = tokens.length + (draft ? 1 : 0);

  /** A row's style: without its checkbox, read only, a simple list's. */
  const tokenRowStyle = (rank: number) => rowStyle(rank, total, false, canEdit ? "checkbox" : "simple");

  /** The name field: behind a checkbox, it moves back to align with it. */
  const nameSlot = (field: ReactNode, added = false) =>
    canEdit ? (
      added ? (
        // Without a checkbox before it, it opens the row and takes the box's
        // place: the next columns stay aligned.
        <Box
          w={NAME_WIDTH + CHECKBOX_SPAN - NAME_INSET - FIRST_FIELD_MARGIN}
          style={{ flexShrink: 0, display: "flex", marginLeft: FIRST_FIELD_MARGIN }}
        >
          {field}
        </Box>
      ) : (
        <Box w={NAME_WIDTH} style={{ flexShrink: 0, display: "flex", marginLeft: -NAME_INSET }}>{field}</Box>
      )
    ) : (
      <Box w={NAME_WIDTH} style={{ flexShrink: 0 }}>{field}</Box>
    );

  // Named, the fields still empty show in red.
  const missing = Boolean(draft?.name);

  return (
    <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <Stack gap="xl" data-settings-lists>
        <Input.Wrapper label="Token" className={listClasses.list} data-settings-list>
          {total === 0 ? (
            <EmptyList icon={IconKey} message="Aucun token" />
          ) : (
            <Stack gap={1}>
              {tokens.map((token, rank) => (
                <Group key={token.id} gap="sm" wrap="nowrap" style={tokenRowStyle(rank)}>
                  {canEdit && (
                    <RowCheckbox
                      label={`Sélectionner ${token.name}`}
                      checked={selection.isChecked(token.id)}
                      onChange={(on) => selection.toggle(token.id, on)}
                    />
                  )}
                  {nameSlot(
                    <RowField
                      name={token.name}
                      placeholder="Nom du token"
                      label={`Nom de ${token.name}`}
                      readOnly={!canEdit}
                      onValidate={(name) => {
                        if (name && name !== token.name) change(token, { name });
                      }}
                    />,
                  )}
                  <WorkspacesField
                    value={token.workspaces.map((w) => String(w.id))}
                    choices={choicesOf(token)}
                    of={`de ${token.name}`}
                    onChange={(ids) => {
                      if (ids.length === 0) onError(new Error("Un token garde au moins un workspace."));
                      else change(token, { workspaces: ids.map(Number) });
                    }}
                  />
                  <AccessField
                    value={token.access}
                    of={`de ${token.name}`}
                    onChange={(access) => access && access !== token.access && change(token, { access })}
                  />
                  <TokenState token={token} />
                </Group>
              ))}
              {draft && (
                <Group gap="sm" wrap="nowrap" style={tokenRowStyle(total - 1)}>
                  {nameSlot(
                    <RowField
                      name={draft.name}
                      placeholder="Nom du token"
                      label="Nom du token à générer"
                      autoFocus
                      // Left empty with nothing chosen, the row disappears.
                      onValidate={(name) => void changeDraft({ name })}
                    />,
                    true,
                  )}
                  <WorkspacesField
                    value={draft.workspaces}
                    choices={workspaces}
                    of="du token à générer"
                    onChange={(ids) => void changeDraft({ workspaces: ids })}
                    missing={missing && draft.workspaces.length === 0}
                  />
                  <AccessField
                    value={draft.access}
                    of="du token à générer"
                    onChange={(access) => void changeDraft({ access })}
                    missing={missing && !draft.access}
                  />
                  {/* In place of the state: how long it will last. */}
                  <RowSelect
                    value={draft.duration}
                    onChange={(duration) => void changeDraft({ duration })}
                    data={DURATIONS}
                    width={DURATION_WIDTH}
                    label="Expiration du token à générer"
                    placeholder="Expiration"
                    missing={missing && !draft.duration}
                  />
                </Group>
              )}
            </Stack>
          )}
          {canEdit && (
            <ListFooter
              addLabel="Générer un token"
              onAdd={() => setDraft(EMPTY_DRAFT)}
              checkedCount={selection.checked.length}
              onDeleteChecked={() => setToRevoke(tokens.filter((t) => selection.isChecked(t.id)))}
            />
          )}
        </Input.Wrapper>
      </Stack>

      <CreatedTokenModal created={created} onClose={() => setCreated(null)} />

      <DeleteConfirmModal
        opened={toRevoke.length > 0}
        onClose={() => setToRevoke([])}
        confirmLabel="Révoquer"
        onConfirm={async () => {
          const list = toRevoke;
          setToRevoke([]);
          selection.reset();
          await write(() => Promise.all(list.map((t) => api.deleteApiToken(t.id))));
        }}
        title={toRevoke.length > 1 ? `Révoquer ${pluralize(toRevoke.length, "token")}` : "Révoquer le token"}
        message={
          toRevoke.length > 1 ? (
            <>
              Voulez-vous vraiment révoquer ces {pluralize(toRevoke.length, "token")} ? Les clients
              qui les utilisent perdront aussitôt leur accès.
            </>
          ) : (
            <>
              Voulez-vous vraiment révoquer « {toRevoke[0]?.name} » ? Les clients qui l'utilisent
              perdront aussitôt leur accès.
            </>
          )
        }
      />
    </fieldset>
  );
}
