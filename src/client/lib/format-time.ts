import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("zh-cn");

const SHANGHAI_TIMEZONE = "Asia/Shanghai";

export function formatRelative(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const time = dayjs(value);
  return time.isValid() ? time.fromNow() : "—";
}

export function formatExact(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const time = dayjs(value);
  return time.isValid() ? `${time.tz(SHANGHAI_TIMEZONE).format("YYYY-MM-DD HH:mm:ss")} Asia/Shanghai` : "—";
}
