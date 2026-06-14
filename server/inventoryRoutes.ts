import type { Express, Request, Response } from "express";
import type Database from "better-sqlite3";
import type nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import {
  mapItemRow,
  mapLocationRow,
  mapEmployeeRow,
  mapStockRow,
  mapTransactionRow,
  mapInventoryCheckRow,
  mapInventoryCheckLineRow,
  mapInventoryLevelRow,
  stockRowId,
} from "./mappers";
import { sendInventoryAlertEmail } from "./mail";

function nowIso() {
  return new Date().toISOString();
}

export function registerInventoryRoutes(
  app: Express,
  db: Database.Database,
  transporter: nodemailer.Transporter
) {
  const canSendMail = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

  app.get("/api/items", (_req: Request, res: Response) => {
    try {
      const rows = db
        .prepare(
          `SELECT * FROM items ORDER BY COALESCE(name, '') COLLATE NOCASE`
        )
        .all() as Record<string, unknown>[];
      res.json(rows.map(mapItemRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list items" });
    }
  });

  app.post("/api/items", (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const id = randomUUID();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO items (id, name, sku, type, price, image_url, created_at, low_stock_threshold, price_by_box)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        String(b.name ?? "").trim(),
        String(b.sku ?? "").trim(),
        String(b.type ?? "").trim(),
        Number(b.price ?? 0),
        b.imageUrl != null && b.imageUrl !== "" ? String(b.imageUrl) : null,
        ts,
        b.lowStockThreshold != null && b.lowStockThreshold !== ""
          ? Number(b.lowStockThreshold)
          : null,
        b.priceByBox != null && b.priceByBox !== ""
          ? Number(b.priceByBox)
          : null
      );
      const row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Record<
        string,
        unknown
      >;
      res.status(201).json(mapItemRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create item" });
    }
  });

  app.patch("/api/items/:id", (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const b = req.body || {};
      const cur = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!cur) return res.status(404).json({ error: "Not found" });

      const name =
        b.name !== undefined ? String(b.name).trim() : String(cur.name ?? "");
      const sku =
        b.sku !== undefined ? String(b.sku).trim() : String(cur.sku ?? "");
      const type =
        b.type !== undefined ? String(b.type).trim() : String(cur.type ?? "");
      const price =
        b.price !== undefined ? Number(b.price) : Number(cur.price ?? 0);
      const imageUrl =
        b.imageUrl !== undefined
          ? b.imageUrl && String(b.imageUrl) !== ""
            ? String(b.imageUrl)
            : null
          : (cur.image_url as string | null);
      const low = b.lowStockThreshold;
      const lowStock =
        low !== undefined
          ? low !== "" && low != null
            ? Number(low)
            : null
          : (cur.low_stock_threshold as number | null);
      const pb = b.priceByBox;
      const priceBy =
        pb !== undefined
          ? pb !== "" && pb != null
            ? Number(pb)
            : null
          : (cur.price_by_box as number | null);

      db.prepare(
        `UPDATE items SET name = ?, sku = ?, type = ?, price = ?, image_url = ?, low_stock_threshold = ?, price_by_box = ?
         WHERE id = ?`
      ).run(name, sku, type, price, imageUrl, lowStock, priceBy, id);
      const row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Record<
        string,
        unknown
      >;
      res.json(mapItemRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  app.delete("/api/items/:id", (req: Request, res: Response) => {
    try {
      const r = db.prepare(`DELETE FROM items WHERE id = ?`).run(req.params.id);
      if (r.changes === 0) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  app.post("/api/items/import", (req: Request, res: Response) => {
    try {
      const items = (req.body?.items ?? []) as Array<{
        name?: string;
        sku?: string;
        type?: string;
        price?: number;
      }>;
      const ts = nowIso();
      const insert = db.prepare(
        `INSERT INTO items (id, name, sku, type, price, image_url, created_at, low_stock_threshold, price_by_box)
         VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL)`
      );
      const txn = db.transaction(() => {
        let n = 0;
        for (const it of items) {
          const name = String(it.name ?? "").trim();
          const sku = String(it.sku ?? "").trim();
          if (!name || !sku) continue;
          insert.run(
            randomUUID(),
            name,
            sku,
            String(it.type ?? "General").trim(),
            Number(it.price ?? 0),
            ts
          );
          n++;
        }
        return n;
      });
      res.json({ created: txn() });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Import failed" });
    }
  });

  app.get("/api/locations", (_req: Request, res: Response) => {
    try {
      const rows = db
        .prepare(`SELECT * FROM locations ORDER BY COALESCE(name, '') COLLATE NOCASE`)
        .all() as Record<string, unknown>[];
      res.json(rows.map(mapLocationRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list locations" });
    }
  });

  app.get("/api/locations/by-number", (req: Request, res: Response) => {
    try {
      const q = String(
        req.query.locationNumber ?? req.query.q ?? ""
      ).trim();
      if (!q) return res.status(400).json({ error: "locationNumber required" });

      let row = db
        .prepare(`SELECT * FROM locations WHERE location_number = ? LIMIT 1`)
        .get(q) as Record<string, unknown> | undefined;

      if (!row) {
        row = db
          .prepare(`SELECT * FROM locations WHERE id = ? LIMIT 1`)
          .get(q) as Record<string, unknown> | undefined;
      }

      if (!row) {
        const nameMatches = db
          .prepare(
            `SELECT * FROM locations WHERE lower(trim(name)) = lower(trim(?))`
          )
          .all(q) as Record<string, unknown>[];
        if (nameMatches.length === 1) {
          row = nameMatches[0];
        } else if (nameMatches.length > 1) {
          return res.status(409).json({
            error:
              "Multiple locations share that name. Use the location number (e.g. #4121) shown in Locations.",
          });
        }
      }

      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(mapLocationRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Lookup failed" });
    }
  });

  app.get("/api/locations/:id", (req: Request, res: Response) => {
    try {
      const row = db
        .prepare(`SELECT * FROM locations WHERE id = ?`)
        .get(req.params.id) as Record<string, unknown> | undefined;
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(mapLocationRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Lookup failed" });
    }
  });

  app.post("/api/locations", (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const id = randomUUID();
      const ts = nowIso();
      const num =
        b.locationNumber != null && String(b.locationNumber).trim() !== ""
          ? String(b.locationNumber).trim()
          : String(Math.floor(1000 + Math.random() * 9000));
      db.prepare(
        `INSERT INTO locations (id, name, location_number, created_at) VALUES (?, ?, ?, ?)`
      ).run(id, String(b.name ?? "").trim(), num, ts);
      const row = db.prepare(`SELECT * FROM locations WHERE id = ?`).get(id) as Record<
        string,
        unknown
      >;
      res.status(201).json(mapLocationRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  app.patch("/api/locations/:id", (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const b = req.body || {};
      const cur = db.prepare(`SELECT * FROM locations WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!cur) return res.status(404).json({ error: "Not found" });
      const name =
        b.name !== undefined ? String(b.name).trim() : String(cur.name ?? "");
      const locNum =
        b.locationNumber !== undefined
          ? String(b.locationNumber).trim()
          : String(cur.location_number ?? "");
      db.prepare(
        `UPDATE locations SET name = ?, location_number = ? WHERE id = ?`
      ).run(name, locNum, id);
      const row = db.prepare(`SELECT * FROM locations WHERE id = ?`).get(id) as Record<
        string,
        unknown
      >;
      res.json(mapLocationRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  app.delete("/api/locations/:id", (req: Request, res: Response) => {
    try {
      const r = db.prepare(`DELETE FROM locations WHERE id = ?`).run(req.params.id);
      if (r.changes === 0) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  app.post("/api/locations/import", (req: Request, res: Response) => {
    try {
      const locs = (req.body?.locations ?? []) as Array<{
        name?: string;
        locationNumber?: string;
      }>;
      const ts = nowIso();
      const insert = db.prepare(
        `INSERT INTO locations (id, name, location_number, created_at) VALUES (?, ?, ?, ?)`
      );
      const txn = db.transaction(() => {
        let n = 0;
        for (const L of locs) {
          const name = String(L.name ?? "").trim();
          if (!name) continue;
          const num =
            L.locationNumber != null && String(L.locationNumber).trim() !== ""
              ? String(L.locationNumber).trim()
              : String(Math.floor(1000 + Math.random() * 9000));
          insert.run(randomUUID(), name, num, ts);
          n++;
        }
        return n;
      });
      res.json({ created: txn() });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Import failed" });
    }
  });

  app.get("/api/employees", (_req: Request, res: Response) => {
    try {
      const rows = db
        .prepare(`SELECT * FROM employees ORDER BY COALESCE(name, '') COLLATE NOCASE`)
        .all() as Record<string, unknown>[];
      res.json(rows.map(mapEmployeeRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list employees" });
    }
  });

  app.get("/api/employees/by-pin", (req: Request, res: Response) => {
    try {
      const pin = String(req.query.pin ?? "").trim();
      if (pin.length !== 4) return res.status(400).json({ error: "Invalid pin" });
      const row = db
        .prepare(`SELECT * FROM employees WHERE pin = ? LIMIT 1`)
        .get(pin) as Record<string, unknown> | undefined;
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(mapEmployeeRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Lookup failed" });
    }
  });

  app.post("/api/employees", (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const id = randomUUID();
      const perms = JSON.stringify(
        b.permissions ?? { canCheckIn: true, canCheckOut: true }
      );
      db.prepare(
        `INSERT INTO employees (id, name, pin, role, permissions, email, notifications_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        String(b.name ?? "").trim(),
        String(b.pin ?? "").trim(),
        b.role === "admin" ? "admin" : "staff",
        perms,
        b.email != null && String(b.email).trim() !== ""
          ? String(b.email).trim()
          : null,
        b.notificationsEnabled ? 1 : 0
      );
      const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Record<
        string,
        unknown
      >;
      res.status(201).json(mapEmployeeRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create employee" });
    }
  });

  app.patch("/api/employees/:id", (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const b = req.body || {};
      const cur = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!cur) return res.status(404).json({ error: "Not found" });

      const name =
        b.name !== undefined ? String(b.name).trim() : String(cur.name ?? "");
      const pin =
        b.pin !== undefined ? String(b.pin).trim() : String(cur.pin ?? "");
      const role =
        b.role !== undefined
          ? b.role === "admin"
            ? "admin"
            : "staff"
          : String(cur.role ?? "staff");
      const perms =
        b.permissions !== undefined
          ? JSON.stringify(b.permissions)
          : String(cur.permissions ?? "{}");
      const email =
        b.email !== undefined
          ? String(b.email).trim() !== ""
            ? String(b.email).trim()
            : null
          : (cur.email as string | null);
      const notif =
        b.notificationsEnabled !== undefined
          ? b.notificationsEnabled
            ? 1
            : 0
          : Number(cur.notifications_enabled ?? 0);

      db.prepare(
        `UPDATE employees SET name = ?, pin = ?, role = ?, permissions = ?, email = ?, notifications_enabled = ? WHERE id = ?`
      ).run(name, pin, role, perms, email, notif, id);
      const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Record<
        string,
        unknown
      >;
      res.json(mapEmployeeRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", (req: Request, res: Response) => {
    try {
      const r = db.prepare(`DELETE FROM employees WHERE id = ?`).run(req.params.id);
      if (r.changes === 0) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to delete employee" });
    }
  });

  app.get("/api/stock", (req: Request, res: Response) => {
    try {
      const itemId = req.query.itemId ? String(req.query.itemId) : "";
      const locationId = req.query.locationId ? String(req.query.locationId) : "";
      let rows: Record<string, unknown>[];
      if (itemId && locationId) {
        rows = db
          .prepare(
            `SELECT * FROM stock WHERE item_id = ? AND location_id = ? ORDER BY COALESCE(expiry_date, '')`
          )
          .all(itemId, locationId) as Record<string, unknown>[];
      } else if (itemId) {
        rows = db
          .prepare(`SELECT * FROM stock WHERE item_id = ?`)
          .all(itemId) as Record<string, unknown>[];
      } else if (locationId) {
        rows = db
          .prepare(`SELECT * FROM stock WHERE location_id = ?`)
          .all(locationId) as Record<string, unknown>[];
      } else {
        rows = db.prepare(`SELECT * FROM stock`).all() as Record<
          string,
          unknown
        >[];
      }
      res.json(rows.map(mapStockRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list stock" });
    }
  });

  app.get("/api/inventory-levels", (req: Request, res: Response) => {
    try {
      const itemId = req.query.itemId ? String(req.query.itemId) : "";
      const locationIdsRaw = req.query.locationIds
        ? String(req.query.locationIds)
        : req.query.locationId
          ? String(req.query.locationId)
          : "";
      const startDate = req.query.startDate ? String(req.query.startDate) : "";
      const endDate = req.query.endDate ? String(req.query.endDate) : "";

      const locationIds = locationIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (itemId) {
        conditions.push("agg.item_id = ?");
        params.push(itemId);
      }
      if (locationIds.length > 0) {
        conditions.push(
          `agg.location_id IN (${locationIds.map(() => "?").join(", ")})`
        );
        params.push(...locationIds);
      }
      if (startDate) {
        conditions.push("date(lt.timestamp) >= date(?)");
        params.push(startDate);
      }
      if (endDate) {
        conditions.push("date(lt.timestamp) <= date(?)");
        params.push(endDate);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const sql = `
        WITH stock_agg AS (
          SELECT item_id, location_id, SUM(quantity) AS quantity
          FROM stock
          GROUP BY item_id, location_id
        ),
        last_tx AS (
          SELECT item_id, location_id, type, timestamp,
            ROW_NUMBER() OVER (
              PARTITION BY item_id, location_id
              ORDER BY timestamp DESC
            ) AS rn
          FROM transactions
        )
        SELECT
          agg.item_id,
          agg.location_id,
          agg.quantity,
          lt.type AS last_transaction_type,
          lt.timestamp AS last_transaction_date,
          i.name AS item_name,
          l.name AS location_name
        FROM stock_agg agg
        JOIN items i ON i.id = agg.item_id
        JOIN locations l ON l.id = agg.location_id
        LEFT JOIN last_tx lt
          ON lt.item_id = agg.item_id
          AND lt.location_id = agg.location_id
          AND lt.rn = 1
        ${whereClause}
        ORDER BY l.name COLLATE NOCASE, i.name COLLATE NOCASE
      `;

      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
      res.json(rows.map(mapInventoryLevelRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list inventory levels" });
    }
  });

  app.get("/api/transactions", (req: Request, res: Response) => {
    try {
      const itemId = req.query.itemId ? String(req.query.itemId) : "";
      const locationId = req.query.locationId ? String(req.query.locationId) : "";
      const startDate = req.query.startDate ? String(req.query.startDate) : "";
      const endDate = req.query.endDate ? String(req.query.endDate) : "";
      const limit = Math.min(
        10000,
        Math.max(1, Number(req.query.limit ?? 5000) || 5000)
      );

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (itemId) {
        conditions.push("item_id = ?");
        params.push(itemId);
      }
      if (locationId) {
        conditions.push("location_id = ?");
        params.push(locationId);
      }
      if (startDate) {
        conditions.push("date(timestamp) >= date(?)");
        params.push(startDate);
      }
      if (endDate) {
        conditions.push("date(timestamp) <= date(?)");
        params.push(endDate);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit);

      const rows = db
        .prepare(
          `SELECT * FROM transactions ${whereClause} ORDER BY timestamp DESC LIMIT ?`
        )
        .all(...params) as Record<string, unknown>[];

      res.json(rows.map(mapTransactionRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list transactions" });
    }
  });

  app.post("/api/checkout", async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const locationId = String(b.locationId ?? "");
      const employeeId = String(b.employeeId ?? "");
      const type = b.type === "IN" ? "IN" : "OUT";
      const lines = (b.lines ?? []) as Array<{
        itemId: string;
        quantity: number;
        batchNumber?: string;
        expiryDate?: string;
      }>;

      if (!locationId || !employeeId || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: "Invalid body" });
      }

      const itemRowStmt = db.prepare(`SELECT * FROM items WHERE id = ?`);
      const notifyStmt = db.prepare(
        `SELECT * FROM employees WHERE notifications_enabled = 1 AND email IS NOT NULL AND trim(email) != ''`
      );

      const runCheckout = db.transaction(() => {
        const alerts: Array<{
          itemName: string;
          newQty: number;
          threshold: number;
        }> = [];

        for (const line of lines) {
          const itemId = String(line.itemId ?? "");
          const qty = Number(line.quantity ?? 0);
          if (!itemId || qty <= 0) continue;

          const bnRaw =
            line.batchNumber != null && String(line.batchNumber).trim() !== ""
              ? String(line.batchNumber).trim()
              : null;
          const exRaw =
            line.expiryDate != null && String(line.expiryDate).trim() !== ""
              ? String(line.expiryDate).trim()
              : null;

          const txId = randomUUID();
          const ts = nowIso();
          db.prepare(
            `INSERT INTO transactions (id, item_id, location_id, employee_id, type, quantity, batch_number, expiry_date, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            txId,
            itemId,
            locationId,
            employeeId,
            type,
            qty,
            bnRaw,
            exRaw,
            ts
          );

          const sid = stockRowId(itemId, locationId, bnRaw);
          const existing = db
            .prepare(`SELECT * FROM stock WHERE id = ?`)
            .get(sid) as Record<string, unknown> | undefined;

          let newQuantity: number;
          const delta = type === "IN" ? qty : -qty;

          if (existing) {
            newQuantity = Number(existing.quantity ?? 0) + delta;
            db.prepare(
              `UPDATE stock SET quantity = ?, last_updated = ?, batch_number = COALESCE(?, batch_number), expiry_date = COALESCE(?, expiry_date) WHERE id = ?`
            ).run(newQuantity, ts, bnRaw, exRaw, sid);
          } else {
            newQuantity = type === "IN" ? qty : -qty;
            db.prepare(
              `INSERT INTO stock (id, item_id, location_id, quantity, batch_number, expiry_date, last_updated)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(sid, itemId, locationId, newQuantity, bnRaw, exRaw, ts);
          }

          if (type === "OUT") {
            const ir = itemRowStmt.get(itemId) as Record<string, unknown> | undefined;
            const itemName = ir ? String(ir.name ?? "Item") : "Item";
            const low = ir?.low_stock_threshold;
            const threshold =
              low != null && low !== "" ? Number(low) : 10;
            if (newQuantity <= threshold) {
              alerts.push({ itemName, newQty: newQuantity, threshold });
            }
          }
        }

        return alerts;
      });

      const alerts = runCheckout();

      if (canSendMail && alerts.length > 0) {
        const notifyRows = notifyStmt.all() as Record<string, unknown>[];
        for (const a of alerts) {
          const mailType =
            a.newQty <= 0 ? ("critical_warning" as const) : ("low_stock" as const);
          for (const row of notifyRows) {
            const em = String(row.email ?? "").trim();
            if (!em) continue;
            try {
              await sendInventoryAlertEmail(
                transporter,
                em,
                mailType,
                a.itemName,
                a.newQty,
                a.threshold
              );
            } catch (err) {
              console.error("notify error", err);
            }
          }
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Checkout failed" });
    }
  });

  app.get("/api/inventory-checks", (req: Request, res: Response) => {
    try {
      const locationId = req.query.locationId
        ? String(req.query.locationId)
        : "";
      const employeeId = req.query.employeeId
        ? String(req.query.employeeId)
        : "";
      const startDate = req.query.startDate
        ? String(req.query.startDate)
        : "";
      const endDate = req.query.endDate ? String(req.query.endDate) : "";
      const limit = Math.min(
        10000,
        Math.max(1, Number(req.query.limit ?? 5000) || 5000)
      );

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (locationId) {
        conditions.push("location_id = ?");
        params.push(locationId);
      }
      if (employeeId) {
        conditions.push("employee_id = ?");
        params.push(employeeId);
      }
      if (startDate) {
        conditions.push("timestamp >= ?");
        params.push(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        conditions.push("timestamp <= ?");
        params.push(`${endDate}T23:59:59.999Z`);
      }

      const where =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit);

      const checkRows = db
        .prepare(
          `SELECT * FROM inventory_checks ${where} ORDER BY timestamp DESC LIMIT ?`
        )
        .all(...params) as Record<string, unknown>[];

      const lineStmt = db.prepare(
        `SELECT * FROM inventory_check_lines WHERE check_id = ? ORDER BY item_name COLLATE NOCASE`
      );

      const checks = checkRows.map((row) => {
        const check = mapInventoryCheckRow(row);
        const lines = (lineStmt.all(check.id) as Record<string, unknown>[]).map(
          mapInventoryCheckLineRow
        );
        return { ...check, lines };
      });

      res.json(checks);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list inventory checks" });
    }
  });

  app.post("/api/inventory-checks", (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const locationId = String(b.locationId ?? "");
      const employeeId = String(b.employeeId ?? "");
      const lines = (b.lines ?? []) as Array<{
        itemId: string;
        quantity: number;
      }>;

      if (!locationId || !employeeId || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: "Invalid body" });
      }

      const itemStmt = db.prepare(`SELECT * FROM items WHERE id = ?`);
      const checkId = randomUUID();
      const ts = nowIso();

      const runCheck = db.transaction(() => {
        db.prepare(
          `INSERT INTO inventory_checks (id, location_id, employee_id, timestamp)
           VALUES (?, ?, ?, ?)`
        ).run(checkId, locationId, employeeId, ts);

        const insertLine = db.prepare(
          `INSERT INTO inventory_check_lines (id, check_id, item_id, item_name, quantity)
           VALUES (?, ?, ?, ?, ?)`
        );

        for (const line of lines) {
          const itemId = String(line.itemId ?? "");
          const qty = Number(line.quantity ?? 0);
          if (!itemId) continue;
          if (qty < 0) {
            throw new Error("Negative quantity not allowed");
          }

          const itemRow = itemStmt.get(itemId) as
            | Record<string, unknown>
            | undefined;
          const itemName = itemRow ? String(itemRow.name ?? "Unknown Item") : "Unknown Item";

          insertLine.run(randomUUID(), checkId, itemId, itemName, qty);
        }
      });

      runCheck();
      res.json({ ok: true, id: checkId });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Inventory check failed";
      res.status(500).json({ error: msg });
    }
  });
}
