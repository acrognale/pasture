export function EmptyReviewState() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-xs text-muted-foreground">
      Awaiting agent changes for this turn. Diffs will appear here once
      available.
    </div>
  );
}
