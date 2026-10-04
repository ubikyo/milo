import {
  Anchor,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconBrandWindows } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api, entraLoginUrl } from "../api";
import { passwordIssues } from "@milo/shared";
import Logo from "../components/ui/Logo";
import PasswordRules from "../components/ui/PasswordRules";
import { errorMessage, notifyError } from "../lib/errors";
import type { AuthResult } from "@milo/shared";
import type { FormEvent } from "react";

/**
 * "setup": the "admin" account's password and the name of the first
 * workspace, on the very first opening. "microsoft": everyone's login. "admin": that
 * of the "admin" account, which is only used for settings.
 */
type LoginMode = "setup" | "microsoft" | "admin";

const ADMIN = "admin";

interface LoginPageProps {
  needsSetup: boolean;
  /** The Entra application is configured: Microsoft login is possible. */
  entra: boolean;
  /** What Microsoft or the server answered on return from a login. */
  initialError?: string | null;
  onAuthenticated: (result: AuthResult) => void;
}

export default function LoginPage({
  needsSetup,
  entra,
  initialError,
  onAuthenticated,
}: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>(
    needsSetup ? "setup" : entra ? "microsoft" : "admin",
  );
  const [username, setUsername] = useState(ADMIN);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [busy, setBusy] = useState(false);

  // The refusal reported on return from Microsoft, carried like any error.
  useEffect(() => {
    if (initialError) notifyError(initialError);
  }, [initialError]);

  const incomplete =
    mode === "setup"
      ? !workspace.trim() || passwordIssues(password).length > 0 || password !== confirmation
      : !username.trim() || !password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "microsoft") return;
    setBusy(true);
    try {
      onAuthenticated(
        mode === "setup"
          ? await api.setup({ password, workspace: workspace.trim() })
          : await api.login(username.trim(), password),
      );
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: LoginMode) => {
    setMode(next);
    setPassword("");
    setConfirmation("");
  };

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder radius="md" p={40} w="100%" maw={420}>
        <form onSubmit={submit}>
          <Stack gap="md">
            <Stack
              align="center"
              gap="md"
              pt={35}
              pb={mode === "setup" ? 20 : 40}
            >
              <Logo variant={1} h={176} />
              {mode === "setup" && (
                <Text size="sm" c="dimmed" ta="center" pt={30}>
                  Le premier workspace, et le mot de passe du compte admin
                  pour le paramétrage de l'application
                </Text>
              )}
              {mode === "admin" && entra && (
                <Text size="sm" c="dimmed" ta="center">
                  Compte d'administration, pour le paramétrage.
                </Text>
              )}
            </Stack>


            {mode === "microsoft" && (
              // A link and not a call: the browser leaves the application
              // for Microsoft's page, and comes back with its session.
              <Button
                component="a"
                href={entraLoginUrl}
                color="teal"
                leftSection={<IconBrandWindows size={18} />}
                fullWidth
              >
                Se connecter avec Microsoft
              </Button>
            )}

            {mode === "admin" && (
              <TextInput
                label="Identifiant"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                required
              />
            )}

            {/* The first team's workspace: its access is set
                afterwards, in the Paramétrage. */}
            {mode === "setup" && (
              <TextInput
                label="Nom du workspace"
                value={workspace}
                onChange={(e) => setWorkspace(e.currentTarget.value)}
                required
                data-autofocus
              />
            )}

            {mode !== "microsoft" && (
              <PasswordInput
                label="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                data-autofocus={mode !== "setup"}
              />
            )}

            {mode === "setup" && (
              <>
                <PasswordInput
                  label="Vérification du mot de passe"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.currentTarget.value)}
                  error={
                    confirmation && password !== confirmation
                      ? "Les deux mots de passe ne correspondent pas"
                      : undefined
                  }
                  required
                />
                <PasswordRules password={password} />
              </>
            )}

            {mode !== "microsoft" && (
              <Button
                type="submit"
                color="teal"
                loading={busy}
                disabled={incomplete}
                fullWidth
                mt="md"
              >
                {mode === "setup" ? "Créer le compte admin" : "Se connecter"}
              </Button>
            )}

            {mode === "microsoft" && (
              <Anchor
                component="button"
                type="button"
                size="sm"
                ta="center"
                c="dimmed"
                onClick={() => switchTo("admin")}
              >
                Compte d'administration
              </Anchor>
            )}
            {mode === "admin" && entra && (
              <Anchor
                component="button"
                type="button"
                size="sm"
                ta="center"
                onClick={() => switchTo("microsoft")}
              >
                Retour à la connexion Microsoft
              </Anchor>
            )}
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
