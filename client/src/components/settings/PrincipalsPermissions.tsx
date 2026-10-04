import {
  ActionIcon,
  Avatar,
  Box,
  Group,
  Menu,
  ScrollArea,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconEye,
  IconMinus,
  IconPencil,
  IconShieldLock,
  IconTrash,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import scroll from "../../assets/styles/ListScroll.module.css";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import AddButton from "../ui/AddButton";
import {
  ROUNDING,
  RowButton,
  EmptyList,
  ROW_INSET,
  NAME_INSET,
  INPUT_STYLE,
  nameFieldStyle,
  rowStyle,
} from "../ui/DrawerRows";
import PointMenu, {
  menuPosition,
  type PointMenuPosition,
} from "../ui/PointMenu";
import { RED } from "../../themes/colors";
import DirectoryPicker from "./DirectoryPicker";
import PrincipalPermissionsModal from "./PrincipalPermissionsModal";
import type {
  PermissionRow,
  SectionPermissions,
} from "./PrincipalPermissionsModal";
import { errorMessage, notifyError } from "../../lib/errors";
import { GREEN } from "../../themes/colors";
import type { EntraPrincipal, PrincipalPermissions } from "@milo/shared";

/** The background of a row's icon: a neutral gray, darker than the row. */
const AVATAR_BACKGROUND = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

/** The air added above and below a row: 10 px more height. */
const EXTRA_PADDING = 5;

/**
 * A row's height: that of a user, its name ("sm") over its address ("xs"),
 * with the row's air above and below.
 */
const ROW_HEIGHT = `calc(${2 * (ROW_INSET + EXTRA_PADDING)}px + (var(--mantine-font-size-sm) + var(--mantine-font-size-xs)) * var(--mantine-line-height))`;

const key = (p: EntraPrincipal) => `${p.type}:${p.id}`;

interface PrincipalsPermissionsProps<T> {
  load: () => Promise<PrincipalPermissions<T>[]>;
  /** Saves a principal's permissions; returns the updated list. */
  save: (
    principal: EntraPrincipal,
    permissions: T,
  ) => Promise<PrincipalPermissions<T>[]>;
  /** Removes everything from it; returns the updated list. */
  remove: (principal: EntraPrincipal) => Promise<PrincipalPermissions<T>[]>;
  /** Those of someone coming from the directory: none. */
  empty: () => T;
  /** What it has, at a glance, at the end of its row. */
  summary: (permissions: T) => string;
  /**
   * The permissions modal (PrincipalPermissionsModal). Without it, the
   * permissions are set on the row (inline): no modal, no
   * "Permissions" on right-click.
   */
  sections?: (
    permissions: T,
    change: (permissions: T) => void,
  ) => SectionPermissions[];
  /**
   * A few permissions, set inline in the row rather than in the
   * modal: those of the administration — Workspaces, Paramétrage. The add
   * row carries them too, to the right of the search: you pick who, then
   * what they have, in one go.
   */
  /**
   * With "inline": permissions that may be numerous — one per widget
   * type —, in columns under a header that names them, rather than
   * named in each choice. Beyond the width, the list scrolls
   * sideways.
   */
  inColumns?: boolean;
  inline?: (
    permissions: T,
    change: (permissions: T) => void,
  ) => PermissionRow[];
  emptyText: string;
  /** The action that removes everything from it, and its confirmation. */
  removeDialog: { label: string; message: (name: string) => ReactNode };
  /**
   * After a save or a removal: its own rights may have changed
   * — one more workspace in its selector, for example.
   */
  onChange?: () => void;
}

/** Width of a permission choice on the row: wide enough to read "Modifier". */
const CHOICE_WIDTH = 130;

/**
 * In columns: the width of a column — wide enough to read "Support" in the
 * header —, and the gap between two.
 */
const COLUMN_WIDTH = 52;
const COLUMNS_GAP = 4;
/** The gap between a row's elements ("sm"), which the header reuses. */
const GAP = 12;

/** The background of a read permission: the neutral gray of the row buttons. */
const READ_BACKGROUND = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

/** A level's icon: none, read, edit; otherwise, its initial. */
const LEVEL_ICONS: Record<string, typeof IconMinus> = {
  "": IconMinus,
  view: IconEye,
  update: IconPencil,
};

/**
 * A permission's level, in a column: a small button that moves to the
 * next on each click — Aucun, Lire, Modifier, then Aucun. None: a faded
 * dash; read: an eye on the neutral gray; edit: a pencil on the
 * application's green. The tooltip says which.
 */
function LevelButton({
  name,
  options,
  value,
  onChange,
  disabled,
}: PermissionRow) {
  const rank = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const current = options[rank];
  const next = options[(rank + 1) % options.length];
  // A yes is a checkbox; a widget type's levels have their own icon.
  const Icon = current?.label === "Oui" ? IconCheck : LEVEL_ICONS[value];
  const background =
    value === "update" ? GREEN : value ? READ_BACKGROUND : "transparent";
  const color =
    value === "update"
      ? "#ffffff"
      : value
        ? "var(--mantine-color-text)"
        : "var(--mantine-color-dimmed)";
  return (
    <Tooltip label={`${name} : ${current?.label ?? ""}`} withinPortal>
      <ActionIcon
        variant="filled"
        radius={3}
        onClick={() => next && onChange(next.value)}
        disabled={disabled}
        aria-label={`${name} : ${current?.label ?? ""}. Passer à ${next?.label ?? ""}`}
        style={{ backgroundColor: background, color: color }}
      >
        {Icon ? (
          <Icon size={16} />
        ) : (
          <Text size="xs" fw={600}>
            {current?.label.charAt(0)}
          </Text>
        )}
      </ActionIcon>
    </Tooltip>
  );
}

/** The levels of a row in columns, each centered under its header. */
function LevelsInColumns({ rows }: { rows: PermissionRow[] }) {
  return (
    <Group gap={COLUMNS_GAP} wrap="nowrap" style={{ flexShrink: 0 }}>
      {rows.map((l) => (
        <Box
          key={l.name}
          w={l.width ?? COLUMN_WIDTH}
          style={{ display: "flex", justifyContent: "center" }}
        >
          <LevelButton {...l} />
        </Box>
      ))}
    </Group>
  );
}

// "Aucun" cannot be a Select's empty value: it needs its own.
const NONE = "none";

/**
 * The permissions set inline in the row (inline): one choice each, its
 * name as a prompt — "Workspaces", "Paramétrage" —, at the end of the row.
 */
function InlineChoice({
  rows,
  inColumns,
}: {
  rows: PermissionRow[];
  /** In columns: the name is in the header, not in the choice. */
  inColumns?: boolean;
}) {
  const [entered, setEntered] = useState<string | null>(null);
  if (inColumns) return <LevelsInColumns rows={rows} />;
  return (
    <>
      {rows.map(({ name, options, value, onChange, disabled, width }) => (
        <Select
          key={name}
          aria-label={name}
          // Its name in front of the value: "Workspaces : Modifier".
          leftSection={
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              {name}
            </Text>
          }
          leftSectionWidth={name.length * 6.5 + 14}
          data={options.map((o) => ({
            value: o.value || NONE,
            label: o.label,
          }))}
          value={value || NONE}
          onChange={(v) => onChange(v === NONE || !v ? "" : v)}
          allowDeselect={false}
          disabled={disabled}
          size="xs"
          radius={ROUNDING}
          w={width ?? CHOICE_WIDTH + name.length * 6.5}
          style={{ flexShrink: 0 }}
          comboboxProps={{ withinPortal: true }}
          onFocus={() => setEntered(name)}
          onBlur={() => setEntered(null)}
          styles={entered === name ? { input: INPUT_STYLE } : undefined}
        />
      ))}
    </>
  );
}

/**
 * Entra users and groups and their permissions: the access of a workspace
 * (WorkspaceAccess), the application's administration (AdministrationTab).
 * They look like the drawer lists (ColumnFields): one row each, its name, its
 * address if it has one, and at the end the button that summarizes its
 * permissions and opens their modal. Right-click opens it too, or removes
 * everything from it; "Ajouter" adds a row that searches the directory, and
 * choosing immediately opens the permissions modal.
 */
export default function PrincipalsPermissions<T>({
  load,
  save,
  remove,
  empty,
  summary,
  sections,
  inline,
  inColumns = false,
  emptyText,
  removeDialog,
  onChange,
}: PrincipalsPermissionsProps<T>) {
  const [access, setAccess] = useState<PrincipalPermissions<T>[]>([]);
  // The one whose permissions modal is open: a principal from the list,
  // or the one just chosen from the directory.
  const [permissionsOf, setPermissionsOf] = useState<EntraPrincipal | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<EntraPrincipal | null>(
    null,
  );
  // The added row, where the directory is searched — and, set inline in
  // the row, the permissions given to it.
  const [adding, setAdding] = useState(false);
  const [newValue, setNewEntry] = useState<EntraPrincipal | null>(null);
  const [newItems, setNewValues] = useState<T>(empty);
  const addRow = useRef<HTMLDivElement | null>(null);

  // The row whose user or group is being changed, by clicking its name.
  const [toReplace, setToReplace] = useState<string | null>(null);

  /**
   * Another one in its place: it receives the same permissions, then the
   * old one loses theirs. If it already had a row, its permissions are
   * replaced by these.
   */
  const replaceExisting = async (
    old: EntraPrincipal,
    newValue: EntraPrincipal,
    permissions: T,
  ) => {
    try {
      await save(newValue, permissions);
      setAccess(await remove(old));
      onChange?.();
    } catch (e) {
      notifyError(errorMessage(e));
      void reload();
    }
  };

  const closeAdd = () => {
    setAdding(false);
    setNewEntry(null);
    setNewValues(empty());
  };

  /** Immediately saves permissions set on the row. */
  const handleSave = async (principal: EntraPrincipal, permissions: T) => {
    try {
      setAccess(await save(principal, permissions));
      onChange?.();
      return true;
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    }
  };

  /**
   * The add row is submitted as soon as it has a who and at least one
   * permission: the order matters little, search first or permissions.
   */
  const tryAdd = async (
    principal: EntraPrincipal | null,
    permissions: T,
  ) => {
    if (!principal || !inline) return;
    if (inline(permissions, () => {}).every((l) => !l.value)) return;
    if (await handleSave(principal, permissions)) closeAdd();
  };
  const [menu, setMenu] = useState<{
    principal: EntraPrincipal;
    position: PointMenuPosition;
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      setAccess(await load());
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  const current = permissionsOf
    ? access.find((a) => key(a.principal) === key(permissionsOf))
    : undefined;
  // Someone coming from the directory has none yet: none.
  const initials = current?.permissions ?? empty();

  const total = access.length + (adding ? 1 : 0);
  // A row's name takes what the permissions leave it, at the end.
  const nameStyle = { flex: 1, minWidth: 0 };

  return (
    <Stack gap="sm">
      <div>
        {total === 0 ? (
          <EmptyList icon={IconUsersGroup} message={emptyText} />
        ) : (
          <ScrollArea
            type="auto"
            scrollbars={inColumns ? "x" : false}
            classNames={{
              scrollbar: scroll.scrollbar,
              thumb: scroll.thumb,
            }}
          >
            {inColumns && inline && (
              // The columns header: the name of each permission, above
              // its choices.
              <Group
                gap={GAP}
                wrap="nowrap"
                pb={4}
                style={{
                  paddingLeft: NAME_INSET,
                  paddingRight: ROW_INSET,
                }}
              >
                {/* The space of the icon and the name: the columns line up at the
                    end, like the rows' levels. */}
                <Box style={{ flex: 1 }} />
                <Group
                  gap={COLUMNS_GAP}
                  wrap="nowrap"
                  style={{ flexShrink: 0 }}
                >
                  {inline(empty(), () => {}).map((l) => (
                    <Text
                      key={l.name}
                      size="xs"
                      fw={500}
                      c="dimmed"
                      w={l.width ?? COLUMN_WIDTH}
                      ta="center"
                      truncate
                    >
                      {l.name}
                    </Text>
                  ))}
                </Group>
              </Group>
            )}
            <Stack gap={1}>
              {access.map(({ principal, permissions }, rank) => (
                <Group
                  key={key(principal)}
                  gap="sm"
                  wrap="nowrap"
                  onContextMenu={(e) =>
                    setMenu({ principal, position: menuPosition(e) })
                  }
                  style={{
                    ...rowStyle(rank, total, false),
                    paddingLeft: NAME_INSET,
                    // On two lines, name and address: a bit more air.
                    paddingBlock: ROW_INSET + EXTRA_PADDING,
                    // A group, with no address, keeps the height of a
                    // user: all rows are equal.
                    minHeight: ROW_HEIGHT,
                  }}
                >
                  {/* A neutral gray behind the icon: Mantine's grays lean
                    blue. */}
                  <Avatar
                    size={28}
                    radius="xl"
                    styles={{
                      root: { flexShrink: 0 },
                      placeholder: {
                        backgroundColor: AVATAR_BACKGROUND,
                        color: "var(--mantine-color-text)",
                      },
                    }}
                  >
                    {principal.type === "group" ? (
                      <IconUsersGroup size={16} />
                    ) : (
                      <IconUser size={16} />
                    )}
                  </Avatar>
                  {toReplace === key(principal) ? (
                    // Another one from the directory in its place, with its permissions.
                    // Left without a choice, the search returns the row as it was.
                    <DirectoryPicker
                      aria-label={`Remplacer ${principal.name}`}
                      placeholder="Chercher un utilisateur ou un groupe Entra"
                      value={principal}
                      onChange={(other) => {
                        setToReplace(null);
                        if (other && key(other) !== key(principal)) {
                          void replaceExisting(principal, other, permissions);
                        }
                      }}
                      onBlur={() => setToReplace(null)}
                      autoFocus
                      size="sm"
                      radius={ROUNDING}
                      style={nameStyle}
                      styles={{ input: nameFieldStyle(true) }}
                      comboboxProps={{ withinPortal: true }}
                    />
                  ) : (
                    <UnstyledButton
                      onClick={() => setToReplace(key(principal))}
                      title="Changer d'utilisateur ou de groupe"
                      style={nameStyle}
                    >
                      <Text size="sm" truncate>
                        {principal.name || principal.email}
                      </Text>
                      {/* A user's address under their name; a group only has
                      its name — its icon says what it is. */}
                      {principal.type !== "group" && principal.email && (
                        <Text size="xs" c="dimmed" truncate>
                          {principal.email}
                        </Text>
                      )}
                    </UnstyledButton>
                  )}

                  {inline ? (
                    // Its permissions inline in the row: they are sent on choice.
                    <InlineChoice
                      inColumns={inColumns}
                      rows={inline(
                        permissions,
                        (p) => void handleSave(principal, p),
                      )}
                    />
                  ) : (
                    // What it has, at a glance, and its modal on click.
                    <RowButton
                      icon={IconShieldLock}
                      onClick={() => setPermissionsOf(principal)}
                    >
                      {summary(permissions)}
                    </RowButton>
                  )}
                </Group>
              ))}
              {adding && (
                <Group
                  ref={addRow}
                  gap="sm"
                  wrap="nowrap"
                  // Left without choosing anything, the row disappears. Going from
                  // the search to the permissions does not leave it.
                  onBlur={(e) => {
                    if (
                      addRow.current?.contains(
                        e.relatedTarget as Node | null,
                      )
                    )
                      return;
                    if (inline && newValue) return;
                    closeAdd();
                  }}
                  style={{
                    ...rowStyle(total - 1, total, false),
                    paddingLeft: ROW_INSET,
                  }}
                >
                  <DirectoryPicker
                    aria-label="Ajouter un utilisateur ou un groupe"
                    placeholder="Chercher un utilisateur ou un groupe Entra"
                    value={inline ? newValue : null}
                    resetOnSelect={!inline}
                    // With inline permissions, the choice stays in the field
                    // while they are set on the right. Otherwise, choosing opens
                    // the permissions modal: it only enters the list once
                    // saved.
                    onChange={(principal) => {
                      if (inline) {
                        setNewEntry(principal);
                        void tryAdd(principal, newItems);
                        return;
                      }
                      if (!principal) return;
                      closeAdd();
                      setPermissionsOf(principal);
                    }}
                    autoFocus
                    size="sm"
                    radius={ROUNDING}
                    style={{ flex: 1, minWidth: 0 }}
                    styles={{ input: nameFieldStyle(true) }}
                    comboboxProps={{ withinPortal: true }}
                  />
                  {inline && (
                    <InlineChoice
                      inColumns={inColumns}
                      rows={inline(newItems, (p) => {
                        setNewValues(p);
                        void tryAdd(newValue, p);
                      })}
                    />
                  )}
                </Group>
              )}
            </Stack>
          </ScrollArea>
        )}
        {/* As close as possible to the list it extends. */}
        <AddButton
          label="Ajouter un utilisateur ou un groupe"
          onClick={() => setAdding(true)}
          mt={4}
        />
      </div>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          {sections && (
            <>
              <Menu.Item
                leftSection={<IconShieldLock size={16} />}
                onClick={() => {
                  setPermissionsOf(menu.principal);
                  setMenu(null);
                }}
              >
                Permissions
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              setPendingDelete(menu.principal);
              setMenu(null);
            }}
          >
            {removeDialog.label}
          </Menu.Item>
        </PointMenu>
      )}

      {sections && (
        <PrincipalPermissionsModal
          principal={permissionsOf}
          initial={initials}
          sections={sections}
          onSave={async (permissions) => {
            if (!permissionsOf) return;
            setAccess(await save(permissionsOf, permissions));
            onChange?.();
          }}
          onClose={() => setPermissionsOf(null)}
        />
      )}

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            try {
              setAccess(await remove(pendingDelete));
              onChange?.();
            } catch (e) {
              notifyError(errorMessage(e));
            }
          }
          setPendingDelete(null);
        }}
        title={removeDialog.label}
        message={removeDialog.message(pendingDelete?.name ?? "")}
      />
    </Stack>
  );
}
