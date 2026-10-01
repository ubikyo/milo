import { api } from "../../api";
import { indicateurDe, INDICATORS } from "../../indicators";
import IndicatorsPanel, { type IndicatorsApi } from "../ui/IndicatorsPanel";
import type {
  Id,
  IndicatorSection,
  SupportIndicator,
  SupportIndicatorType,
  SupportRequest,
} from "@milo/shared";

// Les sections du mode Support, sous les onglets. Leurs widgets sont ceux de
// client/src/indicators : la liste des demandes, et les indicateurs qui se
// calculent sur les demandes de la société regardée.
interface SupportIndicatorsPanelProps {
  /** « null » tant que les sections du panneau ne sont pas lues. */
  sections: IndicatorSection[] | null;
  indicators: SupportIndicator[];
  requests: SupportRequest[];
  onChanged: () => void | Promise<void>;
  locked: boolean;
  /** Le compte connecté, pour les indicateurs qui comptent ce qui « me » revient. */
  userId: Id;
}

const ECRITURES: IndicatorsApi<SupportIndicatorType> = {
  create: api.createSupportIndicator,
  update: api.updateSupportIndicator,
  remove: api.deleteSupportIndicator,
  reorder: api.reorderSupportIndicators,
  sections: api.supportIndicatorSections,
};

export default function SupportIndicatorsPanel({
  sections,
  indicators,
  requests,
  onChanged,
  locked,
  userId,
}: SupportIndicatorsPanelProps) {
  return (
    <IndicatorsPanel
      sections={sections}
      indicators={indicators}
      widgets={INDICATORS}
      widgetOf={indicateurDe}
      render={(widget, config, rendu) => (
        <widget.Display config={config} requests={requests} userId={userId} {...rendu} />
      )}
      api={ECRITURES}
      onChanged={onChanged}
      locked={locked}
    />
  );
}
