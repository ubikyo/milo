import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, notifyError } from "../../lib/errors";
import type { EntraPrincipal, PrincipalPermissions } from "@milo/shared";

const key = (p: EntraPrincipal) => `${p.type}:${p.id}`;

/** A save function a modal's "Enregistrer" button calls; false if the server refused. */
export type SaveRef = { current: (() => Promise<boolean>) | null };

interface Options<T> {
  /** The list as the server has it. */
  read: () => Promise<PrincipalPermissions<T>[]>;
  write: (principal: EntraPrincipal, permissions: T) => Promise<unknown>;
  erase: (principal: EntraPrincipal) => Promise<unknown>;
  /** Two sets of permissions that grant the same thing. */
  same: (a: T, b: T) => boolean;
  /** Where the save function is deposited, for the modal's "Enregistrer". */
  saveRef?: SaveRef;
  /** After a save: one's own rights may have changed. */
  onSaved?: () => void;
}

/**
 * Users' and groups' permissions changed on a draft (PrincipalsPermissions'
 * load, save, remove): nothing goes to the server before the modal's
 * "Enregistrer", which sends what changed — removals first, then additions
 * and changes. "Fermer" drops it. After a save, the list re-reads the server:
 * it shows what went through.
 */
export function usePermissionsDraft<T>({
  read,
  write,
  erase,
  same,
  saveRef,
  onSaved,
}: Options<T>) {
  // As the server has it, and as being changed.
  const saved = useRef<PrincipalPermissions<T>[]>([]);
  const draft = useRef<PrincipalPermissions<T>[]>([]);
  // Changed after each save: the list re-reads the server.
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const list = await read();
    saved.current = list;
    draft.current = list;
    return list;
    // "version" only serves to re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, version]);

  /** The draft, where this principal receives these permissions — or enters with them. */
  const save = async (principal: EntraPrincipal, permissions: T) => {
    const before = draft.current.find((a) => key(a.principal) === key(principal));
    draft.current = before
      ? draft.current.map((a) => (a === before ? { ...a, permissions } : a))
      : [...draft.current, { principal, permissions }];
    return draft.current;
  };

  const remove = async (principal: EntraPrincipal) => {
    draft.current = draft.current.filter((a) => key(a.principal) !== key(principal));
    return draft.current;
  };

  /** Its permissions as saved, or none. */
  const savedOf = (principal: EntraPrincipal): T | undefined =>
    saved.current.find((a) => key(a.principal) === key(principal))?.permissions;

  const send = async (): Promise<boolean> => {
    const kept = new Set(draft.current.map((a) => key(a.principal)));
    const removed = saved.current.filter((a) => !kept.has(key(a.principal)));
    const changed = draft.current.filter((a) => {
      const before = savedOf(a.principal);
      return before === undefined || !same(before, a.permissions);
    });
    if (removed.length === 0 && changed.length === 0) return true;
    try {
      for (const { principal } of removed) await erase(principal);
      for (const { principal, permissions } of changed) await write(principal, permissions);
      return true;
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    } finally {
      setVersion((v) => v + 1);
      onSaved?.();
    }
  };

  // Without a dependency array: `send` closes over the options, the modal
  // must call the latest one.
  useEffect(() => {
    if (!saveRef) return undefined;
    saveRef.current = send;
    return () => {
      saveRef.current = null;
    };
  });

  return { load, save, remove, savedOf };
}
