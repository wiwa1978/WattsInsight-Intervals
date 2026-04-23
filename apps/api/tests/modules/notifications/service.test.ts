import { describe, expect, it, vi } from "vitest";

import { createNotificationsService } from "../../../src/modules/notifications/service";

describe("createNotificationsService", () => {
  // Verifies default notification properties are applied when optional fields are omitted.
  it("creates a notification with defaults", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "n1", type: "info" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });

    const service = createNotificationsService({ db: { insert } as any });

    const created = await service.createNotification({
      userId: "u1",
      title: "Title",
      message: "Message",
      category: "system",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        showAsBanner: false,
      }),
    );
    expect(created).toEqual({ id: "n1", type: "info" });
  });

  // Verifies broadcast notifications fan out once per existing user.
  it("sendNotificationToAllUsers fan-outs to all users", async () => {
    const service = createNotificationsService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([{ id: "u1" }, { id: "u2" }, { id: "u3" }]),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      } as any,
    });

    const count = await service.sendNotificationToAllUsers({ title: "Hi", message: "Body" });
    expect(count).toBe(3);
  });

  // Verifies targeted notifications avoid insert calls when no recipients are provided.
  it("sendNotificationToUsers handles empty input", async () => {
    const insert = vi.fn();
    const service = createNotificationsService({ db: { insert } as any });

    const count = await service.sendNotificationToUsers({
      userIds: [],
      title: "A",
      message: "B",
    });

    expect(count).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  // Verifies targeted notifications deduplicate recipients before insert.
  it("sendNotificationToUsers deduplicates duplicate recipients", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const service = createNotificationsService({ db: { insert } as any });

    const count = await service.sendNotificationToUsers({
      userIds: ["u1", "u1", "u2", "  u2  "],
      title: "A",
      message: "B",
    });

    expect(count).toBe(2);
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ userId: "u1" }),
      expect.objectContaining({ userId: "u2" }),
    ]);
  });

  // Verifies unread count returns zero when no aggregate row exists.
  it("unreadCount defaults to 0 when no row returned", async () => {
    const service = createNotificationsService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any,
    });

    await expect(service.unreadCount("u1")).resolves.toBe(0);
  });

  // Verifies admin notification listing returns the reduced response shape.
  it("getAllNotifications limits and redacts admin response shape", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "n1" }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ orderBy });
    const select = vi.fn().mockReturnValue({ from });

    const service = createNotificationsService({ db: { select } as any });
    const result = await service.getAllNotifications(999);

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.anything(),
        title: expect.anything(),
        createdAt: expect.anything(),
      }),
    );
    expect(limit).toHaveBeenCalledWith(100);
    expect(result).toEqual([{ id: "n1" }]);
  });
});
