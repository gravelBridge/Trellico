import { useEffect, useRef, useCallback, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [showUpToDate, setShowUpToDate] = useState(false);
  const hasCheckedOnStartup = useRef(false);

  const checkForUpdates = useCallback(async (showNoUpdateMessage = false) => {
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(update);
      } else if (showNoUpdateMessage) {
        setShowUpToDate(true);
      }
    } catch (err) {
      console.error("Failed to check for updates:", err);
    }
  }, []);

  const handleDownloadAndInstall = useCallback(async () => {
    if (!updateAvailable) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      let totalSize = 0;
      let downloadedSize = 0;

      await updateAvailable.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalSize = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedSize += event.data.chunkLength;
          if (totalSize > 0) {
            setDownloadProgress(Math.round((downloadedSize / totalSize) * 100));
          }
        } else if (event.event === "Finished") {
          setDownloadProgress(100);
        }
      });

      setIsReady(true);
      setIsDownloading(false);
    } catch (err) {
      console.error("Failed to download update:", err);
      setIsDownloading(false);
    }
  }, [updateAvailable]);

  const handleRelaunch = useCallback(async () => {
    await relaunch();
  }, []);

  const handleDismiss = useCallback(() => {
    setUpdateAvailable(null);
    setIsDownloading(false);
    setDownloadProgress(0);
    setIsReady(false);
  }, []);

  // Check on startup
  useEffect(() => {
    if (!hasCheckedOnStartup.current) {
      hasCheckedOnStartup.current = true;
      // Delay startup check slightly to not block initial render
      const timeout = setTimeout(() => checkForUpdates(), 2000);
      return () => clearTimeout(timeout);
    }
  }, [checkForUpdates]);

  // Periodic check every hour
  useEffect(() => {
    const interval = setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkForUpdates]);

  // Listen for menu event "check-for-updates"
  useEffect(() => {
    const unlisten = listen("check-for-updates", () => {
      checkForUpdates(true);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [checkForUpdates]);

  return (
    <>
      {/* Update available dialog */}
      <AlertDialog open={updateAvailable !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isReady ? "Update Ready" : "Update Available"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isReady ? (
                "The update has been downloaded. Restart the app to apply the update."
              ) : isDownloading ? (
                `Downloading update... ${downloadProgress}%`
              ) : (
                <>
                  A new version ({updateAvailable?.version}) is available. Would
                  you like to download and install it?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {isReady ? (
              <>
                <AlertDialogCancel onClick={handleDismiss}>Later</AlertDialogCancel>
                <AlertDialogAction onClick={handleRelaunch}>
                  Restart Now
                </AlertDialogAction>
              </>
            ) : isDownloading ? (
              <AlertDialogCancel disabled>Downloading...</AlertDialogCancel>
            ) : (
              <>
                <AlertDialogCancel onClick={handleDismiss}>
                  Not Now
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleDownloadAndInstall}>
                  Download & Install
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Up to date dialog */}
      <AlertDialog open={showUpToDate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You're Up to Date</AlertDialogTitle>
            <AlertDialogDescription>
              Trellico is running the latest version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowUpToDate(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
