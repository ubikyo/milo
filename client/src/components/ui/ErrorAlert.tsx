import { Alert, type AlertProps } from "@mantine/core";
import { RED } from "../../themes/colors";
import { alertStyles } from "../../themes/alerts";

// Le rouge des erreurs, décliné en trois par le cadre commun (themes/alerts) :
// le trait du cadre, le texte, et le fond qui n'en garde qu'un dixième. Son
// pendant vert rend compte de ce qui a réussi (SuccessAlert).
const STYLES = alertStyles(RED);

interface ErrorAlertProps extends AlertProps {
  onClose?: () => void;
}

export default function ErrorAlert({ children, onClose, ...props }: ErrorAlertProps) {
  return (
    <Alert
      variant="light"
      radius="md"
      withCloseButton={Boolean(onClose)}
      onClose={onClose}
      styles={STYLES}
      {...props}
    >
      {children}
    </Alert>
  );
}
