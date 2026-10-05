import { Group, MultiSelect, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconShieldLock } from "@tabler/icons-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import SectionsPicker from "./SectionsPicker";
import {
  ROUNDING,
  EmptyList,
  ListFooter,
  RowCheckbox,
  RowCheckboxSpace,
  useRowSelection,
  nameFieldStyle,
  rowStyle,
  pickKeys,
} from "../ui/DrawerRows";

// The permissions of a user or a group, unfolded under its row
// (PrincipalsPermissions): one row per section it has rights in — "Paramétrage"
// and "Workspaces" in the administration, a widget type in a workspace's access
// —, the section on the left, its rights on the right. Like the other lists of
// Settings: "Ajouter" adds an empty row at the end, where the section is picked
// — left without a choice, it disappears; checked rows lose their rights
// together. A section without any right leaves the list.

/** The room right of the checkbox, up to the section. */
const AFTER_CHECKBOX = 6;

/** The rights' pills: the height of an "xs" pill (18 px) plus 4, and their rounding. */
const PILL_HEIGHT = 22;
const PILL_RADIUS = 4;

/** The width of the section's field: enough to read "Notifications", and room left for the rights. */
const SECTION_WIDTH = 200;

/**
 * A section and the rights it offers, in their order — and, if it has one,
 * the group it is listed under in the section's choice ("Widgets",
 * "Application").
 */
export interface RightsSection {
  value: string;
  label: string;
  rights: readonly { value: string; label: string }[];
  group?: string;
}

/** The rights held in each section; a section left out holds none. */
export type SectionPermissions = Record<string, string[]>;

interface SectionRightsProps {
  sections: readonly RightsSection[];
  permissions: SectionPermissions;
  onChange: (permissions: SectionPermissions) => void;
  /**
   * Can the author grant or remove this right? By default, yes. A section
   * none of whose rights they can grant is not offered.
   */
  canGrant?: (section: string, right: string) => boolean;
  /**
   * Rights that cannot be removed: those saved for the author or one of their
   * groups — one does not lock oneself out. They can still be added to.
   */
  kept?: SectionPermissions;
  /**
   * A section's rights after a change, straightened out — "Modifier" brings
   * "Lire" with it, for example. By default, as chosen.
   */
  normalize?: (section: string, before: string[], after: string[]) => string[];
  /** Shown, not changed. */
  readOnly?: boolean;
  /** Right under a header row (the user's): square at the top, against it. */
  attached?: boolean;
  /** What a section is, in the list's words: "Ajouter une permission" by default. */
  addLabel?: string;
  emptyMessage?: string;
  /**
   * Several sections added at once, checked in a list with an "all" entry
   * above them — a view's boards, for its sharing. Without it, one at a time.
   */
  multiAdd?: { allLabel: string; countLabel: (n: number) => string };
}

export default function SectionRights({
  sections,
  permissions,
  onChange,
  canGrant = () => true,
  kept,
  normalize = (_section, _before, after) => after,
  readOnly = false,
  attached = false,
  addLabel = "Ajouter une permission",
  emptyMessage = "Aucune permission",
  multiAdd,
}: SectionRightsProps) {
  // The added row, waiting for its section.
  const [adding, setAdding] = useState(false);
  /** The section whose field has its list open: it takes the background. */
  const [isOpen, setOpened] = useState<string | null>(null);

  const sectionOf = (value: string) => sections.find((s) => s.value === value)!;
  const rightsOf = (p: SectionPermissions, section: string) => p[section] ?? [];

  /** Can this right be granted or removed by the author? */
  const canChange = (section: string, right: string) =>
    !readOnly && !rightsOf(kept ?? {}, section).includes(right) && canGrant(section, right);

  const offered = sections
    .filter((s) => s.rights.some((r) => canChange(s.value, r.value)))
    .map((s) => s.value);
  // The sections it has rights in, in their order.
  const listed = sections.map((s) => s.value).filter((s) => rightsOf(permissions, s).length > 0);
  const rows = adding ? [...listed, ""] : listed;
  const checks = useRowSelection(listed);

  /** The section receives these rights, in their order; the others keep theirs. */
  const withRights = (base: SectionPermissions, section: string, rights: string[]) => ({
    ...base,
    [section]: sectionOf(section)
      .rights.map((r) => r.value)
      .filter((r) => rights.includes(r)),
  });

  /** What the author cannot remove from a section: what stays of it. */
  const remaining = (p: SectionPermissions, section: string) =>
    rightsOf(p, section).filter((r) => !canChange(section, r));

  /** Its first right the author may grant: what a newly picked section receives. */
  const firstRight = (section: string) =>
    sectionOf(section)
      .rights.map((r) => r.value)
      .filter((r) => canChange(section, r))
      .slice(0, 1);

  const pickSection = (rank: number, choice: string | null) => {
    setAdding(false);
    if (!choice) return;
    const old = rows[rank];
    if (old === choice) return;
    // In place of another: that one loses its rights — those the author
    // can remove.
    const base = old ? withRights(permissions, old, remaining(permissions, old)) : permissions;
    onChange(withRights(base, choice, normalize(choice, [], firstRight(choice))));
  };

  /** Several sections at once, each with its first right. */
  const pickSections = (choices: string[]) => {
    setAdding(false);
    onChange(
      choices.reduce(
        (p, choice) => withRights(p, choice, normalize(choice, [], firstRight(choice))),
        permissions,
      ),
    );
  };

  const removeChecked = () => {
    // The rights the author cannot remove stay.
    onChange(
      checks.checked.reduce(
        (p, section) => withRights(p, section, remaining(p, section)),
        permissions,
      ),
    );
    checks.reset();
  };

  const changeRights = (section: string, chosen: string[]) => {
    const before = rightsOf(permissions, section);
    const after = normalize(section, before, chosen);
    // Kept: the rights the author cannot remove.
    onChange(
      withRights(permissions, section, [
        ...after,
        ...remaining(permissions, section).filter((r) => !after.includes(r)),
      ]),
    );
  };

  /**
   * The sections a row can take: its own, and those not already taken —
   * under their group's name, when they have one.
   */
  const sectionChoice = (own: string) => {
    const choice = sections.filter(
      (s) => s.value === own || (offered.includes(s.value) && !listed.includes(s.value)),
    );
    const option = (s: RightsSection) => ({ value: s.value, label: s.label });
    if (!choice.some((s) => s.group)) return choice.map(option);
    const groups = [...new Set(choice.map((s) => s.group ?? ""))];
    return groups.map((group) => ({
      group,
      items: choice.filter((s) => (s.group ?? "") === group).map(option),
    }));
  };

  return (
    <div>
      {rows.length === 0 ? (
        <EmptyList icon={IconShieldLock} message={emptyMessage} attached={attached} />
      ) : (
        <Stack gap={1}>
          {rows.map((section, rank) => {
            const newRow = section === "";
            // A section whose rights the author cannot touch stays as it is.
            const locked =
              !newRow && sectionOf(section).rights.every((r) => !canChange(section, r.value));
            return (
              <Group
                key={section || "new"}
                gap="sm"
                wrap="nowrap"
                // Attached, the first row is not rounded at the top: the
                // header row is above it.
                style={
                  attached
                    ? rowStyle(rank + 1, rows.length + 1, false)
                    : rowStyle(rank, rows.length, false)
                }
              >
                {newRow || locked ? (
                  <RowCheckboxSpace />
                ) : (
                  <RowCheckbox
                    label={`Sélectionner ${sectionOf(section).label}`}
                    checked={checks.isChecked(section)}
                    onChange={(on) => checks.toggle(section, on)}
                  />
                )}
                {newRow && multiAdd ? (
                  <SectionsPicker
                    choices={sections
                      .filter((s) => offered.includes(s.value) && !listed.includes(s.value))
                      .map((s) => ({ value: s.value, label: s.label }))}
                    allLabel={multiAdd.allLabel}
                    countLabel={multiAdd.countLabel}
                    onDone={pickSections}
                    style={{
                      width: SECTION_WIDTH,
                      flexShrink: 0,
                      marginLeft: AFTER_CHECKBOX - 2 - 12,
                    }}
                    inputStyle={nameFieldStyle(true)}
                    aria-label="Section à ajouter"
                  />
                ) : (
                  <Select
                    size="sm"
                    radius={ROUNDING}
                    // AFTER_CHECKBOX from the checkbox, like the chevron of the
                    // user's row: its own margin (2 px) and the row's gap
                    // (12 px) are taken back by the difference.
                    style={{
                      width: SECTION_WIDTH,
                      flexShrink: 0,
                      marginLeft: AFTER_CHECKBOX - 2 - 12,
                    }}
                    data={sectionChoice(section)}
                    value={section || null}
                    placeholder="Choisir"
                    onChange={(choice) => pickSection(rank, choice)}
                    // The added row, left without a section, disappears.
                    onBlur={() => newRow && setAdding(false)}
                    {...pickKeys}
                    onDropdownOpen={() => setOpened(section || "new")}
                    onDropdownClose={() => setOpened(null)}
                    allowDeselect={false}
                    autoFocus={newRow}
                    disabled={locked}
                    rightSection={<IconChevronDown size={14} />}
                    rightSectionPointerEvents="none"
                    comboboxProps={{ shadow: "md", withinPortal: true }}
                    styles={{
                      input: {
                        ...nameFieldStyle(isOpen === (section || "new")),
                        cursor: "pointer",
                      },
                    }}
                    aria-label={newRow ? "Section à ajouter" : "Section"}
                  />
                )}
                {!newRow && (
                  <MultiSelect
                    size="xs"
                    radius={ROUNDING}
                    style={{ flex: 1, minWidth: 0 }}
                    data={sectionOf(section).rights.map((r) => ({
                      value: r.value,
                      label: r.label,
                      disabled: !canChange(section, r.value),
                    }))}
                    value={rightsOf(permissions, section)}
                    onChange={(rights) => changeRights(section, rights)}
                    disabled={locked}
                    // The rights to the right of the field, at the end of the row.
                    // Taller than an "xs" pill (18 px) by 4 px, barely rounded.
                    styles={{
                      pillsList: { justifyContent: "flex-end" },
                      pill: {
                        "--pill-height": `${PILL_HEIGHT}px`,
                        height: PILL_HEIGHT,
                        borderRadius: PILL_RADIUS,
                      } as CSSProperties,
                    }}
                    comboboxProps={{ shadow: "md", withinPortal: true }}
                    aria-label={`Droits sur ${sectionOf(section).label}`}
                  />
                )}
              </Group>
            );
          })}
        </Stack>
      )}

      {/* As close as possible to the list it extends — as long as a section remains to add. */}
      {!readOnly && (
        <ListFooter
          {...(offered.some((s) => !listed.includes(s))
            ? { addLabel, onAdd: () => setAdding(true) }
            : null)}
          checkedCount={checks.checked.length}
          onDeleteChecked={removeChecked}
        />
      )}
    </div>
  );
}
