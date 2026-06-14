import type {
  Employee,
  InventoryCheck,
  InventoryCheckLine,
  Item,
  Location,
  Stock,
  Transaction,
} from "../src/types/inventory";

export function mapItemRow(row: Record<string, unknown>): Item {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    sku: String(row.sku ?? ""),
    type: String(row.type ?? ""),
    price: Number(row.price ?? 0),
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    createdAt: row.created_at ?? null,
    lowStockThreshold:
      row.low_stock_threshold != null && row.low_stock_threshold !== ""
        ? Number(row.low_stock_threshold)
        : undefined,
    priceByBox:
      row.price_by_box != null && row.price_by_box !== ""
        ? Number(row.price_by_box)
        : undefined,
  };
}

export function mapLocationRow(row: Record<string, unknown>): Location {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    locationNumber: String(row.location_number ?? ""),
    createdAt: row.created_at ?? null,
  };
}

export function mapEmployeeRow(row: Record<string, unknown>): Employee {
  let permissions = { canCheckIn: true, canCheckOut: true, canInventoryCheck: true };
  if (row.permissions != null && String(row.permissions).trim() !== "") {
    try {
      permissions = { ...permissions, ...JSON.parse(String(row.permissions)) };
    } catch {
      /* keep defaults */
    }
  }
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    pin: String(row.pin ?? ""),
    role: row.role === "admin" ? "admin" : "staff",
    email: row.email ? String(row.email) : undefined,
    notificationsEnabled: Boolean(row.notifications_enabled),
    permissions,
  };
}

export function mapStockRow(row: Record<string, unknown>): Stock {
  return {
    itemId: String(row.item_id),
    locationId: String(row.location_id),
    quantity: Number(row.quantity ?? 0),
    lastUpdated: row.last_updated ?? null,
    batchNumber: row.batch_number ? String(row.batch_number) : undefined,
    expiryDate: row.expiry_date ? String(row.expiry_date) : undefined,
  };
}

export function mapTransactionRow(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    locationId: String(row.location_id),
    employeeId: String(row.employee_id),
    type: row.type === "IN" ? "IN" : "OUT",
    quantity: Number(row.quantity ?? 0),
    timestamp: row.timestamp ?? null,
    batchNumber: row.batch_number ? String(row.batch_number) : undefined,
    expiryDate: row.expiry_date ? String(row.expiry_date) : undefined,
  };
}

export function mapInventoryCheckRow(row: Record<string, unknown>): InventoryCheck {
  return {
    id: String(row.id),
    locationId: String(row.location_id),
    employeeId: String(row.employee_id),
    timestamp: String(row.timestamp ?? ""),
  };
}

export function mapInventoryCheckLineRow(
  row: Record<string, unknown>
): InventoryCheckLine {
  return {
    id: String(row.id),
    checkId: String(row.check_id),
    itemId: String(row.item_id),
    itemName: String(row.item_name ?? ""),
    quantity: Number(row.quantity ?? 0),
  };
}

export function stockRowId(
  itemId: string,
  locationId: string,
  batchNumber?: string | null
) {
  const bn = batchNumber?.trim();
  return bn ? `${itemId}_${locationId}_${bn}` : `${itemId}_${locationId}`;
}
