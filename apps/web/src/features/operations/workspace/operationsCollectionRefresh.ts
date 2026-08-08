export type OperationsCollectionCompletion = {
  request_status: string;
  error_message: string | null;
  completed_at: string | null;
};

export function completionNeedsWorkspaceRefresh(
  request: OperationsCollectionCompletion,
  hydrationStartedAt: string | null
) {
  if (
    request.request_status !== "COMPLETE" ||
    request.error_message ||
    !request.completed_at ||
    !hydrationStartedAt
  ) {
    return false;
  }

  const completedAt = new Date(request.completed_at).getTime();
  const hydratedFrom = new Date(hydrationStartedAt).getTime();

  return (
    Number.isFinite(completedAt) &&
    Number.isFinite(hydratedFrom) &&
    completedAt > hydratedFrom
  );
}
