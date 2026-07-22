import type { IntervalsActivityDto } from "@wattsinsight/contracts/wire";

import { ActivityPill } from "./activity-pill";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthDays(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const last = new Date(Date.UTC(year, monthIndex, 0));
  const days: Date[] = [];

  for (let day = 1; day <= last.getUTCDate(); day += 1) {
    days.push(new Date(Date.UTC(year, monthIndex - 1, day)));
  }

  const leadingBlanks = (first.getUTCDay() + 6) % 7;
  return { days, leadingBlanks };
}

export function CalendarMonth({ activities, month }: { activities: IntervalsActivityDto[]; month: string }) {
  const { days, leadingBlanks } = monthDays(month);
  const activitiesByDay = new Map<string, IntervalsActivityDto[]>();

  for (const activity of activities) {
    const day = activity.startDateLocal.slice(0, 10);
    activitiesByDay.set(day, [...(activitiesByDay.get(day) ?? []), activity]);
  }

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
      {Array.from({ length: leadingBlanks }).map((_, index) => (
        <div key={`blank-${index}`} className="min-h-32 bg-muted/30" />
      ))}
      {days.map((day) => {
        const key = isoDate(day);
        const dayActivities = activitiesByDay.get(key) ?? [];

        return (
          <div key={key} className="min-h-32 bg-card p-2">
            <div className="mb-2 text-sm font-medium">{day.getUTCDate()}</div>
            <div className="space-y-1">
              {dayActivities.map((activity) => <ActivityPill key={activity.id} activity={activity} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function getMonthRange(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 0));

  return {
    start: isoDate(start),
    end: isoDate(end),
  };
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
