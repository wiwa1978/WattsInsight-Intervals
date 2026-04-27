import { describe, expect, it, vi } from "vitest";

import { auditEntries } from "@platform/platform-db";

import { createAuditService } from "../../../src/modules/audit/service";

describe("createAuditService", () => {
  it("records sanitized audit entries", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "audit-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const db = { insert: vi.fn().mockReturnValue({ values }) };
    const service = createAuditService({ db } as any);

    const result = await service.recordAuditEntry({
      action: "admin.user.set_role",
      outcome: "success",
      actorId: "actor-1",
      targetType: "user",
      targetId: "user-1",
      requestId: "req-1",
      ip: "127.0.0.1",
      userAgent: "Vitest",
      before: { role: "user", password: "secret" },
      after: { role: "admin", token: "abc" },
      metadata: { authorization: "Bearer abc.def.ghi", note: "ok" },
    });

    expect(result).toEqual({ success: true, entry: { id: "audit-1" } });
    expect(db.insert).toHaveBeenCalledWith(auditEntries);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.set_role",
      outcome: "success",
      actorId: "actor-1",
      targetType: "user",
      targetId: "user-1",
      requestId: "req-1",
      before: { role: "user", password: "[redacted]" },
      after: { role: "admin", token: "[redacted]" },
      metadata: { authorization: "[redacted]", note: "ok" },
    }));
  });

  it("does not throw when best-effort audit recording fails", async () => {
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("db down")),
        }),
      }),
    };
    const logger = { warn: vi.fn() };
    const service = createAuditService({ db, logger } as any);

    await expect(service.recordAuditEntry({
      action: "notification.send_all",
      outcome: "success",
      metadata: { sentCount: 1 },
    })).resolves.toEqual({ success: false, error: "Failed to record audit entry" });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("lists audit entries by action prefix", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "audit-1", action: "notification.send_all" }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const db = { select: vi.fn().mockReturnValue({ from }) };
    const service = createAuditService({ db } as any);

    await expect(service.listAuditEntries({ actionPrefix: "notification.", limit: 500 })).resolves.toEqual([
      { id: "audit-1", action: "notification.send_all" },
    ]);
    expect(limit).toHaveBeenCalledWith(100);
  });
});
