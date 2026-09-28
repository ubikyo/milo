import { Alert, alpha } from "@mantine/core";
import { RED } from "../../themes/colors";

// Le rouge des erreurs, décliné en trois : le trait du cadre, le texte, et le
// fond qui n'en garde qu'un dixième. Un aplat rouge plein criait plus fort que
// ce qu'il annonçait ; un cadre fin sur un fond à peine teinté se remarque
// sans occuper tout l'écran, et laisse le message lisible dans les deux
// thèmes.
const ERROR_BG = alpha(RED, 0.1);

export default function ErrorAlert({ children, onClose, ...props }) {
  return (
    <Alert
      variant="light"
      radius="md"
      withCloseButton={Boolean(onClose)}
      onClose={onClose}
      styles={{
        root: {
          backgroundColor: ERROR_BG,
          border: `1px solid ${RED}`,
        },
        message: { color: RED },
        title: { color: RED },
        label: { color: RED },
        icon: { color: RED },
        closeButton: { color: RED },
      }}
      {...props}
    >
      {children}
    </Alert>
  );
}
