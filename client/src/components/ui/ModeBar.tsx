import { Box, Tabs } from "@mantine/core";
import type { ReactNode } from "react";
import AccountControls from "./AccountControls";
import type { AccountSlot } from "./AccountControls";
import Logo from "./Logo";
import logoClasses from "../../assets/styles/Logo.module.css";
import SearchBox from "./SearchBox";
import { TAB_ROW_HEIGHT } from "../../themes/tabs";

// La première ligne de l'écran, dans tous les modes : le logo, les onglets du
// mode, puis la société et le compte.
//
// Il y avait un entête au-dessus, sur toute la largeur. Il n'apportait qu'un
// logo et deux réglages, pour 73 pixels : ceux-ci ont rejoint la rangée
// d'onglets, qui existait déjà, et la page entière remonte d'autant.
//
// Tout tient dans la liste d'onglets de Mantine, et non à côté : le filet qui
// la ferme court ainsi d'un bord à l'autre, sous le logo comme sous le compte,
// et rien ne se décale verticalement d'un mode à l'autre.
interface ModeBarProps {
  /** L'onglet ouvert. Un mode sans onglets n'en a pas. */
  value?: string | null;
  onChange?: (value: string | null) => void;
  /** Les onglets du mode. */
  children?: ReactNode;
  /** Le menu propre au mode — « Actions » —, posé entre la société et le compte. */
  actions?: ReactNode;
  /** De quoi monter le bout de rangée : la société, le menu du mode, le compte. */
  account: AccountSlot;
}

// Le logo se loge dans la hauteur de la rangée, sans la pousser, et respire
// un peu du bord gauche : les onglets, eux, portent déjà leur propre retrait.
const LOGO_HEIGHT = 26;
const LOGO_PADDING_LEFT = 20;

export default function ModeBar({
  value,
  onChange,
  children,
  actions,
  account,
}: ModeBarProps) {
  return (
    // Les onglets restent sur une seule ligne, quelle que soit la largeur de la
    // fenêtre : c'est la recherche qui cède la place, pas la rangée qui se
    // replie. Chaque onglet garde son nom entier, sur une ligne.
    <Tabs
      value={value}
      onChange={onChange}
      mb={50}
      styles={{
        list: { flexWrap: "nowrap" },
        tab: { flexShrink: 0, whiteSpace: "nowrap" },
      }}
    >
      {/* La hauteur est celle de tous les modes : ailleurs c'est le bouton
          « Actions » qui la donne, ici elle est dite une fois pour toutes. */}
      <Tabs.List mih={TAB_ROW_HEIGHT}>
        {/* RESPONSIVE — le logo est le premier à pouvoir céder sa place sur
            un écran étroit : il n'apporte rien que la page ne dise déjà. */}
        <Box
          pl={LOGO_PADDING_LEFT}
          pr="md"
          className={logoClasses.brand}
          style={{ alignSelf: "center", display: "flex", flexShrink: 0 }}
        >
          <Logo variant={2} h={LOGO_HEIGHT} />
          {/* Le numéro de version, sous le logo, pour qui s'y attarde. */}
          <span className={logoClasses.version}>{__APP_VERSION__}</span>
        </Box>

        {children}

        {/* La recherche prend tout ce qui reste entre le dernier onglet — ou
            son « + » — et le bout de rangée : c'est elle qui pousse celui-ci
            au bord droit. */}
        <Box pl="md" style={{ flex: 1, minWidth: 0, alignSelf: "center" }}>
          <SearchBox onOpen={account.onSearchOpen} />
        </Box>

        {/* Tout ce qui va à droite tient dans une seule boîte : les menus du
            mode, la société, le compte. */}
        <Box
          ml="auto"
          pl="md"
          style={{ alignSelf: "center", display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <AccountControls {...account} actions={actions} />
        </Box>
      </Tabs.List>
    </Tabs>
  );
}
