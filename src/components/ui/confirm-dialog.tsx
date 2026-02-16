import { useCallback, useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable confirmation dialog built on the native <dialog> element.
 * Provides modal behavior, focus trapping, and Escape-to-close for free.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  const confirmButtonClass =
    variant === "danger"
      ? "rounded px-3 py-1.5 text-sm font-medium bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
      : "rounded px-3 py-1.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      className="m-auto rounded-lg border border-theme-primary bg-theme-secondary p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-3 p-5" style={{ minWidth: 320 }}>
        <h2 className="text-sm font-semibold text-theme-secondary">{title}</h2>
        <p className="text-xs text-theme-muted">{description}</p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary focus:outline-none"
          >
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={confirmButtonClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
