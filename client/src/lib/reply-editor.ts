import { createContext, useContext } from "react";
import type { ReplyEditorView } from "@milo/shared";

// How an e-mail being written first shows, as the signed-in person chose it
// in their profile (PreferencesModal): the editor opens on it (SupportReply).
// The application provides it (App).

export const ReplyEditorContext = createContext<ReplyEditorView>("layout");

export const useReplyEditor = (): ReplyEditorView => useContext(ReplyEditorContext);
