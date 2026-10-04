import { Alert, type AlertProps } from "@mantine/core";
import { GREEN } from "../../themes/colors";
import { alertStyles } from "../../themes/alerts";

// What has just succeeded, said in the window itself. Errors, on the other hand, go
// through a notification that stays until closed (lib/errors).
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
