type TurnReviewPaneProps = {
  workspacePath: string;
  onRequestFeedback?: (prompt: string) => void;
  disabled?: boolean;
  onClose?: () => void;
};

export function TurnReviewPane({
  onRequestFeedback,
  onClose,
}: TurnReviewPaneProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background text-sm text-muted-foreground px-6 text-center">
      <p>
        Turn review stories are not implemented yet. Use the main app to see the
        full diff experience.
      </p>
      <div className="flex gap-2">
        {onRequestFeedback ? (
          <button
            type="button"
            className="rounded-md border border-border/60 px-3 py-2"
            onClick={() =>
              onRequestFeedback(
                'Review feedback: captured from the Storybook stub.'
              )
            }
          >
            Send mock feedback
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            className="rounded-md border border-border/60 px-3 py-2"
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
