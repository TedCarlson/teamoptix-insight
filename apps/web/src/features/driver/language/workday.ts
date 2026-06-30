export type DriverWorkdayState =
  | "CHECKING"
  | "READY_TO_START"
  | "CLOCKED_IN"
  | "DAY_OFF"
  | "AWAITING_ASSIGNMENT"
  | "WORKDAY_COMPLETE"
  | "SCHEDULE_UNAVAILABLE";

type WorkdayPresentationInput = {
  state: DriverWorkdayState;
  lastClockInTime?: string | null;
  lastClockOutTime?: string | null;
  route?: string | null;
};

export type DriverWorkdayPresentation = {
  title: string;
  message: string;
  actionLabel: "Clock In" | "Clock Out";
  actionEnabled: boolean;
};

export function resolveDriverWorkdayPresentation({
  state,
  lastClockInTime,
  lastClockOutTime,
  route,
}: WorkdayPresentationInput): DriverWorkdayPresentation {
  switch (state) {
    case "CHECKING":
      return {
        title: "Checking Workday",
        message: "Loading today's workday.",
        actionLabel: "Clock In",
        actionEnabled: false,
      };

    case "CLOCKED_IN":
      return {
        title: "You're Working",
        message: lastClockInTime
          ? `Started at ${lastClockInTime}. Tap anywhere on this card to Clock Out.`
          : "Tap anywhere on this card to Clock Out.",
        actionLabel: "Clock Out",
        actionEnabled: true,
      };

    case "READY_TO_START":
      return {
        title: "Ready to Start",
        message: route
          ? `Route ${route}. Tap anywhere on this card to Clock In.`
          : "Tap anywhere on this card to Clock In.",
        actionLabel: "Clock In",
        actionEnabled: true,
      };

    case "AWAITING_ASSIGNMENT":
      return {
        title: "Awaiting Assignment",
        message: "Report to Leadership for assignment.",
        actionLabel: "Clock In",
        actionEnabled: true,
      };

    case "WORKDAY_COMPLETE":
      return {
        title: "Workday Complete",
        message: lastClockOutTime
          ? `You clocked out at ${lastClockOutTime}.`
          : "Your workday is complete.",
        actionLabel: "Clock In",
        actionEnabled: false,
      };

    case "SCHEDULE_UNAVAILABLE":
      return {
        title: "Schedule Unavailable",
        message: "We couldn't determine today's schedule.",
        actionLabel: "Clock In",
        actionEnabled: false,
      };

    case "DAY_OFF":
    default:
      return {
        title: "Scheduled Day Off",
        message: "You aren't scheduled to work today.",
        actionLabel: "Clock In",
        actionEnabled: true,
      };
  }
}
