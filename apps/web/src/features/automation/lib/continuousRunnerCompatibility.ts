type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
};

const CANCELLATION_RPC = "cancel_continuous_runner_legacy_requests";

export function isMissingContinuousRunnerCancellationRpc(
  error: PostgrestErrorLike | null | undefined
) {
  if (!error?.message?.includes(CANCELLATION_RPC)) return false;

  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.message.includes("Could not find the function") ||
    error.message.includes("does not exist")
  );
}
