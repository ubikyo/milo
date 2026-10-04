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
import defilement from "../../assets/styles/ListeScroll.module.css";
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
} from "../ui/LignesDuTiroir";
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

/** Le fond de l'icône d'une ligne : un gris neutre, plus foncé que la ligne. */
const AVATAR_BACKGROUND = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

/** L'air ajouté en haut et en bas d'une ligne : 10 px de hauteur en plus. */
const EXTRA_PADDING = 5;

/**
 * La hauteur d'une ligne : celle d'un utilisateur, son nom (« sm ») sur son
 * adresse (« xs »), avec l'air de la ligne en haut et en bas.
 */
const ROW_HEIGHT = `calc(${2 * (ROW_INSET + EXTRA_PADDING)}px + (var(--mantine-font-size-sm) + var(--mantine-font-size-xs)) * var(--mantine-line-height))`;

const key = (p: EntraPrincipal) => `${p.type}:${p.id}`;

interface PrincipalsPermissionsProps<T> {
  load: () => Promise<PrincipalPermissions<T>[]>;
  /** Enregistre les permissions d'un principal ; rend la liste à jour. */
  save: (
    principal: EntraPrincipal,
    permissions: T,
  ) => Promise<PrincipalPermissions<T>[]>;
  /** Lui retire tout ; rend la liste à jour. */
  remove: (principal: EntraPrincipal) => Promise<PrincipalPermissions<T>[]>;
  /** Celles de qui arrive de l'annuaire : aucune. */
  empty: () => T;
  /** Ce qu'il a, d'un coup d'œil, au bout de sa ligne. */
  summary: (permissions: T) => string;
  /**
   * La fenêtre des permissions (PrincipalPermissionsModal). Sans elle, les
   * permissions se règlent sur la ligne (enLigne) : ni fenêtre, ni
   * « Permissions » au clic droit.
   */
  sections?: (
    permissions: T,
    change: (permissions: T) => void,
  ) => SectionPermissions[];
  /**
   * Des permissions peu nombreuses, réglées à même la ligne plutôt que dans
   * la fenêtre : celles de l'administration — Workspaces, Paramétrage. La
   * ligne d'ajout les porte aussi, à droite de la recherche : on choisit qui,
   * puis ce qu'il a, en une fois.
   */
  /**
   * Avec « enLigne » : des permissions qui peuvent être nombreuses — un type
   * de widget chacune —, en colonnes sous un en-tête qui les nomme, plutôt
   * que nommées dans chaque choix. Au-delà de la largeur, la liste défile de
   * côté.
   */
  inColumns?: boolean;
  inline?: (
    permissions: T,
    change: (permissions: T) => void,
  ) => PermissionRow[];
  emptyText: string;
  /** Le geste qui lui retire tout, et sa confirmation. */
  removeDialog: { label: string; message: (name: string) => ReactNode };
  /**
   * Après un enregistrement ou un retrait : ses propres droits ont pu changer
   * — un workspace de plus dans son sélecteur, par exemple.
   */
  onChange?: () => void;
}

/** La largeur d'un choix de permission sur la ligne : de quoi lire « Modifier ». */
const CHOICE_WIDTH = 130;

/**
 * En colonnes : la largeur d'une colonne — de quoi lire « Support » en
 * en-tête —, et l'écart entre deux.
 */
const COLUMN_WIDTH = 52;
const COLUMNS_GAP = 4;
/** L'écart des éléments d'une ligne (« sm »), que l'en-tête reprend. */
const GAP = 12;

/** Le fond d'une permission en lecture : le gris neutre des boutons de ligne. */
const READ_BACKGROUND = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

/** L'icône d'un niveau : rien, lire, modifier ; à défaut, son initiale. */
const LEVEL_ICONS: Record<string, typeof IconMinus> = {
  "": IconMinus,
  view: IconEye,
  update: IconPencil,
};

/**
 * Le niveau d'une permission, en colonne : un petit bouton qui passe au
 * suivant à chaque clic — Aucun, Lire, Modifier, puis Aucun. Rien : un tiret
 * estompé ; lire : un œil sur le gris neutre ; modifier : un crayon sur le
 * vert de l'application. L'infobulle dit lequel.
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
  // Un oui se coche ; les niveaux d'un type de widget ont leur icône.
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

/** Les niveaux d'une ligne en colonnes, chacun centré sous son en-tête. */
function LevelsInColumns({ rows }: { rows: PermissionRow[] }) {
  return (
    <Group gap={COLUMNS_GAP} wrap="nowrap" style={{ flexShrink: 0 }}>
      {rows.map((l) => (
        <Box
          key={l.name}
          w={l.largeur ?? COLUMN_WIDTH}
          style={{ display: "flex", justifyContent: "center" }}
        >
          <LevelButton {...l} />
        </Box>
      ))}
    </Group>
  );
}

// « Aucun » ne peut pas être la valeur vide d'un Select : il lui faut la sienne.
const NONE = "aucun";

/**
 * Les permissions réglées à même la ligne (enLigne) : un choix chacune, son
 * nom en invite — « Workspaces », « Paramétrage » —, au bout de la ligne.
 */
function InlineChoice({
  rows,
  inColumns,
}: {
  rows: PermissionRow[];
  /** En colonnes : le nom est dans l'en-tête, pas dans le choix. */
  inColumns?: boolean;
}) {
  const [entered, setEntered] = useState<string | null>(null);
  if (inColumns) return <LevelsInColumns rows={rows} />;
  return (
    <>
      {rows.map(({ name, options, value, onChange, disabled, largeur }) => (
        <Select
          key={name}
          aria-label={name}
          // Son nom devant la valeur : « Workspaces : Modifier ».
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
          w={largeur ?? CHOICE_WIDTH + name.length * 6.5}
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
 * Des utilisateurs et des groupes Entra et leurs permissions : les accès
 * d'un workspace (WorkspaceAccess), l'administration de l'application
 * (AdministrationTab). Ils se présentent comme les listes des tiroirs
 * (ChampsColonnes) : une ligne chacun, son nom, son adresse s'il en a une, et au bout le
 * bouton qui résume ses permissions et ouvre leur fenêtre. Le clic droit les
 * ouvre aussi, ou lui retire tout ; « Ajouter » pose une ligne qui cherche
 * dans l'annuaire, et choisir ouvre aussitôt la fenêtre des permissions.
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
  // Celui dont la fenêtre des permissions est ouverte : un principal de la
  // liste, ou celui qu'on vient de choisir dans l'annuaire.
  const [permissionsOf, setPermissionsOf] = useState<EntraPrincipal | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<EntraPrincipal | null>(
    null,
  );
  // La ligne ajoutée, où l'on cherche dans l'annuaire — et, réglées à même
  // la ligne, les permissions qu'on lui donne.
  const [adding, setAdding] = useState(false);
  const [newValue, setNewEntry] = useState<EntraPrincipal | null>(null);
  const [newItems, setNewValues] = useState<T>(empty);
  const addRow = useRef<HTMLDivElement | null>(null);

  // La ligne dont on change l'utilisateur ou le groupe, d'un clic sur son nom.
  const [toReplace, setToReplace] = useState<string | null>(null);

  /**
   * Un autre à la place : il reçoit les mêmes permissions, puis l'ancien
   * perd les siennes. S'il avait déjà une ligne, ses permissions sont
   * remplacées par celles-ci.
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

  /** Enregistre aussitôt des permissions réglées sur la ligne. */
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
   * La ligne d'ajout part dès qu'elle a qui et au moins une permission :
   * l'ordre importe peu, la recherche d'abord ou les permissions.
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
  // Qui arrive de l'annuaire n'en a pas encore : aucune.
  const initials = current?.permissions ?? empty();

  const total = access.length + (adding ? 1 : 0);
  // Le nom d'une ligne prend ce que lui laissent les permissions, au bout.
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
              scrollbar: defilement.scrollbar,
              thumb: defilement.thumb,
            }}
          >
            {inColumns && inline && (
              // L'en-tête des colonnes : le nom de chaque permission, au-dessus
              // de ses choix.
              <Group
                gap={GAP}
                wrap="nowrap"
                pb={4}
                style={{
                  paddingLeft: NAME_INSET,
                  paddingRight: ROW_INSET,
                }}
              >
                {/* La place de l'icône et du nom : les colonnes se calent au
                    bout, comme les niveaux des lignes. */}
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
                      w={l.largeur ?? COLUMN_WIDTH}
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
                    // Sur deux lignes, nom et adresse : un peu plus d'air.
                    paddingBlock: ROW_INSET + EXTRA_PADDING,
                    // Un groupe, sans adresse, garde la hauteur d'un
                    // utilisateur : toutes les lignes se valent.
                    minHeight: ROW_HEIGHT,
                  }}
                >
                  {/* Un gris neutre derrière l'icône : ceux de Mantine tirent sur
                    le bleu. */}
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
                    // Un autre de l'annuaire à sa place, avec ses permissions.
                    // Quittée sans choix, la recherche rend la ligne telle quelle.
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
                      {/* L'adresse d'un utilisateur sous son nom ; un groupe n'a que
                      le sien — son icône dit ce qu'il est. */}
                      {principal.type !== "group" && principal.email && (
                        <Text size="xs" c="dimmed" truncate>
                          {principal.email}
                        </Text>
                      )}
                    </UnstyledButton>
                  )}

                  {inline ? (
                    // Ses permissions à même la ligne : elles partent au choix.
                    <InlineChoice
                      inColumns={inColumns}
                      rows={inline(
                        permissions,
                        (p) => void handleSave(principal, p),
                      )}
                    />
                  ) : (
                    // Ce qu'il a, d'un coup d'œil, et sa fenêtre au clic.
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
                  // Quittée sans rien choisir, la ligne s'efface. Aller de la
                  // recherche aux permissions ne la quitte pas.
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
                    // Avec des permissions en ligne, le choix reste dans le champ
                    // le temps de les régler à droite. Sinon, choisir ouvre la
                    // fenêtre des permissions : il n'entre dans la liste qu'une
                    // fois enregistré.
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
        {/* Au plus près de la liste qu'il allonge. */}
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
