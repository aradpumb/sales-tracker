"use client";

import { CustomerInfo, MachineModel, SalesPerson } from "./types";

const KEY_SALES_PERSON = "admin.sales_person";
const KEY_CUSTOMER = "admin.customer";
const KEY_MACHINE_MODEL = "admin.machine_model";

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as T[];
  } catch {
    return [];
  }
}

function save<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(rows));
}

export const adminStorage = {
  loadSalesPersons: () => load<SalesPerson>(KEY_SALES_PERSON),
  saveSalesPersons: (rows: SalesPerson[]) => save(KEY_SALES_PERSON, rows),

  loadCustomers: () => load<CustomerInfo>(KEY_CUSTOMER),
  saveCustomers: (rows: CustomerInfo[]) => save(KEY_CUSTOMER, rows),

  loadMachineModels: () => load<MachineModel>(KEY_MACHINE_MODEL),
  saveMachineModels: (rows: MachineModel[]) => save(KEY_MACHINE_MODEL, rows),
};
