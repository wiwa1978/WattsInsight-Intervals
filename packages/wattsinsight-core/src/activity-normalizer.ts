type IntervalsActivityPayload = Record<string, unknown>;

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numericStringOrNull(value: unknown) {
  return typeof value === "number" ? String(value) : null;
}

export function normalizeIntervalsActivity(payload: IntervalsActivityPayload) {
  const id = payload.id;
  const startDate = payload.start_date_local ?? payload.start_date;

  if (typeof id !== "string" && typeof id !== "number") {
    throw new Error("Intervals activity is missing id");
  }

  if (typeof startDate !== "string") {
    throw new Error("Intervals activity is missing start date");
  }

  return {
    intervalsActivityId: String(id),
    name: stringOrNull(payload.name),
    type: stringOrNull(payload.type),
    startDateLocal: new Date(startDate),
    movingTimeSeconds: numberOrNull(payload.moving_time),
    elapsedTimeSeconds: numberOrNull(payload.elapsed_time),
    distanceMeters: numericStringOrNull(payload.distance),
    averageHr: numberOrNull(payload.average_heartrate),
    rawPayload: payload,
  };
}
