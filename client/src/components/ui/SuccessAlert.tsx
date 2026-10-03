import { Alert, type AlertProps } from "@mantine/core";
import { GREEN } from "../../themes/colors";
import { alertStyles } from "../../themes/alerts";

// Ce qui vient de réussir, dit dans la fenêtre même. Les erreurs, elles, passent
// par une notification qui reste jusqu'à être fermée (lib/errors).
const STYLES = alertStyles(GREEN);

interface SuccessAlertProps extends AlertProps {
  onClose?: () => void;
}

export default function SuccessAlert({ children, onClose, ...props }: SuccessAlertProps) {
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
