// The people of a workspace: those with access to it in their own right, its
// groups, and each user of these groups — those of their subgroups included —,
// listed individually. A view's sharing offers them all; the actors of a
// card, a project or a request only those who use its widget type ("Utiliser"
// at least), their own permission and their groups' merged.
//
// A group's users come from the directory; without it — Entra unreachable —,
// from the groups Milo accounts brought back at their last sign-in.

import { canUse, mergeWidgetRights, validWidgetRights } from "@milo/shared";
import type {
  DirectoryUser,
  EntraPrincipal,
  Id,
  WidgetKind,
  WidgetRights,
  WorkspacePeople,
} from "@milo/shared";
import { selection } from "../db/query.js";
import { groupsOf, users } from "../repositories/users.js";
import { entraGroupMembers } from "./entra.js";

interface AccessRow {
  type: "user" | "group";
  id: string;
  name: string;
  email: string;
  widgets: string;
}

const accessOf = selection<AccessRow>(
  `SELECT principal_type AS type, principal_id AS id, principal_name AS name,
     principal_email AS email, widgets
   FROM principal_permissions WHERE workspace_id = ? ORDER BY principal_name`,
);

/** A group's users are re-read from the directory at most this often. */
const MEMBERS_TTL = 5 * 60 * 1000;
const membersCache = new Map<string, { at: number; members: Promise<EntraPrincipal[]> }>();

/** A group's users, from the directory; null if it cannot be read. */
const membersOf = (groupId: string): Promise<EntraPrincipal[] | null> => {
  const cached = membersCache.get(groupId);
  if (cached && Date.now() - cached.at < MEMBERS_TTL) return cached.members;
  const members = entraGroupMembers(groupId);
  membersCache.set(groupId, { at: Date.now(), members });
  // A failure is not kept: the next opening tries again.
  members.catch(() => membersCache.delete(groupId));
  return members.catch(() => null);
};

const parsedWidgets = (json: string): WidgetRights => {
  try {
    return validWidgetRights(JSON.parse(json));
  } catch {
    return validWidgetRights({});
  }
};

/**
 * The people of this workspace. With "kind", only those who read this widget
 * type; without it, all those with access to the workspace.
 */
export const workspacePeople = async (
  workspaceId: Id,
  kind?: WidgetKind,
): Promise<WorkspacePeople> => {
  const rows = accessOf.all(workspaceId);
  const groupRows = rows.filter((r) => r.type === "group");
  const accounts = users.all.all().filter((u) => u.entra_id);

  // Each person: who they are, and the permissions they hold — their own row,
  // and their groups'.
  const people = new Map<string, { person: EntraPrincipal; rights: WidgetRights[] }>();
  const add = (person: EntraPrincipal, rights: WidgetRights) => {
    const entry = people.get(person.id) ?? { person, rights: [] };
    // Their own row names them best.
    if (person.name && !entry.person.name) entry.person = person;
    entry.rights.push(rights);
    people.set(person.id, entry);
  };

  for (const row of rows.filter((r) => r.type === "user")) {
    add({ type: "user", id: row.id, name: row.name, email: row.email }, parsedWidgets(row.widgets));
  }

  const membersByGroup = new Map<string, Set<string>>();
  const fromDirectory = await Promise.all(groupRows.map((g) => membersOf(g.id)));
  groupRows.forEach((group, rank) => {
    const rights = parsedWidgets(group.widgets);
    const members = new Map<string, EntraPrincipal>();
    for (const m of fromDirectory[rank] ?? []) members.set(m.id, m);
    // The accounts that say they belong to it, as of their last sign-in.
    for (const account of accounts) {
      if (account.entra_id && !members.has(account.entra_id) && groupsOf(account).includes(group.id))
        members.set(account.entra_id, {
          type: "user",
          id: account.entra_id,
          name: account.name,
          email: account.email,
        });
    }
    for (const m of members.values()) add(m, rights);
    membersByGroup.set(group.id, new Set(members.keys()));
  });

  const reads = (rights: WidgetRights[]) =>
    kind === undefined || canUse(mergeWidgetRights(rights)[kind]);

  const listed: DirectoryUser[] = [...people.values()]
    .filter((p) => reads(p.rights))
    .map(({ person }) => {
      const account =
        users.byEntraId.get(person.id) ?? (person.email ? users.byEmail.get(person.email) : undefined);
      return {
        oid: person.id,
        name: account?.name || person.name || person.email,
        email: account?.email || person.email,
        user_id: account?.id ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const shown = new Set(listed.map((u) => u.oid));

  const groups = groupRows
    .filter((g) => reads([parsedWidgets(g.widgets)]))
    .map((g) => ({
      type: "group" as const,
      id: g.id,
      name: g.name,
      email: g.email,
      members: [...(membersByGroup.get(g.id) ?? [])].filter((oid) => shown.has(oid)),
    }));

  return { users: listed, groups };
};

/**
 * Whom a workspace's views can be shared with: its users — their own and its
 * groups' — then its groups.
 */
export const sharePrincipals = async (workspaceId: Id): Promise<EntraPrincipal[]> => {
  const { users: people, groups } = await workspacePeople(workspaceId);
  return [
    ...people.map((u): EntraPrincipal => ({ type: "user", id: u.oid, name: u.name, email: u.email })),
    ...groups.map(({ members: _members, ...group }): EntraPrincipal => group),
  ];
};
