import { useState, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  error: string | null;
  progress: number;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    status: "idle",
    version: null,
    error: null,
    progress: 0,
  });

  const checkForUpdates = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "checking", error: null }));

    try {
      const update = await check();

      if (update) {
        setState((prev) => ({
          ...prev,
          status: "available",
          version: update.version,
        }));
        return update;
      } else {
        setState((prev) => ({ ...prev, status: "idle" }));
        return null;
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to check for updates",
      }));
      return null;
    }
  }, []);

  const downloadAndInstall = useCallback(async (update: Update) => {
    setState((prev) => ({ ...prev, status: "downloading", progress: 0 }));

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          setState((prev) => ({ ...prev, progress: 0 }));
        } else if (event.event === "Progress") {
          setState((prev) => ({
            ...prev,
            progress: prev.progress + event.data.chunkLength,
          }));
        } else if (event.event === "Finished") {
          setState((prev) => ({ ...prev, status: "ready", progress: 100 }));
        }
      });

      setState((prev) => ({ ...prev, status: "ready" }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to download update",
      }));
    }
  }, []);

  const installAndRelaunch = useCallback(async () => {
    await relaunch();
  }, []);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    installAndRelaunch,
  };
}
