import { ExpenseRecord, SalesRecord } from "./types";

function id() {
  return Math.random().toString(36).slice(2, 10);
}

// Safely parse many date formats to ISO; returns undefined if unparseable
function toIsoDate(value: any): string | undefined {
  if (!value && value !== 0) return undefined;

  // Excel serial date (days since 1899-12-30)
  const numericLike = typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value).trim());
  if (numericLike) {
    const serial = Number(value);
    if (isFinite(serial) && serial > 0) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  const s = String(value).trim();
  if (!s) return undefined;

  // dd/mm/yyyy or mm/dd/yyyy with / or -
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;

    // If first part > 12 => treat as DD/MM; if second > 12 => MM/DD; otherwise default to DD/MM
    let day: number, month: number;
    if (a > 12 && b <= 12) {
      day = a; month = b;
    } else if (b > 12 && a <= 12) {
      day = b; month = a;
    } else {
      day = a; month = b;
    }
    const d = new Date(Date.UTC(y, month - 1, day));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Try native parse (handles ISO and many locale formats)
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  return undefined;
}

// Only extract known sale fields; ignore others
export function mapSalesRows(rows: Record<string, any>[]): SalesRecord[] {
  // helpers to sanitize numeric strings (remove thousands separators)
  const toNum = (v: any): number => {
    if (v == null || v === "") return 0;
    const n = parseFloat(String(v).replace(/,/g, "").trim());
    return isFinite(n) ? n : 0;
  };
  const toOptNum = (v: any): number | undefined => {
    if (v == null || v === "") return undefined;
    const n = parseFloat(String(v).replace(/,/g, "").trim());
    return isFinite(n) ? n : undefined;
  };
  const toBool = (v: any): boolean | undefined => {
    if (v == null || v === "") return undefined;
    const s = String(v).trim().toLowerCase();
    if (["y", "yes", "true", "1", "a", "applicable"].includes(s)) return true;
    if (["n", "no", "false", "0", "na", "not applicable", "non-applicable"].includes(s)) return false;
    return undefined;
  };

  return rows
    .map((r) => {
      // Support common header variants (legacy + new)
      const salesDate =
        r["Sales Date"] || r.date || r.Date || r.sales_date || r["Transaction Date"];
      const salesperson =
        r["Sales Incharge"] || r.salesperson || r.Salesperson || r.SalesPerson || r["Sales Person"];
      const customer = r.Customer ?? r.customer ?? r["Customer Name"] ?? r.Client;
      const description = r.Description ?? r.description ?? "";

      // New numeric fields
      const unitPurchasePrice =
        toOptNum(r["Unit Purchase Price"] ?? r.unitPurchasePrice ?? r.purchased_price ?? r.purchasedPrice);
      const unitSalesPrice =
        toOptNum(r["Unit Sales Price"] ?? r.unitSalesPrice ?? r.sold_price ?? r.soldPrice);
      const unitInstallationCharge =
        toOptNum(r["Unit Installation Charge"] ?? r.unitInstallationCharge ?? r.installation_cost);
      const hostingRate = toOptNum(r["Hosting Rate"] ?? r.hostingRate);
      const quantity = toNum(r["Quantity"] ?? r.quantity ?? r["Qty"]);
      const billNo = r["Bill No."] ?? r.billNo ?? r["Bill No"] ?? r["Bill Number"] ?? null;

      const additionalRevenue = toOptNum(
        r["Additional Revenue"] ?? r.additionalRevenue ?? r.additional_revenue
      ) ?? 0;

      const receiptDate = r["Receipt Date"] ?? r.receiptDate ?? undefined;
      const receiptAccount = r["Receipt Account"] ?? r.receiptAccount ?? undefined;
      const invoiceNumberRaw = r["Invoice Number"] ?? r.invoiceNumber ?? r.invoice_number ?? null;

      const procurementPerson =
        r["Procurement Incharge"] ?? r.procurementIncharge ?? r["Procurement Person"] ?? r.procurement_person ?? r.procurementPerson ?? null;

      const vat = toOptNum(r.vat ?? r.VAT);
      const purchasedDateRaw = r["Purchase Date"] ?? r.purchasedDate ?? r.purchased_date ?? null;
      const pickupCost = toOptNum(r["Pickup Cost"] ?? r.pickupCost);
      const courierCharge = toOptNum(r["Courier Charge"] ?? r.courierCharge);
      const commission = toOptNum(r["Commission"] ?? r.commission ?? r.Commission);

      const deliveryDate = r["Delivery Date"] ?? r.deliveryDate ?? undefined;
      const pluginDate = r["Plug-in Date"] ?? r.pluginDate ?? undefined;

      const vendor = r["Vendor"] ?? r.vendor ?? r.vendor ?? r.Supplier ?? null;

      // Legacy/compatibility fields
      const machineModel = r.machineModel || r["Machine Model"] || r["Machine"] || r["Model"] || r["Description"] || "";

      const totalAmountRaw = r.totalAmount ?? r["Total Amount"] ?? r.Total ?? "";
      const defaultTotal =
        ((unitSalesPrice ?? 0) + 0) * (isFinite(quantity) ? quantity : 1) + (additionalRevenue ?? 0);
      const totalAmount = totalAmountRaw ? toNum(totalAmountRaw) : defaultTotal;


      const remarks = r.Remarks ?? r.remarks ?? "";

      if (!salesDate || !salesperson) return null;

      // Fall back to legacy names when new ones not provided
      const purchasedPrice = unitPurchasePrice ?? toNum(r.purchasedPrice ?? r["Purchased Price"] ?? r.purchased_price);
      const soldPrice = unitSalesPrice ?? toNum(r.soldPrice ?? r["Sold Price"] ?? r.sold_price);
      const installationCost = unitInstallationCharge ?? toOptNum(r["Installation Cost"] ?? r["Installation Charges"] ?? r.installation_cost);

      return {
        id: id(),
        date: String(salesDate),
        salesperson: String(salesperson),
        customer: String(customer || ""),
        machineModel: String(machineModel || ""),
        // New/canonical fields
        unitPurchasePrice: unitPurchasePrice,
        unitSalesPrice: unitSalesPrice,
        installationCost: installationCost,
        hostingRate: hostingRate,
        pickupCost: pickupCost,
        courierCharge: courierCharge,
        receiptDate: receiptDate ? String(receiptDate) : undefined,
        receiptAccount: receiptAccount ? String(receiptAccount) : undefined,
        deliveryDate: deliveryDate ? String(deliveryDate) : undefined,
        pluginDate: pluginDate ? String(pluginDate) : undefined,
        vendor:vendor,
        billNo: billNo,
        description: description ? String(description) : undefined,

        // Kept fields for compatibility
        purchasedPrice,
        soldPrice,
        additionalRevenue,
        quantity: isFinite(quantity) && quantity > 0 ? quantity : 1,
        totalAmount: isFinite(totalAmount as any) ? (totalAmount as number) : 0,

        invoiceNumber:
          invoiceNumberRaw != null && String(invoiceNumberRaw).trim() !== ""
            ? String(invoiceNumberRaw)
            : undefined,

        procurementPerson: procurementPerson ? String(procurementPerson) : undefined,
        vat,
        purchasedDate: purchasedDateRaw ? String(purchasedDateRaw) : undefined,
        commission,

        remarks,
      } as SalesRecord;
    })
    .filter(Boolean) as SalesRecord[];
}

export function mapExpenseRows(rows: Record<string, any>[]): ExpenseRecord[] {
  return rows
    .map((r) => {
      const date = r.date || r.Date || r["Transaction Date"];
      const salesperson = r.salesperson || r.Salesperson || r["Sales Person"] || r.User || "N/A";
      const customer = r.customer || r.Customer || "";
      const amount = parseFloat(r.amount ?? r.Amount ?? r["Expense Amount"] ?? "0");
      const category = r.category || r.Category || "General";
      const remarks = r.remarks || r.Remarks || "";

      if (!date) return null;
      return {
        id: id(),
        date: new Date(date).toISOString(),
        salesperson: String(salesperson),
        customer: customer ? String(customer) : undefined,
        amount: isFinite(amount) ? amount : 0,
        category: String(category),
        remarks,
      } as ExpenseRecord;
    })
    .filter(Boolean) as ExpenseRecord[];
}

// Customers CSV: only pick known fields; name is required
export function mapCustomerRows(rows: Record<string, any>[]) {
  return rows
    .map((r) => {
      const name = r.name ?? r.Name ?? r.customer ?? r.Customer;
      if (!name) return null;
      const account_manager = r.account_manager ?? r["Account Manager"] ?? r.accountManager ?? null;
      const status = r.status ?? r.Status ?? null;
      const email = r.email ?? r.Email ?? null;
      const contact = r.contact ?? r.Contact ?? r.phone ?? null;

      return {
        name: String(name),
        account_manager: account_manager ? String(account_manager) : null,
        status: status ? String(status) : null,
        email: email ? String(email) : null,
        contact: contact ? String(contact) : null,
      };
    })
    .filter(Boolean) as Array<{
    name: string;
    account_manager: string | null;
    status: string | null;
    email: string | null;
    contact: string | null;
  }>;
}

// Machine Model CSV
export function mapMachineModelRows(rows: Record<string, any>[]) {
  // Extract the first numeric token, remove thousand separators, and parse
  const toNum = (v: any): number | undefined => {
    if (v == null) return undefined;
    const s = String(v).trim();
    const m = s.match(/[-+]?\d[\d,]*(\.\d+)?/);
    if (!m) return undefined;
    const cleaned = m[0].replace(/,/g, "");
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : undefined;
  };

  const firstStr = (...vals: any[]) => {
    for (const val of vals) {
      if (val == null) continue;
      const s = String(val).trim();
      if (s.length > 0) return s;
    }
    return "";
  };

  return rows
    .map((r) => {
      const model_name =
        r.model_name ?? r["Model Name"] ?? r.model ?? r.Model ?? r["MODEL NAME"] ?? r["MODEL"];
      if (!model_name) return null;

      const hashrate = toNum(
        r.hashrate ??
          r.Hashrate ??
          r.HashRate ??
          r["Hash Rate"] ??
          r["Hash rate"] ??
          r["Hash-Rate"] ??
          r["Hashrate"] ??
          r["HASHRATE"] ??
          r["Hash Rate (TH/s)"] ??
          r["Hash Rate (H/s)"]
      );

      const power = toNum(
        r.power ?? r.Power ?? r["Power"] ?? r["Power (W)"] ?? r["POWER"] ?? r["Watt"] ?? r["Watts"]
      );

      const price = toNum(r.price ?? r.Price ?? r["Price"] ?? r["PRICE"]);

      const algorithm = firstStr(r.algorithm, r.Algorithm, r["Algo"], r["ALGORITHM"], r.algo, r.ALGORITHM);
      const coin = firstStr(r.coin, r.Coin, r["COIN"], r["Currency"], r["Symbol"], r["Ticker"]);

      return {
        model_name: String(model_name),
        hashrate,
        power,
        price,
        algorithm,
        coin,
      };
    })
    .filter(Boolean) as Array<{
      model_name: string;
      hashrate?: number;
      power?: number;
      price?: number;
      algorithm: string;
      coin: string;
    }>;
}
