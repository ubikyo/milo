import { notifications } from "@mantine/notifications";
import { RED } from "../themes/colors";

/**
 * The message of a caught error. `catch` gives an `unknown`: it is not
 * necessarily an `Error`, and reading ".message" on it is not safe. A single
 * function does it, everywhere.
 */
export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * An error brought to the user: a red notification, at bottom right,
 * that stays until they close it. No more banners in windows —
 * the error is no longer lost at the bottom of a panel, nor does it disappear with it.
 *
 * The message serves as the identifier: the same error, repeated before being
 * closed, does not stack up (Mantine ignores an identifier already shown). Its
 * priority puts it ahead of follow notices when the stack is full.
 */
export const notifyError = (message: string, title = "Erreur"): void => {
  notifications.show({
    id: `error:${message}`,
    color: RED,
    title: title,
    message,
    autoClose: false,
    priority: 1,
  });
};
