import { Alert } from "@mantine/core";
import { RED } from "../colors";

// Rouge pur imposé pour les messages d'erreur : fond #FF0000 et texte blanc.
// Pour une erreur sans fond, utiliser ERROR_TEXT_COLOR comme couleur de texte.
export const ERROR_COLOR = RED;
export const ERROR_TEXT_COLOR = RED;

export default function ErrorAlert({ children, onClose, ...props }) {
  return (
    <Alert
      variant="filled"
      radius="md"
      withCloseButton={Boolean(onClose)}
      onClose={onClose}
      styles={{
        root: { backgroundColor: ERROR_COLOR },
        message: { color: "#FFFFFF" },
        title: { color: "#FFFFFF" },
        label: { color: "#FFFFFF" },
        icon: { color: "#FFFFFF" },
        closeButton: { color: "#FFFFFF" },
      }}
      {...props}
    >
      {children}
    </Alert>
  );
}
