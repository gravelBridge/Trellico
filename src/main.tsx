import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MessageStoreProvider, FolderProvider } from "./contexts";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MessageStoreProvider>
      <FolderProvider>
        <App />
      </FolderProvider>
    </MessageStoreProvider>
  </React.StrictMode>,
);
