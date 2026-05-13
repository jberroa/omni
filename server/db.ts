import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

export function initDb(): Database.Database {
  const dbPath =
    process.env.DATABASE_PATH || path.join(process.cwd(), "data", "omnistock.db");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const seedPath =
    process.env.DATABASE_SEED_PATH ||
    path.join(process.cwd(), "firestore_export.db");
  if (!fs.existsSync(dbPath) && fs.existsSync(seedPath)) {
    fs.copyFileSync(seedPath, dbPath);
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  const itemCols = db
    .prepare("PRAGMA table_info(items)")
    .all() as { name: string }[];
  const itemNames = new Set(itemCols.map((c) => c.name));
  if (!itemNames.has("low_stock_threshold")) {
    db.exec(`ALTER TABLE items ADD COLUMN low_stock_threshold REAL`);
  }
  if (!itemNames.has("price_by_box")) {
    db.exec(`ALTER TABLE items ADD COLUMN price_by_box REAL`);
  }

  const empCols = db
    .prepare("PRAGMA table_info(employees)")
    .all() as { name: string }[];
  const empNames = new Set(empCols.map((c) => c.name));
  if (!empNames.has("email")) {
    db.exec(`ALTER TABLE employees ADD COLUMN email TEXT`);
  }
  if (!empNames.has("notifications_enabled")) {
    db.exec(
      `ALTER TABLE employees ADD COLUMN notifications_enabled INTEGER DEFAULT 0`
    );
  }
}
