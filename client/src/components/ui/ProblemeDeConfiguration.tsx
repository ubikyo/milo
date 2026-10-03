import { IconAlertTriangle } from "@tabler/icons-react";
import EmptyPanel from "./EmptyPanel";

/**
 * Ce que montre un widget mal réglé à la place de son contenu — une liste de
 * demandes sans adresse, une réception vers un contexte qui n'est plus : le
 * triangle jaune, et le type du widget, pour savoir lequel revoir. Ses
 * réglages se rouvrent par son menu, comme d'habitude.
 */
export default function ProblemeDeConfiguration({ widget }: { widget: string }) {
  return <EmptyPanel icon={IconAlertTriangle} message={widget} avertissement size="md" />;
}
