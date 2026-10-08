import { createContext, useContext } from "react";
import type { PublicUser } from "@milo/shared";

// The accounts the application has read, for the widgets that offer actors
// without the page handing them a list of their own — the declared assets
// (DeclaredAssetDrawer). The board's page provides them (ViewPage).

export const UsersContext = createContext<PublicUser[]>([]);

export const useUsers = (): PublicUser[] => useContext(UsersContext);
