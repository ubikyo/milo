import { Anchor, Button, Center, Paper, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { api } from "../api";
import { passwordIssues } from "@milo/shared";
import ErrorAlert from "../components/ui/ErrorAlert";
import Logo from "../components/ui/Logo";
import PasswordRules from "../components/ui/PasswordRules";
import { messageErreur } from "../lib/errors";
import type { AuthResult } from "@milo/shared";
import type { ChangeEvent, FormEvent } from "react";

/**
 * « setup » : tout premier compte. « first-email » puis « first-identity » :
 * activation en deux temps d'une adresse créée par un administrateur.
 */
type LoginMode = "login" | "setup" | "first-email" | "first-identity";

type Champ = keyof typeof emptyForm;

const emptyForm = {
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  password_confirm: "",
};

// « setup » : tout premier compte. « first-email » puis « first-identity » :
// activation en deux temps d'une adresse créée par un administrateur.
const TITRES: Record<LoginMode, string> = {
  login: "Se connecter",
  setup: "Créer le compte",
  "first-email": "Continuer",
  "first-identity": "Valider",
};

interface LoginPageProps {
  needsSetup: boolean;
  onAuthenticated: (result: AuthResult) => void;
}

export default function LoginPage({ needsSetup, onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>(needsSetup ? "setup" : "login");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: Champ) => (event: ChangeEvent<HTMLInputElement>) => {
    // La valeur est lue immédiatement : React vide `currentTarget` avant
    // d'exécuter l'updater ci-dessous.
    const { value } = event.currentTarget;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const emailLooksValid = /.+@.+\..+/.test(form.email.trim());

  const incomplete =
    mode === "login"
      ? !form.email.trim() || !form.password
      : mode === "first-email"
        ? !emailLooksValid
        : !form.first_name.trim() ||
          !form.last_name.trim() ||
          passwordIssues(form.password).length > 0 ||
          form.password !== form.password_confirm ||
          (mode === "setup" && !form.email.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    // Premier temps : on retient l'adresse, sans appel au serveur.
    if (mode === "first-email") {
      setMode("first-identity");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        password: form.password,
        password_confirm: form.password_confirm,
      };
      const result =
        mode === "login"
          ? await api.login(payload.email, payload.password)
          : mode === "setup"
            ? await api.setup(payload)
            : await api.firstLogin(payload);
      onAuthenticated(result);
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: LoginMode) => {
    setMode(next);
    setError(null);
    setForm((f) => ({ ...emptyForm, email: f.email }));
  };

  const identity = mode === "setup" || mode === "first-identity";

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder radius="md" p={40} w="100%" maw={420}>
        <form onSubmit={submit}>
          <Stack gap="md">
            <Stack align="center" gap="md" pt={35} pb={40}>
              <Logo variant={1} h={176} />
              {mode === "setup" && (
                <Text size="sm" c="dimmed">
                  Créez le premier compte pour commencer.
                </Text>
              )}
              {mode === "first-email" && (
                <Text size="sm" c="dimmed" ta="center">
                  Indiquez l'adresse e-mail de votre compte.
                </Text>
              )}
              {mode === "first-identity" && (
                <Text size="sm" c="dimmed" ta="center">
                  {form.email}
                </Text>
              )}
            </Stack>

            {error && <ErrorAlert>{error}</ErrorAlert>}

            {identity && (
              <>
                <TextInput label="Prénom" value={form.first_name} onChange={set("first_name")} required />
                <TextInput label="Nom" value={form.last_name} onChange={set("last_name")} required />
              </>
            )}

            {mode !== "first-identity" && (
              <TextInput label="E-mail" type="email" value={form.email} onChange={set("email")} required />
            )}

            {mode !== "first-email" && (
              <PasswordInput label="Mot de passe" value={form.password} onChange={set("password")} required />
            )}

            {identity && (
              <>
                <PasswordInput
                  label="Vérification du mot de passe"
                  value={form.password_confirm}
                  onChange={set("password_confirm")}
                  error={
                    form.password_confirm && form.password !== form.password_confirm
                      ? "Les deux mots de passe ne correspondent pas"
                      : undefined
                  }
                  required
                />
                <PasswordRules password={form.password} />
              </>
            )}

            <Button type="submit" color="teal" loading={busy} disabled={incomplete} fullWidth mt="md">
              {TITRES[mode]}
            </Button>

            {mode === "login" && (
              <Anchor
                component="button"
                type="button"
                size="sm"
                ta="center"
                onClick={() => switchTo("first-email")}
              >
                Première connexion ?
              </Anchor>
            )}
            {mode === "first-identity" && (
              <Anchor
                component="button"
                type="button"
                size="sm"
                ta="center"
                onClick={() => setMode("first-email")}
              >
                Modifier l'adresse e-mail
              </Anchor>
            )}
            {mode === "first-email" && (
              <Anchor
                component="button"
                type="button"
                size="sm"
                ta="center"
                onClick={() => switchTo("login")}
              >
                Retour à la connexion
              </Anchor>
            )}
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
