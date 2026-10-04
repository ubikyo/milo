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
 * « setup » : le mot de passe du compte « admin » et le nom du premier
 * workspace, à la toute première ouverture. « microsoft » : la connexion de tout le monde. « admin » : celle
 * du compte « admin », qui ne sert qu'au paramétrage.
 */
type LoginMode = "setup" | "microsoft" | "admin";

const ADMIN = "admin";

interface LoginPageProps {
  needsSetup: boolean;
  /** L'application Entra est renseignée : la connexion par Microsoft est possible. */
  entra: boolean;
  /** Ce que Microsoft ou le serveur a répondu au retour d'une connexion. */
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

  // Le refus rapporté par le retour de Microsoft, porté comme toute erreur.
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
              // Un lien et non un appel : le navigateur quitte l'application
              // pour la page de Microsoft, et revient avec sa session.
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

            {/* Le workspace de la première équipe : ses accès se règlent
                ensuite, dans le Paramétrage. */}
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
