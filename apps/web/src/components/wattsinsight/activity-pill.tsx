import type { IntervalsActivityDto } from "@wattsinsight/contracts/wire";

function formatDuration(seconds: number | null) {
  if (!seconds) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDistance(meters: number | null) {
  if (!meters) return null;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function ActivityPill({ activity }: { activity: IntervalsActivityDto }) {
  const distance = formatDistance(activity.distanceMeters);

  return (
    <div className="rounded-md border bg-background/80 px-2 py-1 text-xs shadow-sm">
      <div className="truncate font-medium">{activity.name ?? activity.type ?? "Activity"}</div>
      <div className="text-muted-foreground">
        {[activity.type, formatDuration(activity.movingTimeSeconds), distance].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}
