import { api } from "../../api";
import { PROJECT_INDICATORS, indicateurProjetDe } from "../../project-indicators";
import IndicatorsPanel, { type IndicatorsApi } from "../ui/IndicatorsPanel";
import type {
  Id,
  IndicatorSection,
  Project,
  ProjectIndicator,
  ProjectIndicatorType,
} from "@milo/shared";

// Les sections du mode Projet, sous les onglets. Leurs widgets sont ceux de
// client/src/project-indicators : la liste des projets, et les indicateurs
// qui se calculent sur les projets du tableau ouvert.
interface ProjectIndicatorsPanelProps {
  /** « null » tant que les sections du panneau ne sont pas lues. */
  sections: IndicatorSection[] | null;
  indicators: ProjectIndicator[];
  projects: Project[];
  onChanged: () => void | Promise<void>;
  locked: boolean;
  userId: Id;
}

const ECRITURES: IndicatorsApi<ProjectIndicatorType> = {
  create: api.createProjectIndicator,
  update: api.updateProjectIndicator,
  remove: api.deleteProjectIndicator,
  reorder: api.reorderProjectIndicators,
  sections: api.projectIndicatorSections,
};

export default function ProjectIndicatorsPanel({
  sections,
  indicators,
  projects,
  onChanged,
  locked,
  userId,
}: ProjectIndicatorsPanelProps) {
  return (
    <IndicatorsPanel
      sections={sections}
      indicators={indicators}
      widgets={PROJECT_INDICATORS}
      widgetOf={indicateurProjetDe}
      render={(widget, config, rendu) => (
        <widget.Display config={config} projects={projects} userId={userId} {...rendu} />
      )}
      api={ECRITURES}
      onChanged={onChanged}
      locked={locked}
    />
  );
}
