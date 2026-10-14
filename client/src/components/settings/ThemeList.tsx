import { Box, Group, Input, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconCopy, IconMoon, IconPalette, IconSun } from "@tabler/icons-react";
import { useState } from "react";
import type { Theme } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import { currentScheme, themeOf, updateThemes, useThemes } from "../../lib/themeColors";
import AddButton from "../ui/AddButton";
import { PLUS_SIZE } from "../../themes/plus";
import classes from "../../assets/styles/SettingsList.module.css";

import {
  DeleteSelectedButton,
  EmptyList,
  INPUT_INSET,
  ListHeader,
  ROUNDING,
  RowCheckbox,
  RowField,
  nameFieldStyle,
  pickKeys,
  rowStyle,
  useRowSelection,
  ADDED_ROW_PADDING_RIGHT,
  FIRST_FIELD_MARGIN,
} from "../ui/DrawerRows";

// The "Thèmes" section of "Paramétrage" > "Affichage": the list of themes,
// for the whole application, drawn like a drawer's lists (DrawerRows): one
// row per theme, its name edited in place. "Ajouter un thème" adds a row
// whose name makes a copy of the theme the page shows — left empty, it
// disappears. The checked themes are duplicated or deleted together from
// the buttons that take the place of "Ajouter" meanwhile.
//
// One dark theme and one light theme are the system's — whoever follows the
// system ("Lié au système", in the profile) sees them —: the field at the end
// of a row gives a theme that role, taken from the other theme of its
// scheme. They cannot be deleted.

const SYSTEM_LABEL: Record<Theme["scheme"], string> = {
  dark: "Thème système foncé",
  light: "Thème système clair",
};

/** The system field's width: its longest choice. */
const SYSTEM_WIDTH = 190;

const onError = (e: unknown) => notifyError(errorMessage(e));

export default function ThemeList() {
  const { themes } = useThemes();
  // The added row, waiting for its name.
  const [adding, setAdding] = useState(false);
  /** The theme whose system list is open: its field takes the background. */
  const [opened, setOpened] = useState<number | null>(null);
  const checks = useRowSelection(themes.map((t) => t.id));
  const checked = themes.filter((t) => checks.isChecked(t.id));


  const nextId = (list: Theme[]) => Math.max(0, ...list.map((t) => t.id)) + 1;

  /** Copies of the themes, at the end: their scheme and colors, without the system's role. */
  const copies = (sources: Theme[], name: (t: Theme) => string) => {
    const next = [...themes];
    for (const source of sources) next.push({ ...source, id: nextId(next), name: name(source), system: false });
    return next;
  };

  const create = (name: string) => {
    setAdding(false);
    if (name) updateThemes(copies([themeOf(currentScheme())], () => name), onError);
  };

  const rename = (theme: Theme, name: string) => {
    if (!name || name === theme.name) return;
    updateThemes(
      themes.map((t) => (t.id === theme.id ? { ...t, name } : t)),
      onError,
    );
  };

  const duplicateChecked = () => {
    updateThemes(copies(checked, (t) => `${t.name} (copie)`), onError);
    checks.reset();
  };

  // The system's themes are never deleted: the button doesn't show with one checked.
  const removeChecked = () => {
    updateThemes(
      themes.filter((t) => t.system || !checks.isChecked(t.id)),
      onError,
    );
    checks.reset();
  };

  /** The system's role for its scheme, taken from the theme that had it. */
  const makeSystem = (theme: Theme) =>
    updateThemes(
      themes.map((t) => (t.scheme === theme.scheme ? { ...t, system: t.id === theme.id } : t)),
      onError,
    );

  const rows: (Theme | null)[] = adding ? [...themes, null] : themes;

  return (
    <Input.Wrapper label="Thèmes" className={classes.list} data-settings-list>
      {rows.length === 0 ? (
        <EmptyList icon={IconPalette} message="Aucun thème" />
      ) : (
        <Stack gap={1}>
          <ListHeader
            columns={[
              { label: "Nom", style: { flex: 1 }, inset: INPUT_INSET },
              // Over the icon of each row.
              { label: "", style: { width: 16 }, inset: 0 },
              { label: "Rôle", style: { width: SYSTEM_WIDTH }, inset: INPUT_INSET },
            ]}
          />
          {rows.map((theme, rank) => {
            const ThemeIcon = !theme?.system ? IconPalette : theme.scheme === "dark" ? IconMoon : IconSun;
            return (
              <Group key={theme?.id ?? "new"} gap="sm" wrap="nowrap" style={{
                  // The columns' header opens the stack (ListHeader).
                  ...rowStyle(rank + 1, rows.length + 1, false),
                  // Added, its name alone: as far from both edges.
                  ...(theme ? null : { paddingRight: ADDED_ROW_PADDING_RIGHT }),
                }}
              >
                {theme ? (
                  <RowCheckbox
                    label={`Sélectionner ${theme.name}`}
                    checked={checks.isChecked(theme.id)}
                    onChange={(on) => checks.toggle(theme.id, on)}
                  />
                ) : null}
                {/* The added row, without a checkbox: its name opens it. */}
                <Box
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    marginLeft: theme ? 0 : FIRST_FIELD_MARGIN,
                  }}
                >
                  <RowField
                    name={theme?.name ?? ""}
                    onValidate={(name) => (theme ? rename(theme, name) : create(name))}
                    placeholder="Nom du thème"
                    label={theme ? `Nom de ${theme.name}` : "Nom du thème à ajouter"}
                    autoFocus={!theme}
                  />
                </Box>
                {theme && (
                  <>
                    {/* The system's two show the scheme they stand for; the others, the themes' icon. */}
                    <ThemeIcon size={16} style={{ flexShrink: 0, color: "var(--milo-settings-theme-list-icon-color)" }} />
                    <Select
                      size="sm"
                      radius={ROUNDING}
                      w={SYSTEM_WIDTH}
                      style={{ flexShrink: 0 }}
                      data={[
                        { value: "", label: "—" },
                        { value: "system", label: SYSTEM_LABEL[theme.scheme] },
                      ]}
                      value={theme.system ? "system" : ""}
                      onChange={(value) => value === "system" && makeSystem(theme)}
                      // The system's theme keeps its role until another takes it.
                      disabled={theme.system}
                      allowDeselect={false}
                      {...pickKeys}
                      onDropdownOpen={() => setOpened(theme.id)}
                      onDropdownClose={() => setOpened(null)}
                      rightSection={
                        theme.system ? null : (
                          <IconChevronDown size={14} color="var(--milo-settings-theme-list-selected-chevron)" />
                        )
                      }
                      rightSectionPointerEvents="none"
                      comboboxProps={{ shadow: "md", withinPortal: true }}
                      classNames={{ dropdown: classes.dropdown, option: classes.option }}
                      styles={{ input: { ...nameFieldStyle(opened === theme.id), cursor: "pointer" } }}
                      aria-label={`Rôle de ${theme.name}`}
                    />
                  </>
                )}
              </Group>
            );
          })}
        </Stack>
      )}

      {/* While themes are checked: duplicate them, and delete them unless one is the system's. */}
      {checked.length > 0 ? (
        <Group gap="lg" mt={4}>
          <AddButton
            label={checked.length > 1 ? "Dupliquer les thèmes" : "Dupliquer le thème"}
            leftSection={<IconCopy size={PLUS_SIZE} />}
            onClick={duplicateChecked}
          />
          {!checked.some((t) => t.system) && (
            <DeleteSelectedButton count={checked.length} onClick={removeChecked} />
          )}
        </Group>
      ) : (
        <AddButton label="Ajouter un thème" onClick={() => setAdding(true)} mt={4} />
      )}
    </Input.Wrapper>
  );
}
