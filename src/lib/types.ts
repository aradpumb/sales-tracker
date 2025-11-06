export type PaymentStatus = "Paid" | "Pending" | "Overdue";

export type SalesRecord = {
  id: string;
  date: string; // ISO or original string for CSV
  salesperson: string; // "Sales Incharge"
  customer: string;
  machineModel: string; // kept for backward compatibility (may be empty)
  purchasedPrice: number; // unit purchase price
  soldPrice: number; // unit sales price
  additionalRevenue: number;
  quantity: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  remarks?: string;

  // Optional extras aligned with sale model
  invoiceNumber?: string;
  vat?: number;
  purchasedDate?: string; // "Purchase Date" (original format allowed)
  totalPurchase?: number;
  totalPrice?: number;
  transportFee?: number; // legacy
  additionalCost?: number; // legacy misc cost
  installationCost?: number; // "Unit Installation Charge"
  commission?: number;
  procurementPerson?: string; // "Procurement Incharge"
  revenue?: number;
  billNo?: string;
  description?: string; // "Description"
  hostingRate?: number; // "Hosting Rate"
  receiptDate?: string; // "Receipt Date"
  receiptAccount?: string; // "Receipt Account"
  unitPurchasePrice?: number; // alias of purchasedPrice
  unitSalesPrice?: number; // alias of soldPrice
  pickupCost?: number; // "Pickup Cost"
  courierCharge?: number; // "Courier Charge"
  deliveryDate?: string; // "Delivery Date"
  pluginDate?: string; // "Plug-in Date"
  purchaseBill?: string;
  vendor?: string; // "Vendor"
  vatApplicable?: boolean;
  courierLink?: string;
};

export type ExpenseRecord = {
  id: string;
  date: string; // ISO
  salesperson: string;
  customer?: string; // new column on expense table
  amount: number;
  category: string;
  remarks?: string;
};

/* Admin master data types */
export type SalesPerson = {
  id: number;
  name: string;
  phone: string;
  joining_date: string; // ISO date
  salary: number; // decimal
  monthly_allowance: number; // decimal
};

export type CustomerInfo = {
  id: number;
  name: string;
  phone: string;
  address: string;
  created_at: string; // ISO date
};

export type MachineModel = {
  id: number;
  model_name: string;
  hashrate: number; // decimal
  power: number; // decimal
  price: number; // decimal
  algorithm: string; // enum-like
  coin: string; // enum-like
};

