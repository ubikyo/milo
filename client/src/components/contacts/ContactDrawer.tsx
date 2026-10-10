import { Drawer, Group, Input, MultiSelect, Select, Stack, Tabs, TextInput } from "@mantine/core";
import { IconMail, IconMessage, IconPhone, IconSettings, IconWorld } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_EMAIL_PATTERN,
  CONTACT_FIELD_MAX,
  CONTACT_NAME_MAX,
  CONTACT_TYPES,
  CONTACT_URL_MAX,
  CONTACT_URL_PATTERN,
  contactName,
  isContactType,
} from "@milo/shared";
import type {
  Contact,
  ContactAddress,
  ContactComment,
  ContactInput,
  ContactSettings,
  ContactType,
  Id,
  Label,
} from "@milo/shared";
import { api } from "../../api";
import { useIsEditing } from "../../lib/editing";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import { tabStyle } from "../../themes/tabs";
import CommentThread from "../project/CommentThread";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import type { Row } from "../ui/EditableRows";
import LabelPicker, { CONTACT_LABELS_API } from "../ui/LabelPicker";
import AddressRows from "./AddressRows";

// A contact's drawer, laid out like a declared asset's (DeclaredAssetDrawer):
// its labels first, then its type — a person or a company — and its name — a
// person's first name and name, its job title under them —; then its
// e-mails, phone numbers and addresses — and a company's websites —, each a
// list in its order, dragged by its handles; an address on several lines
// (AddressRows). A company has more: its people —
// contacts of its board, chosen, or created from here in a drawer of their
// own —, its payment terms and its currency, chosen in its board's lists
// (ContactTablesFields).
//
// Everything goes with "Sauvegarder". Beside the record, its thread, as a
// card's: the team's comments, and Milo's notes — its creation, its edits.

// The height of the label chips, as on a declared asset.
const CHIP_HEIGHT = 30;

// The drawer's two panes, as a card's: the record, then its thread.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
] as const;

/** As wide as an asset's. */
const DRAWER_WIDTH = 560;

/**
 * A company's chosen people, as the rights in the access settings
 * (SectionRights): pills 4 px taller than "xs" ones, barely rounded.
 */
const PILL_HEIGHT = 22;
const PILL_RADIUS = 4;

/** The width of the type, above the name. */
const TYPE_WIDTH = 120;

// The width of a phone's or a website's label.
const LABEL_WIDTH = 120;

/** What the drawer edits: ids as the pickers hold them. */
interface Form {
  first_name: string;
  name: string;
  type: ContactType;
  job_title: string;
  emails: Row[];
  phones: Row[];
  addresses: ContactAddress[];
  websites: Row[];
  payment_term: string;
  currency: string;
  member_ids: string[];
  label_ids: string[];
}

const EMPTY: Form = {
  first_name: "",
  name: "",
  type: "person",
  job_title: "",
  emails: [],
  phones: [],
  addresses: [],
  websites: [],
  payment_term: "",
  currency: "",
  member_ids: [],
  label_ids: [],
};

const formOf = (c: Contact): Form => ({
  first_name: c.first_name,
  name: c.name,
  type: c.type,
  job_title: c.job_title,
  emails: c.emails.map((e) => [e]),
  phones: c.phones.map((p) => [p.label, p.number]),
  addresses: c.addresses,
  websites: c.websites.map((w) => [w.label, w.url]),
  payment_term: c.payment_term,
  currency: c.currency,
  member_ids: c.member_ids.map(String),
  label_ids: c.labels.map((l) => String(l.id)),
});

const inputOf = (f: Form): ContactInput => {
  const company = f.type === "company";
  return {
    first_name: company ? "" : f.first_name.trim(),
    name: f.name.trim(),
    type: f.type,
    job_title: company ? "" : f.job_title.trim(),
    emails: f.emails.map(([email = ""]) => email),
    phones: f.phones.map(([label = "", number = ""]) => ({ label, number })),
    // An address left without a line, a postal code or a town is dropped.
    addresses: f.addresses.filter((a) => [a.line1, a.line2, a.postal_code, a.city].some((v) => v.trim())),
    websites: company ? f.websites.map(([label = "", url = ""]) => ({ label, url })) : [],
    payment_term: company ? f.payment_term : "",
    currency: company ? f.currency : "",
    member_ids: company ? f.member_ids.map(Number) : [],
    label_ids: f.label_ids.map(Number),
  };
};

/** The choices of a list, with the current value even if it has left it since. */
const options = (names: string[], current: string): string[] =>
  current && !names.includes(current) ? [...names, current] : names;

const NO_LISTS: ContactSettings = { payment_terms: [], currencies: [], countries: [] };

/** A list of the drawer: its words, its columns. */
const LISTS = [
  {
    field: "emails",
    title: "E-mails",
    columns: [
      {
        label: "E-mail",
        maxLength: CONTACT_EMAIL_MAX,
        pattern: CONTACT_EMAIL_PATTERN,
        invalid: (v: string) => `« ${v} » n'est pas une adresse e-mail`,
      },
    ],
    icon: IconMail,
    none: "Aucun e-mail",
    add: "Ajouter un e-mail",
    remove: "Supprimer l'e-mail",
    word: "e-mail",
    nameOf: ([email = ""]: Row) => email,
  },
  {
    field: "phones",
    title: "Numéros de téléphone",
    columns: [
      { label: "Libellé", maxLength: CONTACT_FIELD_MAX, width: LABEL_WIDTH, optional: true },
      { label: "Numéro", maxLength: CONTACT_FIELD_MAX },
    ],
    icon: IconPhone,
    none: "Aucun numéro de téléphone",
    add: "Ajouter un numéro",
    remove: "Supprimer le numéro",
    word: "numéro",
    nameOf: ([label = "", number = ""]: Row) => [label, number].filter(Boolean).join(" "),
  },
  {
    field: "websites",
    title: "Sites internet",
    columns: [
      { label: "Libellé", maxLength: CONTACT_FIELD_MAX, width: LABEL_WIDTH, optional: true },
      {
        label: "Site",
        maxLength: CONTACT_URL_MAX,
        placeholder: "Site internet",
        pattern: CONTACT_URL_PATTERN,
        invalid: (v: string) =>
          `« ${v} » n'est pas l'adresse d'un site web : elle commence par http:// ou https://`,
      },
    ],
    icon: IconWorld,
    none: "Aucun site internet",
    add: "Ajouter un site internet",
    remove: "Supprimer le site internet",
    word: "site",
    nameOf: ([label = "", url = ""]: Row) => label || url,
  },
] as const;

interface ContactDrawerProps {
  opened: boolean;
  onClose: () => void;
  boardId: Id;
  /** The widget it is added from (LIST_KEY). */
  listKey: string;
  /** The contact shown; null to add one. */
  contact: Contact | null;
  /** The board's contacts: a company picks its people among them. */
  contacts: Contact[];
  /** After a write: the list re-reads. */
  onSaved: () => void;
  /** A contact just created, from a company's drawer: it joins its people. */
  onCreated?: (contact: Contact) => void;
  /** The type a new contact starts with. */
  initialType?: ContactType;
  canSave: boolean;
  canDelete: boolean;
}

export default function ContactDrawer({
  opened,
  onClose,
  boardId,
  listKey,
  contact,
  contacts,
  onSaved,
  onCreated,
  initialType = "person",
  canSave,
  canDelete,
}: ContactDrawerProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [lists, setLists] = useState<ContactSettings>(NO_LISTS);
  const [labels, setLabels] = useState<Label[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The people created from this drawer, until the board's list brings them.
  const [created, setCreated] = useState<Contact[]>([]);
  // A person being created from a company's drawer.
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("settings");
  const [comments, setComments] = useState<ContactComment[]>([]);
  const readOnly = !canSave;
  const company = form.type === "company";
  // The thread is for display mode: in edit mode, the drawer shows the record
  // alone. A contact being added has no thread yet.
  const isEditing = useIsEditing();
  const withComments = Boolean(contact) && !isEditing;
  const tabs = TABS.filter((t) => t.value === "settings" || withComments);

  const readLabels = useCallback(async () => {
    try {
      setLabels(await api.getContactLabels(boardId));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId]);

  const readComments = useCallback(async () => {
    if (!contact) return;
    try {
      setComments(await api.getContactComments(contact.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [contact]);

  // Each opening starts from the contact, on its first tab, and re-reads the
  // board's lists, its labels and its thread.
  useEffect(() => {
    if (!opened) return;
    setForm(contact ? formOf(contact) : { ...EMPTY, type: initialType });
    setCreated([]);
    setActiveTab("settings");
    setComments([]);
    api
      .getContactSettings(boardId)
      .then(setLists)
      .catch((e) => notifyError(errorMessage(e)));
    void readLabels();
    if (withComments) void readComments();
  }, [opened, contact, boardId, initialType, withComments, readLabels, readComments]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // The people a company can name: the board's other contacts — a company's
  // own people may be companies too.
  const people = [...contacts, ...created.filter((c) => !contacts.some((k) => k.id === c.id))]
    .filter((c) => c.id !== contact?.id)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }))
    .map((c) => ({ value: String(c.id), label: contactName(c) }));

  // A currency reads with its code and symbol; it is stored by its name.
  const currencies = lists.currencies.map((c) => ({
    value: c.name,
    label: `${c.name} (${[c.code, c.symbol].filter(Boolean).join(", ")})`,
  }));
  if (form.currency && !currencies.some((c) => c.value === form.currency)) {
    currencies.push({ value: form.currency, label: form.currency });
  }

  // --- Comments --------------------------------------------------------------

  const addComment = async (text: string) => {
    if (!contact) return;
    try {
      await api.addContactComment(contact.id, text);
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const updateComment = async (id: number | string, text: string) => {
    try {
      await api.updateContactComment(Number(id), text);
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteComment = async (id: number | string) => {
    try {
      await api.deleteContactComment(Number(id));
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- Save and delete -----------------------------------------------------

  const persist = async () => {
    if (!form.name.trim()) {
      notifyError("Le champ « Nom » est requis");
      return;
    }
    setSaving(true);
    try {
      if (contact) {
        await api.updateContact(contact.id, inputOf(form));
      } else {
        const saved = await api.createContact({ ...inputOf(form), board_id: boardId, list_key: listKey });
        onCreated?.(saved);
      }
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contact) return;
    setConfirmDelete(false);
    try {
      await api.deleteContact(contact.id);
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={DRAWER_WIDTH}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        styles={DRAWER_STYLES}
      >
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          style={DRAWER_PANEL_STYLE}
          styles={DRAWER_TABS_STYLES}
        >
          <Tabs.List mb="md">
            {tabs.map(({ value, label, icon: Icon }) => (
              <Tabs.Tab
                key={value}
                value={value}
                leftSection={<Icon size={16} />}
                style={tabStyle(activeTab === value)}
              >
                {label}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea>
              {/* Read-only, all the fields are disabled at once. */}
              <fieldset disabled={readOnly} style={BARE_FIELDSET}>
                <Stack gap="xl">
                  <LabelPicker
                    chipHeight={CHIP_HEIGHT}
                    labels={labels}
                    value={form.label_ids}
                    onChange={(ids) => set("label_ids", ids)}
                    boardId={boardId}
                    onLabelsChanged={readLabels}
                    labelsApi={CONTACT_LABELS_API}
                  />

                  <Select
                    label="Type"
                    data={CONTACT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                    value={form.type}
                    onChange={(v) => {
                      if (isContactType(v)) set("type", v);
                    }}
                    allowDeselect={false}
                    w={TYPE_WIDTH}
                  />

                  {/* A person's first name and name side by side; a company's name alone. */}
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    {!company && (
                      <TextInput
                        label="Prénom"
                        placeholder="Prénom"
                        value={form.first_name}
                        onChange={(e) => set("first_name", e.currentTarget.value)}
                        maxLength={CONTACT_NAME_MAX}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                    )}
                    <TextInput
                      label="Nom"
                      placeholder="Nom"
                      value={form.name}
                      onChange={(e) => set("name", e.currentTarget.value)}
                      maxLength={CONTACT_NAME_MAX}
                      required
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  </Group>

                  {/* A person's job title, under its name. */}
                  {!company && (
                    <TextInput
                      label="Fonction"
                      placeholder="Fonction"
                      value={form.job_title}
                      onChange={(e) => set("job_title", e.currentTarget.value)}
                      maxLength={CONTACT_FIELD_MAX}
                    />
                  )}

                  {/* A company's people: the board's contacts, or one created here. */}
                  {company && (
                    <Input.Wrapper label="Contacts">
                      <Stack gap={4}>
                        <MultiSelect
                          placeholder={form.member_ids.length ? undefined : "Choisir un contact existant"}
                          data={people}
                          value={form.member_ids}
                          onChange={(ids) => set("member_ids", ids)}
                          nothingFoundMessage="Aucun contact"
                          searchable
                          styles={{
                            pill: {
                              "--pill-height": `${PILL_HEIGHT}px`,
                              height: PILL_HEIGHT,
                              borderRadius: PILL_RADIUS,
                            } as CSSProperties,
                          }}
                        />
                        {canSave && (
                          <div>
                            <AddButton label="Créer un contact" onClick={() => setCreating(true)} />
                          </div>
                        )}
                      </Stack>
                    </Input.Wrapper>
                  )}

                  {/* A company's terms, from its board's lists. */}
                  {company && (
                    <Group align="flex-start" gap="md" wrap="nowrap">
                      <Select
                        label="Conditions de paiement"
                        placeholder="Choisir une condition"
                        data={options(
                          lists.payment_terms.map((t) => t.name),
                          form.payment_term,
                        )}
                        value={form.payment_term || null}
                        onChange={(v) => set("payment_term", v ?? "")}
                        nothingFoundMessage="Aucune condition de paiement"
                        clearable
                        searchable
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <Select
                        label="Devise"
                        placeholder="Choisir une devise"
                        data={currencies}
                        value={form.currency || null}
                        onChange={(v) => set("currency", v ?? "")}
                        nothingFoundMessage="Aucune devise"
                        clearable
                        searchable
                        style={{ flex: 1, minWidth: 0 }}
                      />
                    </Group>
                  )}

                  {LISTS.filter((l) => l.field !== "websites").map((l) => (
                    <ListRows
                      key={l.field}
                      title={l.title}
                      columns={[...l.columns]}
                      rows={form[l.field]}
                      save={async (rows) => {
                        set(l.field, rows);
                        return true;
                      }}
                      emptyIcon={l.icon}
                      emptyText={l.none}
                      addLabel={l.add}
                      deleteTitle={l.remove}
                      several={(n) => pluralize(n, l.word)}
                      nameOf={l.nameOf}
                      reorderable
                    />
                  ))}
                  <AddressRows
                    value={form.addresses}
                    onChange={(addresses) => set("addresses", addresses)}
                    countries={lists.countries.map((c) => c.name)}
                  />
                  {/* A company's websites: a person has none. */}
                  {LISTS.filter((l) => l.field === "websites" && company).map((l) => (
                    <ListRows
                      key={l.field}
                      title={l.title}
                      columns={[...l.columns]}
                      rows={form[l.field]}
                      save={async (rows) => {
                        set(l.field, rows);
                        return true;
                      }}
                      emptyIcon={l.icon}
                      emptyText={l.none}
                      addLabel={l.add}
                      deleteTitle={l.remove}
                      several={(n) => pluralize(n, l.word)}
                      nameOf={l.nameOf}
                      reorderable
                    />
                  ))}
                </Stack>
              </fieldset>
            </DrawerScrollArea>
          </Tabs.Panel>

          {/* The panel takes all the free height: the empty thread spreads out in it. */}
          {withComments && (
            <Tabs.Panel value="comments" style={DRAWER_PANEL_STYLE}>
              <DrawerScrollArea fill>
                <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                  <CommentThread
                    comments={comments}
                    onAdd={(text) => void addComment(text)}
                    onUpdate={(id, text) => void updateComment(id, text)}
                    onDelete={(id) => void deleteComment(id)}
                    readOnly={readOnly}
                  />
                </Stack>
              </DrawerScrollArea>
            </Tabs.Panel>
          )}
        </Tabs>

        <DrawerFooter
          onSave={canSave ? persist : undefined}
          onClose={onClose}
          onDelete={contact && canDelete ? () => setConfirmDelete(true) : undefined}
          saving={saving}
        />
      </Drawer>

      {/* A person created from a company: once saved, it joins its people. */}
      {company && (
        <ContactDrawer
          opened={creating}
          onClose={() => setCreating(false)}
          boardId={boardId}
          listKey={listKey}
          contact={null}
          contacts={contacts}
          onSaved={onSaved}
          onCreated={(person) => {
            setCreated((already) => [...already, person]);
            setForm((f) => ({ ...f, member_ids: [...f.member_ids, String(person.id)] }));
          }}
          canSave={canSave}
          canDelete={false}
        />
      )}

      <DeleteConfirmModal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer le contact"
        message={
          <>
            Voulez-vous vraiment supprimer
            {form.name ? ` « ${contactName(form)} »` : " ce contact"} ? Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
