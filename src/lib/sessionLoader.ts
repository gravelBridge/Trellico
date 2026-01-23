import { invoke } from "@tauri-apps/api/core";
import type { AIMessage, Provider } from "@/types";

interface MessageStore {
  getRunningSessionMessages: (sessionId: string) => AIMessage[] | null;
  viewSession: (sessionId: string | null, messages?: AIMessage[], provider?: Provider) => void;
}

/**
 * Load a session into the view, checking for running session messages first,
 * then falling back to loading from the database.
 */
export async function loadSessionToView(
  sessionId: string,
  store: MessageStore,
  provider?: Provider
): Promise<void> {
  const runningMessages = store.getRunningSessionMessages(sessionId);
  if (runningMessages) {
    store.viewSession(sessionId, undefined, provider);
  } else {
    try {
      const history = await invoke<AIMessage[]>("db_get_session_messages", {
        sessionId,
      });
      store.viewSession(sessionId, history, provider);
    } catch {
      // Session might not exist yet or failed - just view empty
      store.viewSession(sessionId, [], provider);
    }
  }
}
