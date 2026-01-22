import { open } from "@tauri-apps/plugin-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ErrorDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  actionLabel?: string;
  onClose: () => void;
}

// Parse message and convert URLs to clickable links
function renderMessageWithLinks(message: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = message.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      // Reset regex lastIndex since test() advances it
      urlRegex.lastIndex = 0;
      return (
        <a
          key={index}
          href={part}
          onClick={(e) => {
            e.preventDefault();
            open(part);
          }}
          className="text-blue-500 hover:text-blue-400 underline cursor-pointer"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export function ErrorDialog({
  isOpen,
  title,
  message,
  actionLabel = "OK",
  onClose,
}: ErrorDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap">
            {renderMessageWithLinks(message)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
