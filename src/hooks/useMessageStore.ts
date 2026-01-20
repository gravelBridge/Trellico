import { useContext } from "react";
import { MessageStoreContext } from "@/contexts/MessageStoreContext";

export function useMessageStore() {
  const context = useContext(MessageStoreContext);
  if (!context) {
    throw new Error("useMessageStore must be used within a MessageStoreProvider");
  }
  return context;
}
