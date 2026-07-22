import { describe, expect, it } from "vitest";

import { normalizeIntervalsActivity } from "../src/activity-normalizer";

describe("activity normalization", () => {
  it("normalizes an Intervals.icu payload for storage", () => {
    const normalized = normalizeIntervalsActivity({
      id: "abc123",
      name: "Morning Ride",
      type: "Ride",
      start_date_local: "2026-07-20T07:30:00+02:00",
      moving_time: 3600,
      elapsed_time: 3900,
      distance: 25000,
      average_heartrate: 145,
    });

    expect(normalized).toEqual({
      intervalsActivityId: "abc123",
      name: "Morning Ride",
      type: "Ride",
      startDateLocal: new Date("2026-07-20T07:30:00+02:00"),
      movingTimeSeconds: 3600,
      elapsedTimeSeconds: 3900,
      distanceMeters: "25000",
      averageHr: 145,
      rawPayload: expect.any(Object),
    });
  });
});
