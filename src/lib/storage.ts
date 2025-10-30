"use client";

import { ExpenseRecord, SalesRecord } from "./types";

const SALES_KEY = "salesRecords";
const EXPENSES_KEY = "expenseRecords";

export function loadSales(): SalesRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SALES_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveSales(records: SalesRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SALES_KEY, JSON.stringify(records));
}

export function loadExpenses(): ExpenseRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(EXPENSES_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveExpenses(records: ExpenseRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EXPENSES_KEY, JSON.stringify(records));
}
