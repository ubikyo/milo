import { Group, Input, Menu, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPalette } from "@tabler/icons-react";
import { useState } from "react";
import { isBuiltInTitleStyle, TITLE_STYLE } from "@milo/shared";
import type { TitleStyle } from "@milo/shared";
import {
  appearanceOf,
  newStyleId,
  saveTitleStyles,
  styleOf,
  useTitleStyles,
} from "../../lib/titleStyles";
import { errorMessage, notifyError } from "../../lib/errors";
import { insertRow, type SettingRow } from "./SettingRows";
import SettingRows from "./SettingRows";
import DeleteConfirmModal from "./DeleteConfirmModal";
import {
  ListFooter,
  RowCheckbox,
  RowCheckboxSpace,
  RowField,
  RowRadio,
  rowStyle,
  useRowSelection,
} from "./DrawerRows";

// The styles of the titles (lib/titleStyles.ts), where they are chosen: in a
// title's drawer — a list like a board's categories, where they are also
// created, renamed and deleted, the radio button choosing the title's — and
// on its right click, which only switches from one to another.

type Config = Record<string, unknown>;

/** Writes the list, and says so when the server refuses it. */
const save = (next: TitleStyle[]) =>
  saveTitleStyles(next).catch((e: unknown) => notifyError(errorMessage(e)));

/**
 * Creates a style from a title's appearance, under this name, and returns the
 * title's configuration that uses it.
 */
export const createStyle = async (
  styles: TitleStyle[],
  config: unknown,
  name: string,
  /** The title's style when it names none (styleOf). */
  defaultStyle?: string,
  /** The title's type: the new style's base, when its current style has none. */
  type?: string,
): Promise<Config> => {
  const base = styleOf(config, defaultStyle)?.base ?? type;
  const style: TitleStyle = {
    id: newStyleId(),
    name,
    config: appearanceOf(config, defaultStyle),
    ...(base ? { base } : {}),
  };
  await saveTitleStyles([...styles, style]);
  notifications.show({ color: "teal", message: `Style « ${name} » créé` });
  return insertRow(config, { [TITLE_STYLE]: style.id });
};

/**
 * The "Styles" list of a title's drawer, then its "Apparence" block. Each row
 * is a style: its checkbox selects it for deletion, as in the other lists, its
 * radio button gives it to the title, its name is changed in place — "H1" and
 * "H2" excepted, which are neither renamed nor deleted. A style added takes
 * the title's current appearance, and the title takes it.
 * Without a style, the rows below set the title itself; with one, they set
 * the style — and with it every title that uses it.
 */
export function TitleStyleField({
  config,
  onChange,
  rows,
  after = [],
  defaultStyle,
  type,
}: {
  config: unknown;
  onChange: (config: Config) => void;
  /** The title's type: the base of a style created from it. */
  type?: string;
  /** The style when the title names none: with it, the title always has one. */
  defaultStyle?: string;
  /** The appearance rows, on a configuration: the title's or its style's. */
  rows: (config: unknown, onChange: (config: Config) => void) => SettingRow[];
  /** The rows that stay the title's own, style or not: its alignment. */
  after?: SettingRow[];
}) {
  const styles = useTitleStyles();
  const style = styleOf(config, defaultStyle);
  /** A style being added: its row waits for its name. */
  const [adding, setAdding] = useState(false);
  const selection = useRowSelection(styles.map((s) => s.id));
  const [deleting, setDeleting] = useState(false);
  // Bumped when a name is cleared: its field shows the stored name again.
  const [revision, setRevision] = useState(0);

  const choose = (id: string) => onChange(insertRow(config, { [TITLE_STYLE]: id }));

  // The rows read the style's configuration with its id: the title knows
  // from it whose usual values apply (its base). The id is not stored in it.
  const styleConfig = style ? { ...style.config, [TITLE_STYLE]: style.id } : {};
  const changeStyle = (next: Config) => {
    if (!style) return;
    const { [TITLE_STYLE]: _id, ...rest } = next;
    void save(styles.map((s) => (s.id === style.id ? { ...s, config: rest } : s)));
  };

  const rename = (target: TitleStyle, name: string) => {
    if (!name) return setRevision((r) => r + 1);
    if (name !== target.name) {
      void save(styles.map((s) => (s.id === target.id ? { ...s, name } : s)));
    }
  };

  const add = (name: string) => {
    setAdding(false);
    if (!name) return;
    createStyle(styles, config, name, defaultStyle, type)
      .then(onChange)
      .catch((e: unknown) => notifyError(errorMessage(e)));
  };

  const remove = () => {
    setDeleting(false);
    const removed = new Set(selection.checked);
    selection.reset();
    // The titles that used them keep their id, which no longer designates
    // anything: they go back to their default style — "H1". This one forgets
    // it.
    void save(styles.filter((s) => !removed.has(s.id)));
    if (style && removed.has(style.id)) onChange(insertRow(config, { [TITLE_STYLE]: "" }));
  };

  const removedNames = styles.filter((s) => selection.isChecked(s.id)).map((s) => `« ${s.name} »`);

  const total = styles.length + (adding ? 1 : 0);

  return (
    <Stack gap="xl">
      <Input.Wrapper label="Styles">
        <Stack gap={1}>
          {styles.map((s, rank) => (
            <Group key={s.id} gap="sm" wrap="nowrap" style={rowStyle(rank, total, false)}>
              {isBuiltInTitleStyle(s.id) ? (
                <RowCheckboxSpace />
              ) : (
                <RowCheckbox
                  label={`Sélectionner le style ${s.name}`}
                  checked={selection.isChecked(s.id)}
                  onChange={(on) => selection.toggle(s.id, on)}
                />
              )}
              <RowRadio
                label={`Appliquer le style ${s.name}`}
                checked={s.id === style?.id}
                onChange={() => choose(s.id)}
              />
              <RowField
                key={`${s.name}-${revision}`}
                name={s.name}
                onValidate={(name) => rename(s, name)}
                placeholder="Nom"
                label={`Nom du style ${s.name}`}
                readOnly={isBuiltInTitleStyle(s.id)}
              />
            </Group>
          ))}
          {adding && (
            <Group gap="sm" wrap="nowrap" style={rowStyle(total - 1, total, false)}>
              <RowCheckboxSpace />
              <RowCheckboxSpace />
              <RowField
                name=""
                onValidate={add}
                placeholder="Nom"
                label="Nom du nouveau style"
                autoFocus
              />
            </Group>
          )}
        </Stack>
        <ListFooter
          addLabel="Ajouter un style"
          onAdd={() => setAdding(true)}
          checkedCount={selection.checked.length}
          onDeleteChecked={() => setDeleting(true)}
        />
      </Input.Wrapper>

      <SettingRows
        label={style ? style.name : "Apparence"}
        rows={[...(style ? rows(styleConfig, changeStyle) : rows(config, onChange)), ...after]}
      />

      <DeleteConfirmModal
        opened={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={remove}
        title={removedNames.length > 1 ? "Supprimer les styles" : "Supprimer le style"}
        message={
          <>
            Voulez-vous vraiment supprimer{" "}
            {removedNames.length > 1 ? "les styles" : "le style"} {removedNames.join(", ")} ?
            Les titres qui {removedNames.length > 1 ? "les utilisent" : "l'utilisent"} passeront
            en « H1 ».
          </>
        }
      />
    </Stack>
  );
}

/**
 * The "Style" submenu of a title's right click: the styles, the current one
 * checked. They are created in the drawer.
 */
export function TitleStyleMenu({
  config,
  onChoose,
  defaultStyle,
}: {
  config: unknown;
  /** The style when the title names none: "Aucun" is then not offered. */
  defaultStyle?: string;
  /** The chosen style's id, or "" for none. */
  onChoose: (id: string) => void;
}) {
  const styles = useTitleStyles();
  const current = styleOf(config, defaultStyle)?.id ?? "";
  const check = (id: string) =>
    id === current ? <IconCheck size={16} /> : <span style={{ width: 16 }} />;
  return (
    <Menu.Sub>
      <Menu.Sub.Target>
        <Menu.Sub.Item leftSection={<IconPalette size={16} />}>Style</Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown>
        {!defaultStyle && (
          <Menu.Item leftSection={check("")} onClick={() => onChoose("")}>
            Aucun
          </Menu.Item>
        )}
        {styles.map((s) => (
          <Menu.Item key={s.id} leftSection={check(s.id)} onClick={() => onChoose(s.id)}>
            {s.name}
          </Menu.Item>
        ))}
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  );
}
