import MailTemplates from "./MailTemplates";

// The "Modèles" tab of Settings ("Paramétrage"): the e-mails Milo sends, each
// with its template ("Gestion des modèles d'email"). The sending address is
// in the Entra tab; how each person is notified, in their preferences
// (PreferencesModal).

interface TemplatesTabProps {
  canEdit: boolean;
}

export default function TemplatesTab({ canEdit }: TemplatesTabProps) {
  return <MailTemplates canEdit={canEdit} />;
}
