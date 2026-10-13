import dayjs from "dayjs";
import type { Project } from "@milo/shared";
import { themeColor } from "../../../lib/themeColors";
import { useSourceItems } from "../../../lib/sources";
import { CHART_COLORS } from "../../chart-colors";
import { actorsDimension, bandDimension, labelsDimension, named } from "../dimensions";
import { plainDimension } from "../dimensions";
import type { IndicatorSource } from "../types";

// What the projects give the indicators: those of the "Projets" lists named —
// the open board's as its filters keep them —, counted by progress,
// category, actor or label, and dated by their creation or last change.

/** A project at 100 % is finished; below, it is in progress. */
const finished = (p: Project) => p.status >= 100;

/** Beyond this, a project in progress that is no longer edited is at a standstill; below, a project is recent. */
const DAYS = 30;

const since = (date: string): number => dayjs().diff(dayjs(date), "day", true);

/** The progress bands, and where their colors were stored. */
const PROGRESS_BANDS = [
  {
    key: "colorNotStarted",
    slice: "not_started",
    name: "Non démarrés",
    get color() {
      return themeColor("chart-not-started");
    },
    what: "des projets non démarrés",
  },
  { key: "colorStarted", slice: "started", name: "Moins de 50 %", color: CHART_COLORS.orange, what: "des projets à moins de 50 %" },
  { key: "colorHalf", slice: "half", name: "50 % et plus", color: CHART_COLORS.blue, what: "des projets à 50 % et plus" },
  { key: "colorFinished", slice: "finished", name: "Terminés", color: CHART_COLORS.green, what: "des projets terminés" },
];

const progressOf = (status: number) =>
  status === 0 ? "not_started" : status < 50 ? "started" : status < 100 ? "half" : "finished";

export const projectSource: IndicatorSource<Project> = {
  data: "project",
  label: "Projets",
  sourceType: "project.list",
  unit: "projets",
  none: "Aucun projet",
  useItems: ({ sources, board }) => useSourceItems("project", sources, board.projects),
  measures: [
    { value: "in_progress", label: "Projets en cours", weight: (p) => (finished(p) ? 0 : 1) },
    { value: "not_started", label: "Projets non démarrés", weight: (p) => (p.status === 0 ? 1 : 0) },
    { value: "done", label: "Projets terminés", weight: (p) => (finished(p) ? 1 : 0) },
    {
      value: "unassigned",
      label: "Projets sans acteur",
      weight: (p) => (!finished(p) && p.actors.length === 0 ? 1 : 0),
    },
    {
      value: "mine",
      label: "Projets qui me sont attribués",
      weight: (p, { userId }) => (!finished(p) && p.actors.some((a) => a.id === userId) ? 1 : 0),
    },
    {
      value: "stale",
      label: `Projets sans activité depuis ${DAYS} jours`,
      weight: (p) => (!finished(p) && since(p.updated_at) >= DAYS ? 1 : 0),
    },
    {
      value: "recent",
      label: `Projets créés ces ${DAYS} derniers jours`,
      weight: (p) => (since(p.created_at) < DAYS ? 1 : 0),
    },
    { value: "total", label: "Projets au total", weight: () => 1 },
  ],
  dimensions: [
    bandDimension("progress", "Progression", PROGRESS_BANDS, (p) => progressOf(p.status)),
    plainDimension("categories", "Catégories", (p) => named(p.category_name), { empty: "Sans catégorie" }),
    actorsDimension("actors", "Acteurs", (p) => p.actors),
    labelsDimension("/project-labels", "project.list", (p) => p.labels),
  ],
  dates: [
    { value: "created", label: "Date de création", title: "Projets créés", of: (p) => p.created_at },
    { value: "updated", label: "Dernière modification", title: "Projets modifiés", of: (p) => p.updated_at },
  ],
};
