export interface Item {
  id: string;
  name: string;
  price: number;
  type: string;
  sku: string;
  priceByBox?: number;
  imageUrl?: string;
  createdAt: any;
  lowStockThreshold?: number;
}

export interface Location {
  id: string;
  name: string;
  locationNumber: string; // Human-readable ID for manual login
  createdAt: any;
}

export interface Stock {
  itemId: string;
  locationId: string;
  quantity: number;
  lastUpdated: any;
  batchNumber?: string;
  expiryDate?: string;
}

export interface Transaction {
  id: string;
  itemId: string;
  locationId: string;
  employeeId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  timestamp: any;
  itemName?: string;
  locationName?: string;
  employeeName?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface Employee {
  id: string;
  name: string;
  pin: string;
  role: 'admin' | 'staff';
  email?: string;
  notificationsEnabled?: boolean;
  permissions?: {
    canCheckIn: boolean;
    canCheckOut: boolean;
  };
}
