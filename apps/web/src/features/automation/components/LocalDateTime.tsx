"use client";

import { useEffect, useState } from "react";

type LocalDateTimeProps = {
  value: string;
  display?: "date-time" | "time";
};

function formatInTimeZone(
  value: string,
  display: "date-time" | "time",
  timeZone?: string
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const dateOptions: Intl.DateTimeFormatOptions =
    display === "time"
      ? {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        }
      : {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        };

  return new Intl.DateTimeFormat(undefined, {
    ...dateOptions,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export default function LocalDateTime({
  value,
  display = "date-time",
}: LocalDateTimeProps) {
  // UTC is a deterministic server/hydration fallback. Immediately after
  // hydration the browser replaces it with the viewer's actual local zone.
  const [text, setText] = useState(() =>
    formatInTimeZone(value, display, "UTC")
  );

  useEffect(() => {
    setText(formatInTimeZone(value, display));
  }, [display, value]);

  const parsed = new Date(value);
  const dateTime = Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString();

  return <time dateTime={dateTime}>{text}</time>;
}
