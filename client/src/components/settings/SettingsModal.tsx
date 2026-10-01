import {
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBuilding,
  IconCode,
  IconDatabaseExport,
  IconDeviceLaptop,
  IconBrandWindows,
  IconHeadset,
  IconShieldLock,
  IconUsers,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EntraSettings } from "@milo/shared";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import { tabStyle } from "../../themes/tabs";
import BackupTab from "./BackupTab";
import LookupManager from "../ui/LookupManager";
import EntraTab from "./EntraTab";
import AccessTab from "./AccessTab";
import RolesTab from "./RolesTab";
import CompanySupportModal from "./CompanySupportModal";
import DeveloperTab from "./DeveloperTab";
import SupportTab from "./SupportTab";
import AssetsTab from "./AssetsTab";
import type { Company } from "@milo/shared";
import type { ComponentType, ReactNode } from "react";
import BoutonFermer from "../ui/BoutonFermer";

const TABS: {
  value: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}[] = [
  { value: "companies", label: "Sociétés", icon: IconBuilding },
  { value: "access", label: "Accès", icon: IconUsers },
  { value: "roles", label: "Rôles", icon: IconShieldLock },
  { value: "entra", label: "Entra", icon: IconBrandWindows },
  { value: "developer", label: "Développeur", icon: IconCode },
  // Les réglages propres à un mode : le Support, les Assets.
  { value: "support", label: "Support", icon: IconHeadset },
  { value: "assets", label: "Assets", icon: IconDeviceLaptop },
  // La sauvegarde tout en bas : elle porte toute la base, pas un réglage.
  { value: "backup", label: "Sauvegarde", icon: IconDatabaseExport },
];

/**
 * Les onglets qui supposent Entra : les accès se donnent à des utilisateurs
 * et des groupes de l'annuaire, et sociétés et rôles n'ont
 * de sens qu'une fois quelqu'un d'autre que le compte « admin » connecté.
 */
const AVEC_ENTRA = new Set(["companies", "access", "roles"]);

/** Les onglets que le compte « admin » ne voit pas. */
const SANS_ADMIN = new Set(["developer", "support", "assets"]);

/** Entra est configuré : l'application renseignée (identifiant, annuaire, secret). */
const entraConfiguree = (r: EntraSettings) =>
  Boolean(r.client_id && r.tenant && r.has_secret);

const MODAL_HEADER = modalHeaderStyles(40);

// Le gris d'une étiquette non renseignée : plus pâle que le « light » de
// Mantine, qui se lisait presque comme une étiquette active. Le fond est
// transparent : un gris plein se confondait avec la ligne survolée (gray-1)
// ou avec le fond de la liste en thème sombre (dark-6).
const TAG_GRISE = {
  backgroundColor:
    "light-dark(color-mix(in srgb, var(--mantine-color-gray-6), transparent 88%), color-mix(in srgb, var(--mantine-color-dark-2), transparent 85%))",
  color: "light-dark(var(--mantine-color-gray-5), var(--mantine-color-dark-2))",
};

/**
 * Une étiquette de la liste des sociétés : même allure que celles des boîtes
 * (EntraTab). Grisée quand ce qu'elle nomme n'est pas renseigné.
 */
const tag = (libelle: string, couleur: "green" | "red" | null) => (
  <Badge
    color={couleur ?? "gray"}
    variant={couleur ? "filled" : "light"}
    size="sm"
    radius="sm"
    tt="none"
    fw={600}
    style={{ flexShrink: 0, ...(couleur ? {} : TAG_GRISE) }}
  >
    {libelle}
  </Badge>
);

/**
 * La barre de défilement d'un panneau, déportée sur la bordure droite de la
 * fenêtre et sur toute sa hauteur. Même principe que la liste des projets
 * (ProjectsPage), à ceci près qu'elle se cale sur la fenêtre et non sur
 * l'écran : c'est « content » qui porte le repère (position: relative).
 *
 * Laissée à sa place, elle serait à cheval sur le retrait de 40 px du panneau
 * et sauterait d'un onglet à l'autre selon ce que chacun contient. Le panneau
 * garde donc toute sa largeur — la barre est hors du flux — et le contenu ne
 * se décale pas quand elle apparaît.
 */
const SCROLLBAR_STYLES = {
  root: { position: "static" as const },
  scrollbar: {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    right: 0,
    left: "auto",
    height: "auto",
    width: "var(--scrollarea-scrollbar-size)",
  },
};

interface SettingsModalProps {
  opened: boolean;
  onClose: () => void;
  companies: Company[];
  /**
   * Le compte « admin » ne voit que le Paramétrage : la fenêtre ne se ferme
   * pas, son bouton déconnecte, et l'enregistrement la laisse ouverte.
   */
  standalone?: boolean;
  /**
   * Le droit « Modifier » du Paramétrage. Sans lui, la fenêtre se consulte :
   * pas d'enregistrement, pas de sauvegarde — l'archive porte toute la base.
   */
  canEdit: boolean;
  onDataChanged: () => void | Promise<void>;
  /** Debug (onglet Développeur) : la sélection et le menu du navigateur reviennent. */
  debug: boolean;
  onDebugChange: (debug: boolean) => void;
}

export default function SettingsModal({
  opened,
  onClose,
  companies,
  standalone = false,
  canEdit,
  onDataChanged,
  debug,
  onDebugChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<string | null>("companies");
  // Tant qu'Entra n'est pas configuré, seuls ses réglages et la sauvegarde
  // se montrent. L'onglet Entra en informe la fenêtre à chaque lecture et à
  // chaque enregistrement ; « null » tant qu'il n'a rien dit.
  const [entraPret, setEntraPret] = useState<boolean | null>(null);
  // Le Support et les Assets touchent au travail des modes, et l'onglet
  // Développeur à celui des personnes : pas au paramétrage de l'application.
  // Le compte « admin » ne les voit pas (SANS_ADMIN).
  const visible = (onglet: string) =>
    !(standalone && SANS_ADMIN.has(onglet)) &&
    !(!canEdit && onglet === "backup") &&
    (entraPret === true || !AVEC_ENTRA.has(onglet));

  // Stable : l'onglet Entra s'en sert dans sa lecture des réglages.
  const suivreEntra = useCallback((reglages: EntraSettings) => {
    const pret = entraConfiguree(reglages);
    setEntraPret(pret);
    // L'onglet ouvert vient de disparaître : on passe sur Entra.
    if (!pret) setActiveTab((t) => (t && AVEC_ENTRA.has(t) ? "entra" : t));
  }, []);
  // La société dont la fenêtre du support est ouverte.
  const [supportDe, setSupportDe] = useState<number | null>(null);

  /**
   * L'accès de Milo à la boîte de support de chaque société, par Entra :
   * vrai si Microsoft laisse lire un message. Vérifié à l'ouverture et à
   * chaque changement d'adresse ; « null » tant que la réponse n'est pas là.
   */
  const [boites, setBoites] = useState<Map<number, boolean> | null>(null);
  const adresses = companies.map((c) => `${c.id}:${c.support_email}`).join();
  useEffect(() => {
    if (!opened || entraPret !== true) return undefined;
    let annule = false;
    api
      .checkMailboxes()
      .then((r) => {
        if (!annule) setBoites(new Map(r.map((b) => [b.company_id, b.ok])));
      })
      // La vérification elle-même a échoué : aucune boîte n'est accessible.
      .catch(() => !annule && setBoites(new Map()));
    return () => {
      annule = true;
    };
  }, [opened, entraPret, adresses]);

  /**
   * Seul l'onglet Entra a des réglages en attente : les autres onglets
   * enregistrent chaque geste. « Enregistrer » appelle la fonction que
   * l'onglet dépose ici ; « Fermer » n'enregistre rien.
   */
  const enregistrerEntra = useRef<(() => Promise<boolean>) | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  // Enregistre puis referme ; un refus du serveur garde la fenêtre ouverte,
  // avec son message dans l'onglet concerné.
  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      if ((await enregistrerEntra.current?.()) === false) {
        setActiveTab("entra");
        return;
      }
    } finally {
      setEnregistrement(false);
    }
    if (!standalone) onClose();
  };

  /** Un appel à l'API, suivi du rechargement de ce que l'application affiche. */
  const withRefresh =
    <Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) =>
    async (...args: Args) => {
      await fn(...args);
      await onDataChanged();
    };

  // L'entête du panneau Entra porte son menu « Actions », à droite du
  // titre : l'onglet l'y rend par un portail.
  const [actionsEntra, setActionsEntra] = useState<HTMLDivElement | null>(null);

  const panel = (
    value: string,
    children: ReactNode,
    actionsRef?: (el: HTMLDivElement | null) => void,
  ) =>
    visible(value) && (
      <Tabs.Panel
        value={value}
        pl="xl"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Title order={4}>
              {TABS.find((t) => t.value === value)?.label}
            </Title>
            {/* Sans hauteur, le menu centré sur la ligne : plus haut que le
              titre, il agrandirait l'entête et décalerait le panneau par
              rapport aux autres onglets. */}
            {actionsRef && (
              <div
                ref={actionsRef}
                style={{ height: 0, display: "flex", alignItems: "center" }}
              />
            )}
          </Group>
          {/* « auto » : la barre ne paraît que si l'onglet déborde. */}
          <ScrollArea
            type="auto"
            scrollbarSize={2}
            styles={SCROLLBAR_STYLES}
            style={{ flex: 1, minHeight: 0 }}
          >
            {children}
          </ScrollArea>
        </Stack>
      </Tabs.Panel>
    );

  return (
    <Modal
      opened={opened}
      // Échap et l'arrière-plan passent par là : comme « Fermer », sans
      // enregistrer. Pour le compte « admin », la fenêtre est tout l'écran :
      // elle ne se ferme que par la déconnexion.
      onClose={onClose}
      closeOnEscape={!standalone}
      closeOnClickOutside={!standalone}
      title="Paramétrage"
      size={950}
      padding={40}
      withCloseButton={false}
      styles={{
        ...MODAL_HEADER,
        content: {
          height: 725,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          // Repère pour la barre de défilement déportée (voir ListItems)
          position: "relative",
        },
        // Le retrait haut de l'entête commun, plus la mise en page du corps.
        body: {
          ...MODAL_HEADER.body,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        orientation="vertical"
        // Les onglets masqués restent montés et actifs : en mode « activity »
        // (celui par défaut), leurs effets s'arrêtent, et la messagerie ne
        // pourrait plus déposer sa fonction d'enregistrement.
        keepMountedMode="display-none"
        style={{ flex: 1, minHeight: 0 }}
      >
        <Tabs.List style={{ width: 170, flexShrink: 0 }}>
          {TABS.filter((t) => visible(t.value)).map(
            ({ value, label, icon: Icon }) => (
              <Tabs.Tab
                key={value}
                value={value}
                leftSection={<Icon size={16} />}
                style={tabStyle(activeTab === value)}
              >
                {label}
              </Tabs.Tab>
            ),
          )}
        </Tabs.List>

        {panel(
          "companies",
          <LookupManager
            items={companies}
            onCreate={withRefresh(api.createCompany)}
            onUpdate={withRefresh(api.updateCompany)}
            onDelete={withRefresh(api.deleteCompany)}
            addTitle="Nouvelle société"
            maxRows={10}
            emptyIcon={IconBuilding}
            emptyText="Aucune société pour le moment"
            entityLabel="la société"
            renderTags={(item) => {
              const societe = companies.find((c) => c.id === item.id);
              if (!societe) return null;
              return (
                <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                  {tag("Portail", societe.support_url ? "green" : null)}
                  {/* Grisée aussi tant que la vérification n'a pas répondu. */}
                  {tag(
                    "Email",
                    !societe.support_email || !boites
                      ? null
                      : boites.get(societe.id)
                        ? "green"
                        : "red",
                  )}
                </Group>
              );
            }}
            renderActions={(item) => [
              {
                label: "Support",
                icon: IconHeadset,
                onClick: () => setSupportDe(item.id),
              },
            ]}
          />,
        )}

        {panel("access", <AccessTab companies={companies} />)}

        {panel("roles", <RolesTab />)}

        {panel("support", <SupportTab canEdit={canEdit} />)}

        {panel("assets", <AssetsTab />)}

        {panel(
          "entra",
          <EntraTab
            saveRef={enregistrerEntra}
            actionsTarget={actionsEntra}
            onSettings={suivreEntra}
            companies={companies}
          />,
          setActionsEntra,
        )}

        {panel("backup", <BackupTab />)}

        {panel(
          "developer",
          <DeveloperTab debug={debug} onDebugChange={onDebugChange} canEdit={canEdit} />,
        )}
      </Tabs>

      <Group justify="flex-end" mt={40}>
        {!canEdit && (
          <Text size="sm" c="dimmed" mr="auto">
            Consultation seule : votre rôle ne permet pas de modifier le
            Paramétrage.
          </Text>
        )}
        <BoutonFermer onClick={onClose}>
          {standalone ? "Déconnexion" : "Fermer"}
        </BoutonFermer>
        {canEdit && (
          <Button color="teal" onClick={enregistrer} loading={enregistrement}>
            Enregistrer
          </Button>
        )}
      </Group>

      <CompanySupportModal
        company={companies.find((c) => c.id === supportDe) ?? null}
        onClose={() => setSupportDe(null)}
        onSave={withRefresh(
          async (data: Pick<Company, "support_email" | "support_url">) => {
            if (supportDe !== null) await api.updateCompany(supportDe, data);
          },
        )}
      />
    </Modal>
  );
}
