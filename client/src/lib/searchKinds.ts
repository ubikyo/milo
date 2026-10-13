import {
  IconApps,
  IconCalendarEvent,
  IconDeviceDesktop,
  IconDevices,
  IconFolder,
  IconHeadset,
  IconKey,
  IconLayoutKanban,
  IconMail,
  IconRss,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import type { SearchKind } from "@milo/shared";

// The kinds of content the search finds: the Spotlight groups its results by
// them (SearchBox), the profile lets each be left out (PreferencesModal).

/** The kinds, in the order the list presents them — that of the modes. */
export const KINDS: { kind: SearchKind; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { kind: "access", label: "Accès", icon: IconKey },
  { kind: "project", label: "Projets", icon: IconFolder },
  { kind: "card", label: "Tâches", icon: IconLayoutKanban },
  { kind: "support", label: "Support", icon: IconHeadset },
  { kind: "managed_device_asset", label: "Assets", icon: IconDeviceDesktop },
  { kind: "unmanaged_device_asset", label: "Équipements déclarés", icon: IconDevices },
  { kind: "application_asset", label: "Applications", icon: IconApps },
  { kind: "mail", label: "E-mails", icon: IconMail },
  { kind: "appointment", label: "Rendez-vous", icon: IconCalendarEvent },
  { kind: "article", label: "Flux RSS", icon: IconRss },
];
