import { Alert, type AlertProps } from "@mantine/core";
import { GREEN } from "../../themes/colors";
import { alertStyles } from "../../themes/alerts";

// Le pendant vert d'ErrorAlert, au même cadre près : ce qui vient de réussir se
// dit du même ton que ce qui vient d'échouer, la couleur seule les sépare.
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
