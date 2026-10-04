// The mail test message. The settings are those of Entra
// (entra.ts): sending goes through Microsoft Graph, on behalf of the application.

/** The test message: its recipient. It is sent from the sending address. */
export interface MailTestInput {
  to: string;
}

export interface MailTestResult {
  sent_to: string;
}
