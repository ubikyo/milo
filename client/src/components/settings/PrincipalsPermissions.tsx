import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Collapse,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconUser, IconUsersGroup } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  ROUNDING,
  RowCheckbox,
  ListFooter,
  useRowSelection,
  EmptyList,
  ROW_INSET,
  HEADER_BACKGROUND,
  nameFieldStyle,
  rowStyle,
} from "../ui/DrawerRows";
import DirectoryPicker from "./DirectoryPicker";
import PrincipalSelect from "./PrincipalSelect";
import { errorMessage, notifyError } from "../../lib/errors";
import type { EntraPrincipal, PrincipalPermissions } from "@milo/shared";

/** The background of a row's icon: a neutral gray, darker than the row. */
const AVATAR_BACKGROUND = "var(--milo-control-bg)";

/**
 * The height of a row's content: that of a user, its name ("sm") over its
 * address ("xs") — the row's padding around it.
 */
const CONTENT_HEIGHT = "calc((var(--mantine-font-size-sm) + var(--mantine-font-size-xs)) * var(--mantine-line-height))";

/** The gap between a row's elements: the Settings' (rowStyle), or "sm". */
const GAP = "var(--milo-row-gap-accordion, 12px)";

/** The chevron's room, in front of the icon. */
const CHEVRON_SIZE = 16;

/**
 * The room right of a row's checkbox, up to the chevron — tighter than its
 * own margin (2 px) and the row's gap: the chevron is pulled back by the
 * difference.
 */
const AFTER_CHECKBOX = 10;

/** The room between unfolded permissions and the next principal. */
const UNFOLDED_SPACE = 30;

/**
 * "Ajouter" under the last one unfolded, stacked under its own: a shorter
 * button, drawn up against it — its text a line below the other's.
 */
const STACKED_HEIGHT = 20;
const STACKED_OFFSET = -5;

/** The top of a stack's first row, rounded. */
const ROUNDED_TOP = (({ borderTopLeftRadius, borderTopRightRadius }) => ({
  borderTopLeftRadius,
  borderTopRightRadius,
}))(rowStyle(0, 2, false));

/** The unfolding's duration: that of Mantine's accordions. */
const UNFOLD_DURATION = 200;

/**
 * A row's texts: Mantine's own, unless the window sets them — the Settings
 * ("Formulaire" > "Liste" > "Gestion de groupes et utilisateurs").
 */
const textStyle = (part: string, color: string, size: string) => ({
  color: `var(--milo-principal-${part}, ${color})`,
  size: `var(--milo-principal-${part}-size, ${size})`,
  weight: `var(--milo-principal-${part}-weight, 400)`,
});
const NAME = textStyle("name", "var(--mantine-color-text)", "var(--mantine-font-size-sm)");
const EMAIL = textStyle("email", "var(--mantine-color-dimmed)", "var(--mantine-font-size-xs)");
const SUMMARY = textStyle("summary", "var(--mantine-color-dimmed)", "var(--mantine-font-size-xs)");

/** The chevron's background on hover: a neutral gray, darker than the header. */
const CHEVRON_HOVER = "var(--milo-control-bg)";

const key = (p: EntraPrincipal) => `${p.type}:${p.id}`;

interface PrincipalsPermissionsProps<T> {
  load: () => Promise<PrincipalPermissions<T>[]>;
  /** Saves a principal's permissions; returns the updated list. */
  save: (principal: EntraPrincipal, permissions: T) => Promise<PrincipalPermissions<T>[]>;
  /** Removes it from the list; returns the updated list. */
  remove: (principal: EntraPrincipal) => Promise<PrincipalPermissions<T>[]>;
  /** Those of someone coming from the directory: none. */
  empty: () => T;
  /** What it has, at a glance, at the end of its row. */
  summary: (permissions: T) => string;
  /**
   * Its permissions, unfolded under its row by the chevron in front of the
   * user or group (SectionRights).
   */
  details: (
    permissions: T,
    change: (permissions: T) => void,
    entry: PrincipalPermissions<T>,
  ) => ReactNode;
  emptyText: string;
  /**
   * The action that removes it, and its confirmation — for one principal;
   * several are named in a message built from the label.
   */
  removeDialog: { label: string; message: (name: string) => ReactNode };
  /** Read-only: no adding, no removal, no change. */
  readOnly?: boolean;
  /**
   * Can they be removed — or replaced, which removes them? By default, yes;
   * without it, they can still be added and changed.
   */
  canRemove?: boolean;
  /** Empty, the list takes the whole free height, its prompt centered in it. */
  fillEmpty?: boolean;
  /**
   * Those that can be added, picked from a list — the workspace's users and
   * groups, for a view's sharing. Without it, the Entra directory is searched.
   */
  candidates?: EntraPrincipal[];
  /**
   * The account itself, and its groups, can be neither removed nor replaced
   * — the administration. Otherwise they are only tagged.
   */
  protectOwn?: boolean;
  /**
   * The background of the principals' rows: the darker gray of a checklist's
   * title by default; the administration takes that of the drawer lists.
   */
  headerBackground?: string;
}

/**
 * Entra users and groups and their permissions: the access of a workspace
 * (WorkspaceAccess), the application's administration (AdministrationTab).
 * They look like a checklist: one header row each — its name, its address if
 * it has one, how many permissions it has —, its permissions unfolded below
 * by a chevron. Checked rows are removed together; "Ajouter" adds a row that
 * searches the directory: whoever is chosen enters the list without any
 * permission, unfolded to receive them. Clicking a name puts someone else in
 * its place. The account itself, and its groups ("own"), are tagged — and,
 * with "protectOwn", can be neither removed nor replaced.
 */
export default function PrincipalsPermissions<T>({
  load,
  save,
  remove,
  empty,
  summary,
  details,
  emptyText,
  removeDialog,
  readOnly = false,
  canRemove = true,
  protectOwn = true,
  headerBackground = HEADER_BACKGROUND,
  fillEmpty = false,
  candidates,
}: PrincipalsPermissionsProps<T>) {
  const [access, setAccess] = useState<PrincipalPermissions<T>[]>([]);
  // Those awaiting confirmation of their removal.
  const [pendingDelete, setPendingDelete] = useState<EntraPrincipal[]>([]);
  // The added row, where the directory is searched.
  const [adding, setAdding] = useState(false);
  // The add row, measured: its list takes its width (addRowDropdown).
  const [addRow, setAddRow] = useState<HTMLDivElement | null>(null);
  // The row whose user or group is being changed, by clicking its name.
  const [toReplace, setToReplace] = useState<string | null>(null);
  // The rows unfolded, by key.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());

  /** Is the row at this rank the last of the list, unfolded? */
  const lastUnfolded = (rank: number) =>
    !adding &&
    rank >= 0 &&
    rank === access.length - 1 &&
    unfolded.has(key(access[rank]!.principal));
  /** Does the row at this rank follow an unfolded one? */
  const afterUnfolded = (rank: number) =>
    rank > 0 && unfolded.has(key(access[rank - 1]!.principal));
  const toggleUnfolded = (k: string) =>
    setUnfolded((before) => {
      const next = new Set(before);
      if (!next.delete(k)) next.add(k);
      return next;
    });

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

  const handleSave = async (principal: EntraPrincipal, permissions: T) => {
    try {
      setAccess(await save(principal, permissions));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  /**
   * Another one in its place: it receives the same permissions, then the
   * old one leaves. If it already had a row, its permissions are replaced
   * by these.
   */
  const replaceExisting = async (old: EntraPrincipal, other: EntraPrincipal, permissions: T) => {
    try {
      await save(other, permissions);
      setAccess(await remove(old));
    } catch (e) {
      notifyError(errorMessage(e));
      void reload();
    }
  };

  /** Removes the checked principals, one call each: the last answer is the updated list. */
  const removeAll = async (list: EntraPrincipal[]) => {
    try {
      for (const principal of list) setAccess(await remove(principal));
    } catch (e) {
      notifyError(errorMessage(e));
      void reload();
    }
  };

  const total = access.length + (adding ? 1 : 0);
  const selection = useRowSelection(access.map((a) => key(a.principal)));

  /** « A », « B » et « C ». */
  const names = (list: EntraPrincipal[]) => {
    const quoted = list.map((p) => `« ${p.name || p.email} »`);
    return quoted.length > 1
      ? `${quoted.slice(0, -1).join(", ")} et ${quoted[quoted.length - 1]}`
      : (quoted[0] ?? "");
  };
  // "Retirer l'accès" → "retirer l'accès", in the middle of a sentence.
  const action = removeDialog.label.charAt(0).toLowerCase() + removeDialog.label.slice(1);
  // A row's name takes what the summary leaves it, at the end.
  // A group, with no address, keeps the height of a user, centered: all rows
  // are equal.
  const nameStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    minHeight: CONTENT_HEIGHT,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };

  /** Its name, and a user's address under it; a group only has its name — its icon says what it is. */
  const identity = (principal: EntraPrincipal, own?: boolean) => (
    <>
      <Group gap={6} wrap="nowrap">
        <Text size="sm" c={NAME.color} fz={NAME.size} fw={NAME.weight} truncate>
          {principal.name || principal.email}
        </Text>
        {/* Oneself, or one's group: a green tag says so, as the VLAN's in Assets. */}
        {own && (
          <Badge
            color="green"
            variant="filled"
            size="sm"
            radius="sm"
            tt="none"
            style={{ flexShrink: 0 }}
            // In the Settings, their tags' look ("Formulaire" > "Liste" > "Tag").
            data-list-tag="filled"
          >
            {principal.type === "group" ? "Groupe courant" : "Utilisateur courant"}
          </Badge>
        )}
      </Group>
      {principal.type !== "group" && principal.email && (
        <Text size="xs" c={EMAIL.color} fz={EMAIL.size} fw={EMAIL.weight} truncate>
          {principal.email}
        </Text>
      )}
    </>
  );

  const filled = fillEmpty && total === 0;
  const stacked = lastUnfolded(access.length - 1);

  // Those not yet listed, when they are picked from a given list.
  const available = (candidates ?? []).filter(
    (c) => !access.some((a) => key(a.principal) === key(c)),
  );
  const pickerPlaceholder = candidates
    ? "Choisir un utilisateur ou un groupe"
    : "Chercher un utilisateur ou un groupe Entra";
  /** The directory search, or the given list without those already listed. */
  const picker = (props: ComponentProps<typeof DirectoryPicker>) => {
    if (!candidates) return <DirectoryPicker {...props} />;
    const { resetOnSelect, groupsOnly: _groupsOnly, ...rest } = props;
    return (
      <PrincipalSelect
        candidates={available}
        {...rest}
        // Restart from an empty field after each choice.
        {...(resetOnSelect ? { value: null } : null)}
      />
    );
  };

  /** The add row's inset above and below, the themes' ("Liste" > "Padding"). */
  const addRowInset = addRow ? getComputedStyle(addRow).paddingTop : ROW_INSET + 5;

  /**
   * The add row's list: centered under the field, centered in the row, it
   * takes the row's width, and leaves it ROW_INSET below its bottom.
   */
  const addRowDropdown = () => {
    if (!addRow) return null;
    const below = parseFloat(getComputedStyle(addRow).paddingBottom) || 0;
    return { width: addRow.offsetWidth, offset: below + ROW_INSET };
  };

  return (
    <Stack gap="sm" style={filled ? { flex: 1 } : undefined}>
      <div style={filled ? { flex: 1, display: "flex", flexDirection: "column" } : undefined}>
        {total === 0 ? (
          <EmptyList icon={IconUsersGroup} message={emptyText} fill={filled} />
        ) : (
          <Stack gap={1}>
            {access.map((entry, rank) => {
              const { principal, permissions, own } = entry;
              const open = unfolded.has(key(principal));
              const locked = (own && protectOwn) || !canRemove;
              return (
                // One block per principal: folded, the panel adds no gap to the list's.
                <div key={key(principal)}>
                  <Group
                    gap="sm"
                    wrap="nowrap"
                    style={{
                      ...rowStyle(rank, total, false, "accordion"),
                      // After an unfolded one, a block of its own: rounded at the top.
                      ...(afterUnfolded(rank) ? ROUNDED_TOP : null),
                      // A header above its permissions: the darker gray of a
                      // checklist's title, square at the bottom when they are
                      // unfolded against it.
                      backgroundColor: headerBackground,
                      ...(open ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null),
                    }}
                  >
                    {/* Oneself, or one's group, cannot be removed: its box
                        stays, greyed out. */}
                    {!readOnly && (
                      <RowCheckbox
                        label={`Sélectionner ${principal.name || principal.email}`}
                        checked={!locked && selection.isChecked(key(principal))}
                        onChange={(on) => selection.toggle(key(principal), on)}
                        disabled={locked}
                      />
                    )}
                    {/* Unfolds its permissions under the row, and folds them back. */}
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size={CHEVRON_SIZE + 4}
                      // Its color, open or folded, when the window sets it
                      // (SettingsModal.module.css).
                      data-principal-chevron
                      data-open={open || undefined}
                      // A neutral gray on hover, darker than the header:
                      // Mantine's grays lean blue.
                      style={
                        {
                          "--ai-hover": CHEVRON_HOVER,
                          marginLeft: readOnly ? 0 : `calc(${AFTER_CHECKBOX - 2}px - ${GAP})`,
                        } as CSSProperties
                      }
                      onClick={() => toggleUnfolded(key(principal))}
                      aria-expanded={open}
                      aria-label={`Permissions de ${principal.name || principal.email}`}
                    >
                      {/* Down when folded, up when unfolded — turning with
                          the panel, like the accordions. */}
                      <IconChevronDown
                        size={CHEVRON_SIZE}
                        style={{
                          transform: open ? "rotate(180deg)" : undefined,
                          transition: `transform ${UNFOLD_DURATION}ms ease`,
                        }}
                      />
                    </ActionIcon>
                    {/* A neutral gray behind the icon: Mantine's grays lean blue. */}
                    <Avatar
                      size={28}
                      radius="xl"
                      styles={{
                        root: { flexShrink: 0 },
                        placeholder: {
                          backgroundColor: `var(--milo-principal-icon-bg, ${AVATAR_BACKGROUND})`,
                          color: "var(--milo-principal-icon, var(--mantine-color-text))",
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
                      // Another one — from the directory, or the given list —
                      // in its place, with its
                      // permissions. Left without a choice, the search returns
                      // the row as it was.
                      picker({
                        "aria-label": `Remplacer ${principal.name}`,
                        placeholder: pickerPlaceholder,
                        value: principal,
                        onChange: (other) => {
                          setToReplace(null);
                          if (other && key(other) !== key(principal)) {
                            void replaceExisting(principal, other, permissions);
                          }
                        },
                        onBlur: () => setToReplace(null),
                        autoFocus: true,
                        size: "sm",
                        radius: ROUNDING,
                        style: nameStyle,
                        styles: { input: nameFieldStyle(true) },
                        comboboxProps: { withinPortal: true },
                      })
                    ) : readOnly || locked ? (
                      // Not replaced either: that would remove it.
                      <Box style={nameStyle}>{identity(principal, own)}</Box>
                    ) : (
                      <UnstyledButton
                        onClick={() => setToReplace(key(principal))}
                        title="Changer d'utilisateur ou de groupe"
                        style={nameStyle}
                      >
                        {identity(principal, own)}
                      </UnstyledButton>
                    )}
                    {/* What it has, at a glance, at the end of the row: the
                        row's padding from the right edge. */}
                    <Text
                      size="xs"
                      c={SUMMARY.color}
                      fz={SUMMARY.size}
                      fw={SUMMARY.weight}
                      style={{ flexShrink: 0 }}
                    >
                      {summary(permissions)}
                    </Text>
                  </Group>
                  {/* Right under the row, from its left edge: its permissions,
                      then some air before the next one. They unfold like the
                      accordions (Assets). */}
                  <Collapse
                    expanded={open}
                    transitionDuration={UNFOLD_DURATION}
                    keepMounted={false}
                  >
                    <Box
                      // The last one has nothing below it but "Ajouter": no
                      // room, the two buttons stack up.
                      style={{
                        paddingTop: 1,
                        paddingBottom: lastUnfolded(rank) ? 0 : UNFOLDED_SPACE,
                      }}
                    >
                      {details(permissions, (p) => void handleSave(principal, p), entry)}
                    </Box>
                  </Collapse>
                </div>
              );
            })}
            {adding && (
              <Group
                ref={setAddRow}
                gap="sm"
                wrap="nowrap"
                style={{
                  ...rowStyle(total - 1, total, false, "accordion"),
                  ...(afterUnfolded(access.length) ? ROUNDED_TOP : null),
                  // The field alone in the row, framed evenly: on the sides,
                  // the row's inset above and below it.
                  paddingLeft: addRowInset,
                  paddingRight: addRowInset,
                }}
              >
                {picker({
                  "aria-label": "Ajouter un utilisateur ou un groupe",
                  placeholder: pickerPlaceholder,
                  value: null,
                  resetOnSelect: true,
                  // Chosen, it enters the list right away, without any
                  // permission, unfolded to receive them.
                  onChange: (principal) => {
                    if (!principal) return;
                    setAdding(false);
                    setUnfolded((before) => new Set(before).add(key(principal)));
                    void handleSave(principal, empty());
                  },
                  // Left without choosing anything, the row disappears.
                  onBlur: () => setAdding(false),
                  autoFocus: true,
                  size: "sm",
                  radius: ROUNDING,
                  style: { flex: 1, minWidth: 0 },
                  styles: { input: nameFieldStyle(true) },
                  // The list as wide as the row, a few pixels under it — as
                  // the others' under their row.
                  comboboxProps: { withinPortal: true, ...addRowDropdown() },
                })}
              </Group>
            )}
          </Stack>
        )}
        {/* As close as possible to the list it extends. */}
        {!readOnly && (
          // Stacked right under the "Ajouter" of the last one unfolded: tighter,
          // like a second line of the same list. The button sits in a line:
          // its block is what is drawn up.
          <div style={stacked ? { marginTop: STACKED_OFFSET } : undefined}>
            <ListFooter
              {...(stacked ? { mt: 0, h: STACKED_HEIGHT } : null)}
              {...(available.length > 0 || !candidates
                ? { addLabel: "Ajouter un utilisateur ou un groupe", onAdd: () => setAdding(true) }
                : null)}
              checkedCount={selection.checked.length}
              onDeleteChecked={() =>
                setPendingDelete(
                  access.map((a) => a.principal).filter((p) => selection.isChecked(key(p))),
                )
              }
            />
          </div>
        )}
      </div>

      <DeleteConfirmModal
        opened={pendingDelete.length > 0}
        onClose={() => setPendingDelete([])}
        onConfirm={async () => {
          const list = pendingDelete;
          setPendingDelete([]);
          selection.reset();
          await removeAll(list);
        }}
        title={
          pendingDelete.length > 1
            ? `${removeDialog.label} à ${pendingDelete.length} utilisateurs ou groupes`
            : removeDialog.label
        }
        message={
          pendingDelete.length > 1 ? (
            <>
              Voulez-vous vraiment {action} à {names(pendingDelete)} ?
            </>
          ) : (
            removeDialog.message(pendingDelete[0]?.name ?? "")
          )
        }
      />
    </Stack>
  );
}
