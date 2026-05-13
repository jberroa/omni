import type { Employee, Item, Location, Stock, Transaction } from "../types/inventory";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface ApiErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function handleApiError(
  err: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: ApiErrorInfo = {
    error: err instanceof Error ? err.message : String(err),
    operationType,
    path,
  };
  console.error("API Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function reqJson<T>(
  path: string,
  init?: RequestInit,
  operationType: OperationType = OperationType.GET,
  errPath: string | null = null
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string>),
      },
    });
  } catch (e) {
    handleApiError(e, operationType, errPath ?? path);
  }
  const data = await parseJson(res!);
  if (!res!.ok) {
    const msg =
      data && typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : res!.statusText;
    handleApiError(new Error(msg), operationType, errPath ?? path);
  }
  return data as T;
}

export const api = {
  getItems(): Promise<Item[]> {
    return reqJson<Item[]>("/api/items", undefined, OperationType.LIST, "items");
  },

  createItem(body: Partial<Item> & { name: string; sku: string }): Promise<Item> {
    return reqJson<Item>("/api/items", { method: "POST", body: JSON.stringify(body) }, OperationType.CREATE, "items");
  },

  updateItem(id: string, body: Partial<Item>): Promise<Item> {
    return reqJson<Item>(`/api/items/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }, OperationType.UPDATE, `items/${id}`);
  },

  deleteItem(id: string): Promise<void> {
    return reqJson(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" }, OperationType.DELETE, `items/${id}`);
  },

  importItems(items: Array<{ name: string; sku: string; type?: string; price?: number }>): Promise<{ created: number }> {
    return reqJson("/api/items/import", { method: "POST", body: JSON.stringify({ items }) }, OperationType.CREATE, "items/import");
  },

  getLocations(): Promise<Location[]> {
    return reqJson<Location[]>("/api/locations", undefined, OperationType.LIST, "locations");
  },

  getLocation(id: string): Promise<Location> {
    return reqJson<Location>(`/api/locations/${encodeURIComponent(id)}`, undefined, OperationType.GET, `locations/${id}`);
  },

  getLocationByNumber(locationNumber: string): Promise<Location> {
    return reqJson<Location>(`/api/locations/by-number?locationNumber=${encodeURIComponent(locationNumber)}`, undefined, OperationType.GET, "locations/by-number");
  },

  createLocation(body: { name: string; locationNumber?: string }): Promise<Location> {
    return reqJson<Location>("/api/locations", { method: "POST", body: JSON.stringify(body) }, OperationType.CREATE, "locations");
  },

  updateLocation(id: string, body: Partial<Location>): Promise<Location> {
    return reqJson<Location>(`/api/locations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }, OperationType.UPDATE, `locations/${id}`);
  },

  deleteLocation(id: string): Promise<void> {
    return reqJson(`/api/locations/${encodeURIComponent(id)}`, { method: "DELETE" }, OperationType.DELETE, `locations/${id}`);
  },

  importLocations(locations: Array<{ name: string; locationNumber?: string }>): Promise<{ created: number }> {
    return reqJson("/api/locations/import", { method: "POST", body: JSON.stringify({ locations }) }, OperationType.CREATE, "locations/import");
  },

  getEmployees(): Promise<Employee[]> {
    return reqJson<Employee[]>("/api/employees", undefined, OperationType.LIST, "employees");
  },

  async getEmployeeByPin(pin: string): Promise<Employee | null> {
    const res = await fetch(
      `/api/employees/by-pin?pin=${encodeURIComponent(pin)}`
    );
    if (res.status === 404) return null;
    const data = await parseJson(res);
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && data !== null && "error" in data
          ? String((data as { error: unknown }).error)
          : res.statusText;
      handleApiError(new Error(msg), OperationType.GET, "employees/by-pin");
    }
    return data as Employee;
  },

  createEmployee(body: Omit<Employee, "id"> & { id?: string }): Promise<Employee> {
    return reqJson<Employee>("/api/employees", { method: "POST", body: JSON.stringify(body) }, OperationType.CREATE, "employees");
  },

  updateEmployee(id: string, body: Partial<Employee>): Promise<Employee> {
    return reqJson<Employee>(`/api/employees/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }, OperationType.UPDATE, `employees/${id}`);
  },

  deleteEmployee(id: string): Promise<void> {
    return reqJson(`/api/employees/${encodeURIComponent(id)}`, { method: "DELETE" }, OperationType.DELETE, `employees/${id}`);
  },

  getStock(params?: { itemId?: string; locationId?: string }): Promise<Stock[]> {
    const q = new URLSearchParams();
    if (params?.itemId) q.set("itemId", params.itemId);
    if (params?.locationId) q.set("locationId", params.locationId);
    const suffix = q.toString() ? `?${q}` : "";
    return reqJson<Stock[]>(`/api/stock${suffix}`, undefined, OperationType.LIST, "stock");
  },

  getTransactions(params?: { itemId?: string; limit?: number }): Promise<Transaction[]> {
    const q = new URLSearchParams();
    if (params?.itemId) q.set("itemId", params.itemId);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q}` : "";
    return reqJson<Transaction[]>(`/api/transactions${suffix}`, undefined, OperationType.LIST, "transactions");
  },

  checkout(body: {
    locationId: string;
    employeeId: string;
    type: "IN" | "OUT";
    lines: Array<{
      itemId: string;
      quantity: number;
      batchNumber?: string;
      expiryDate?: string;
    }>;
  }): Promise<{ ok: boolean }> {
    return reqJson("/api/checkout", { method: "POST", body: JSON.stringify(body) }, OperationType.WRITE, "checkout");
  },
};
