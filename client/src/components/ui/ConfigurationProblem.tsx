import { IconAlertTriangle } from "@tabler/icons-react";
import EmptyPanel from "./EmptyPanel";

/**
 * What a misconfigured widget shows in place of its content — a request list
 * with no address, a reception pointing to a context that no longer exists: the
 * yellow triangle, and the widget type, to know which one to review. Its
 * settings reopen through its menu, as usual.
 */
export default function ConfigurationProblem({ widget }: { widget: string }) {
  return <EmptyPanel icon={IconAlertTriangle} message={widget} warning size="md" />;
}
