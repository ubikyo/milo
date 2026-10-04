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
  ARRONDI,
  BoutonDeLigne,
  ListeVide,
  RETRAIT_LIGNE,
  RETRAIT_NOM,
  STYLE_SAISIE,
  styleChampNom,
  styleLigne,
} from "../ui/LignesDuTiroir";
import PointMenu, {
  positionDuMenu,
  type PointMenuPosition,
} from "../ui/PointMenu";
import { RED } from "../../themes/colors";
import DirectoryPicker from "./DirectoryPicker";
import PrincipalPermissionsModal from "./PrincipalPermissionsModal";
import type {
  LignePermission,
  SectionPermissions,
} from "./PrincipalPermissionsModal";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { GREEN } from "../../themes/colors";
import type { EntraPrincipal, PrincipalPermissions } from "@milo/shared";

/** Le fond de l'icône d'une ligne : un gris neutre, plus foncé que la ligne. */
const FOND_AVATAR = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

/** L'air ajouté en haut et en bas d'une ligne : 10 px de hauteur en plus. */
const AIR_EN_PLUS = 5;

/**
 * La hauteur d'une ligne : celle d'un utilisateur, son nom (« sm ») sur son
 * adresse (« xs »), avec l'air de la ligne en haut et en bas.
 */
const HAUTEUR_LIGNE = `calc(${2 * (RETRAIT_LIGNE + AIR_EN_PLUS)}px + (var(--mantine-font-size-sm) + var(--mantine-font-size-xs)) * var(--mantine-line-height))`;

const cle = (p: EntraPrincipal) => `${p.type}:${p.id}`;

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
  vide: () => T;
  /** Ce qu'il a, d'un coup d'œil, au bout de sa ligne. */
  resume: (permissions: T) => string;
  /**
   * La fenêtre des permissions (PrincipalPermissionsModal). Sans elle, les
   * permissions se règlent sur la ligne (enLigne) : ni fenêtre, ni
   * « Permissions » au clic droit.
   */
  sections?: (
    permissions: T,
    changer: (permissions: T) => void,
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
  enColonnes?: boolean;
  enLigne?: (
    permissions: T,
    changer: (permissions: T) => void,
  ) => LignePermission[];
  emptyText: string;
  /** Le geste qui lui retire tout, et sa confirmation. */
  retirer: { label: string; message: (nom: string) => ReactNode };
  /**
   * Après un enregistrement ou un retrait : ses propres droits ont pu changer
   * — un workspace de plus dans son sélecteur, par exemple.
   */
  onChange?: () => void;
}

/** La largeur d'un choix de permission sur la ligne : de quoi lire « Modifier ». */
const LARGEUR_CHOIX = 130;

/**
 * En colonnes : la largeur d'une colonne — de quoi lire « Support » en
 * en-tête —, et l'écart entre deux.
 */
const LARGEUR_COLONNE = 52;
const ECART_COLONNES = 4;
/** L'écart des éléments d'une ligne (« sm »), que l'en-tête reprend. */
const ECART = 12;

/** Le fond d'une permission en lecture : le gris neutre des boutons de ligne. */
const FOND_LECTURE = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

/** L'icône d'un niveau : rien, lire, modifier ; à défaut, son initiale. */
const ICONES_NIVEAU: Record<string, typeof IconMinus> = {
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
function BoutonNiveau({
  nom,
  options,
  valeur,
  onChange,
  disabled,
}: LignePermission) {
  const rang = Math.max(
    0,
    options.findIndex((o) => o.value === valeur),
  );
  const actuel = options[rang];
  const suivant = options[(rang + 1) % options.length];
  // Un oui se coche ; les niveaux d'un type de widget ont leur icône.
  const Icone = actuel?.label === "Oui" ? IconCheck : ICONES_NIVEAU[valeur];
  const fond =
    valeur === "update" ? GREEN : valeur ? FOND_LECTURE : "transparent";
  const couleur =
    valeur === "update"
      ? "#ffffff"
      : valeur
        ? "var(--mantine-color-text)"
        : "var(--mantine-color-dimmed)";
  return (
    <Tooltip label={`${nom} : ${actuel?.label ?? ""}`} withinPortal>
      <ActionIcon
        variant="filled"
        radius={3}
        onClick={() => suivant && onChange(suivant.value)}
        disabled={disabled}
        aria-label={`${nom} : ${actuel?.label ?? ""}. Passer à ${suivant?.label ?? ""}`}
        style={{ backgroundColor: fond, color: couleur }}
      >
        {Icone ? (
          <Icone size={16} />
        ) : (
          <Text size="xs" fw={600}>
            {actuel?.label.charAt(0)}
          </Text>
        )}
      </ActionIcon>
    </Tooltip>
  );
}

/** Les niveaux d'une ligne en colonnes, chacun centré sous son en-tête. */
function NiveauxEnColonnes({ lignes }: { lignes: LignePermission[] }) {
  return (
    <Group gap={ECART_COLONNES} wrap="nowrap" style={{ flexShrink: 0 }}>
      {lignes.map((l) => (
        <Box
          key={l.nom}
          w={l.largeur ?? LARGEUR_COLONNE}
          style={{ display: "flex", justifyContent: "center" }}
        >
          <BoutonNiveau {...l} />
        </Box>
      ))}
    </Group>
  );
}

// « Aucun » ne peut pas être la valeur vide d'un Select : il lui faut la sienne.
const AUCUN = "aucun";

/**
 * Les permissions réglées à même la ligne (enLigne) : un choix chacune, son
 * nom en invite — « Workspaces », « Paramétrage » —, au bout de la ligne.
 */
function ChoixEnLigne({
  lignes,
  enColonnes,
}: {
  lignes: LignePermission[];
  /** En colonnes : le nom est dans l'en-tête, pas dans le choix. */
  enColonnes?: boolean;
}) {
  const [saisi, setSaisi] = useState<string | null>(null);
  if (enColonnes) return <NiveauxEnColonnes lignes={lignes} />;
  return (
    <>
      {lignes.map(({ nom, options, valeur, onChange, disabled, largeur }) => (
        <Select
          key={nom}
          aria-label={nom}
          // Son nom devant la valeur : « Workspaces : Modifier ».
          leftSection={
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              {nom}
            </Text>
          }
          leftSectionWidth={nom.length * 6.5 + 14}
          data={options.map((o) => ({
            value: o.value || AUCUN,
            label: o.label,
          }))}
          value={valeur || AUCUN}
          onChange={(v) => onChange(v === AUCUN || !v ? "" : v)}
          allowDeselect={false}
          disabled={disabled}
          size="xs"
          radius={ARRONDI}
          w={largeur ?? LARGEUR_CHOIX + nom.length * 6.5}
          style={{ flexShrink: 0 }}
          comboboxProps={{ withinPortal: true }}
          onFocus={() => setSaisi(nom)}
          onBlur={() => setSaisi(null)}
          styles={saisi === nom ? { input: STYLE_SAISIE } : undefined}
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
  vide,
  resume,
  sections,
  enLigne,
  enColonnes = false,
  emptyText,
  retirer,
  onChange,
}: PrincipalsPermissionsProps<T>) {
  const [acces, setAcces] = useState<PrincipalPermissions<T>[]>([]);
  // Celui dont la fenêtre des permissions est ouverte : un principal de la
  // liste, ou celui qu'on vient de choisir dans l'annuaire.
  const [permissionsDe, setPermissionsDe] = useState<EntraPrincipal | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<EntraPrincipal | null>(
    null,
  );
  // La ligne ajoutée, où l'on cherche dans l'annuaire — et, réglées à même
  // la ligne, les permissions qu'on lui donne.
  const [enAjout, setEnAjout] = useState(false);
  const [nouveau, setNouveau] = useState<EntraPrincipal | null>(null);
  const [nouvelles, setNouvelles] = useState<T>(vide);
  const ligneAjout = useRef<HTMLDivElement | null>(null);

  // La ligne dont on change l'utilisateur ou le groupe, d'un clic sur son nom.
  const [aRemplacer, setARemplacer] = useState<string | null>(null);

  /**
   * Un autre à la place : il reçoit les mêmes permissions, puis l'ancien
   * perd les siennes. S'il avait déjà une ligne, ses permissions sont
   * remplacées par celles-ci.
   */
  const remplacer = async (
    ancien: EntraPrincipal,
    nouveau: EntraPrincipal,
    permissions: T,
  ) => {
    try {
      await save(nouveau, permissions);
      setAcces(await remove(ancien));
      onChange?.();
    } catch (e) {
      notifierErreur(messageErreur(e));
      void reload();
    }
  };

  const fermerAjout = () => {
    setEnAjout(false);
    setNouveau(null);
    setNouvelles(vide());
  };

  /** Enregistre aussitôt des permissions réglées sur la ligne. */
  const enregistrer = async (principal: EntraPrincipal, permissions: T) => {
    try {
      setAcces(await save(principal, permissions));
      onChange?.();
      return true;
    } catch (e) {
      notifierErreur(messageErreur(e));
      return false;
    }
  };

  /**
   * La ligne d'ajout part dès qu'elle a qui et au moins une permission :
   * l'ordre importe peu, la recherche d'abord ou les permissions.
   */
  const tenterAjout = async (
    principal: EntraPrincipal | null,
    permissions: T,
  ) => {
    if (!principal || !enLigne) return;
    if (enLigne(permissions, () => {}).every((l) => !l.valeur)) return;
    if (await enregistrer(principal, permissions)) fermerAjout();
  };
  const [menu, setMenu] = useState<{
    principal: EntraPrincipal;
    position: PointMenuPosition;
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      setAcces(await load());
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  const actuel = permissionsDe
    ? acces.find((a) => cle(a.principal) === cle(permissionsDe))
    : undefined;
  // Qui arrive de l'annuaire n'en a pas encore : aucune.
  const initiales = actuel?.permissions ?? vide();

  const total = acces.length + (enAjout ? 1 : 0);
  // Le nom d'une ligne prend ce que lui laissent les permissions, au bout.
  const styleNom = { flex: 1, minWidth: 0 };

  return (
    <Stack gap="sm">
      <div>
        {total === 0 ? (
          <ListeVide icon={IconUsersGroup} message={emptyText} />
        ) : (
          <ScrollArea
            type="auto"
            scrollbars={enColonnes ? "x" : false}
            classNames={{
              scrollbar: defilement.scrollbar,
              thumb: defilement.thumb,
            }}
          >
            {enColonnes && enLigne && (
              // L'en-tête des colonnes : le nom de chaque permission, au-dessus
              // de ses choix.
              <Group
                gap={ECART}
                wrap="nowrap"
                pb={4}
                style={{
                  paddingLeft: RETRAIT_NOM,
                  paddingRight: RETRAIT_LIGNE,
                }}
              >
                {/* La place de l'icône et du nom : les colonnes se calent au
                    bout, comme les niveaux des lignes. */}
                <Box style={{ flex: 1 }} />
                <Group
                  gap={ECART_COLONNES}
                  wrap="nowrap"
                  style={{ flexShrink: 0 }}
                >
                  {enLigne(vide(), () => {}).map((l) => (
                    <Text
                      key={l.nom}
                      size="xs"
                      fw={500}
                      c="dimmed"
                      w={l.largeur ?? LARGEUR_COLONNE}
                      ta="center"
                      truncate
                    >
                      {l.nom}
                    </Text>
                  ))}
                </Group>
              </Group>
            )}
            <Stack gap={1}>
              {acces.map(({ principal, permissions }, rang) => (
                <Group
                  key={cle(principal)}
                  gap="sm"
                  wrap="nowrap"
                  onContextMenu={(e) =>
                    setMenu({ principal, position: positionDuMenu(e) })
                  }
                  style={{
                    ...styleLigne(rang, total, false),
                    paddingLeft: RETRAIT_NOM,
                    // Sur deux lignes, nom et adresse : un peu plus d'air.
                    paddingBlock: RETRAIT_LIGNE + AIR_EN_PLUS,
                    // Un groupe, sans adresse, garde la hauteur d'un
                    // utilisateur : toutes les lignes se valent.
                    minHeight: HAUTEUR_LIGNE,
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
                        backgroundColor: FOND_AVATAR,
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
                  {aRemplacer === cle(principal) ? (
                    // Un autre de l'annuaire à sa place, avec ses permissions.
                    // Quittée sans choix, la recherche rend la ligne telle quelle.
                    <DirectoryPicker
                      aria-label={`Remplacer ${principal.name}`}
                      placeholder="Chercher un utilisateur ou un groupe Entra"
                      value={principal}
                      onChange={(autre) => {
                        setARemplacer(null);
                        if (autre && cle(autre) !== cle(principal)) {
                          void remplacer(principal, autre, permissions);
                        }
                      }}
                      onBlur={() => setARemplacer(null)}
                      autoFocus
                      size="sm"
                      radius={ARRONDI}
                      style={styleNom}
                      styles={{ input: styleChampNom(true) }}
                      comboboxProps={{ withinPortal: true }}
                    />
                  ) : (
                    <UnstyledButton
                      onClick={() => setARemplacer(cle(principal))}
                      title="Changer d'utilisateur ou de groupe"
                      style={styleNom}
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

                  {enLigne ? (
                    // Ses permissions à même la ligne : elles partent au choix.
                    <ChoixEnLigne
                      enColonnes={enColonnes}
                      lignes={enLigne(
                        permissions,
                        (p) => void enregistrer(principal, p),
                      )}
                    />
                  ) : (
                    // Ce qu'il a, d'un coup d'œil, et sa fenêtre au clic.
                    <BoutonDeLigne
                      icon={IconShieldLock}
                      onClick={() => setPermissionsDe(principal)}
                    >
                      {resume(permissions)}
                    </BoutonDeLigne>
                  )}
                </Group>
              ))}
              {enAjout && (
                <Group
                  ref={ligneAjout}
                  gap="sm"
                  wrap="nowrap"
                  // Quittée sans rien choisir, la ligne s'efface. Aller de la
                  // recherche aux permissions ne la quitte pas.
                  onBlur={(e) => {
                    if (
                      ligneAjout.current?.contains(
                        e.relatedTarget as Node | null,
                      )
                    )
                      return;
                    if (enLigne && nouveau) return;
                    fermerAjout();
                  }}
                  style={{
                    ...styleLigne(total - 1, total, false),
                    paddingLeft: RETRAIT_LIGNE,
                  }}
                >
                  <DirectoryPicker
                    aria-label="Ajouter un utilisateur ou un groupe"
                    placeholder="Chercher un utilisateur ou un groupe Entra"
                    value={enLigne ? nouveau : null}
                    resetOnSelect={!enLigne}
                    // Avec des permissions en ligne, le choix reste dans le champ
                    // le temps de les régler à droite. Sinon, choisir ouvre la
                    // fenêtre des permissions : il n'entre dans la liste qu'une
                    // fois enregistré.
                    onChange={(principal) => {
                      if (enLigne) {
                        setNouveau(principal);
                        void tenterAjout(principal, nouvelles);
                        return;
                      }
                      if (!principal) return;
                      fermerAjout();
                      setPermissionsDe(principal);
                    }}
                    autoFocus
                    size="sm"
                    radius={ARRONDI}
                    style={{ flex: 1, minWidth: 0 }}
                    styles={{ input: styleChampNom(true) }}
                    comboboxProps={{ withinPortal: true }}
                  />
                  {enLigne && (
                    <ChoixEnLigne
                      enColonnes={enColonnes}
                      lignes={enLigne(nouvelles, (p) => {
                        setNouvelles(p);
                        void tenterAjout(nouveau, p);
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
          onClick={() => setEnAjout(true)}
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
                  setPermissionsDe(menu.principal);
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
            {retirer.label}
          </Menu.Item>
        </PointMenu>
      )}

      {sections && (
        <PrincipalPermissionsModal
          principal={permissionsDe}
          initial={initiales}
          sections={sections}
          onSave={async (permissions) => {
            if (!permissionsDe) return;
            setAcces(await save(permissionsDe, permissions));
            onChange?.();
          }}
          onClose={() => setPermissionsDe(null)}
        />
      )}

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            try {
              setAcces(await remove(pendingDelete));
              onChange?.();
            } catch (e) {
              notifierErreur(messageErreur(e));
            }
          }
          setPendingDelete(null);
        }}
        title={retirer.label}
        message={retirer.message(pendingDelete?.name ?? "")}
      />
    </Stack>
  );
}
