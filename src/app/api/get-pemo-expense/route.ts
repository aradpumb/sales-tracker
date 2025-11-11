import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const SECRET_KEY = "pemo-secret-2024"; // Hardcoded secret key
const EXTERNAL_API_URL = "https://external-api.pemo.io/v1/transactions";
const LIMIT_PER_PAGE = 100;

// Currency conversion rates (you may want to fetch this from an API in production)
const CURRENCY_TO_USD_RATES: { [key: string]: number } = {
  AED: 0.272, // 1 AED = 0.272 USD (approximate)
  USD: 1,
  // Add more currencies as needed
};

function safeJson<T>(data: T) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// Convert currency amount to USD
function convertToUSD(amount: number, currency: string): number {
  const rate = CURRENCY_TO_USD_RATES[currency] || 1;

  // Handle different currency formats
  if (currency === 'AED') {
    // AED API response is in fils (1/100 of AED)
    return (amount / 100) * rate;
  } else if (currency === 'USD') {
    // USD API response is in cents (1/100 of USD)
    return amount / 100;
  }

  // Default: assume the amount is in the base currency unit
  return amount * rate;
}

// Get 4 months ago date
function getFourMonthsAgo(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - 4);
  return date;
}

// Format date for API
function formatDateForAPI(date: Date): string {
  return date.toISOString();
}

// Fetch all transactions from PEMO API with pagination
async function fetchAllTransactions(startDate: Date, endDate: Date): Promise<any[]> {
  const pemoApiKey = process.env.PEMO_API_KEY;
  if (!pemoApiKey) {
    throw new Error('PEMO_API_KEY not found in environment variables');
  }

  const allTransactions: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${EXTERNAL_API_URL}?startDate=${formatDateForAPI(startDate)}&endDate=${formatDateForAPI(endDate)}&page=${page}&limit=${LIMIT_PER_PAGE}`;

    try {
      const response = await fetch(url, {
        headers: {
          'apiKey': pemoApiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`PEMO API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.transactions && Array.isArray(data.transactions)) {
        allTransactions.push(...data.transactions);

        // Stop if we got less than the limit (no more pages)
        if (data.transactions.length < LIMIT_PER_PAGE) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      throw error;
    }
  }

  return allTransactions;
}

export async function GET(req: Request) {
  try {
    // Verify secret key in header
    const secretKey = req.headers.get('secret-key');
    if (secretKey !== SECRET_KEY) {
      return NextResponse.json(
        { error: 'Invalid secret key' },
        { status: 401 }
      );
    }

    const prismaAny = prisma as any;

    // Get the maximum created_at from expense table
    const maxExpense = await prismaAny.expense.findFirst({
      orderBy: { created_at: 'desc' },
      select: { created_at: true }
    });

    // Determine start date (max created_at or 4 months ago)
    const startDate = maxExpense?.created_at || getFourMonthsAgo();
    const endDate = new Date(); // Current date

    console.log(`Fetching PEMO transactions from ${startDate} to ${endDate}`);

    // Fetch all transactions from PEMO API
    const transactions = await fetchAllTransactions(startDate, endDate);

    if (transactions.length === 0) {
      return NextResponse.json({
        message: 'No transactions found',
        processed: 0,
        errors: []
      });
    }

    // Get all sales persons to match against createdFor
    const salesPersons = await prismaAny.sales_person.findMany({
      select: { id: true, name: true }
    });

    const salesPersonByName = new Map<string, bigint>();
    salesPersons.forEach(sp => {
      salesPersonByName.set(sp.name.toLowerCase(), BigInt(sp.id));
    });

    // Find or create "Unknown" customer
    let unknownCustomer = await prismaAny.customer.findFirst({
      where: { name: 'Unknown' }
    });

    if (!unknownCustomer) {
      unknownCustomer = await prismaAny.customer.create({
        data: {
          name: 'Unknown',
          account_manager: 'System',
          status: 'Active'
        }
      });
    }

    // Process transactions and create expense entries
    const expenseData: any[] = [];
    const errors: any[] = [];

    for (const transaction of transactions) {
      try {
        const { createdFor, actualAmount, actualCurrency, date, transactionType, reference, spender } = transaction;

        // Check if createdFor matches any sales person
        const salesPersonId = salesPersonByName.get(createdFor.toLowerCase());

        if (salesPersonId) {
          // Convert amount to USD
          const expenseAmountUSD = convertToUSD(actualAmount, actualCurrency);

          expenseData.push({
            sales_person_id: salesPersonId,
            expense_amount: expenseAmountUSD,
            expense_date: new Date(date),
            category: transactionType || 'Unknown',
            remarks: `${reference} - ${spender?.email || 'No email'}`,
            customer_id: BigInt(unknownCustomer.id)
          });
        }
      } catch (error) {
        errors.push({
          transactionId: transaction.id,
          error: error instanceof Error ? error.message : 'Processing failed'
        });
      }
    }

    // Bulk insert expenses
    let createdExpenses: any[] = [];

    if (expenseData.length > 0) {
      await prismaAny.$transaction(async (tx: any) => {
        for (const expense of expenseData) {
          try {
            const created = await tx.expense.create({
              data: expense,
              include: { sales_person: true, customer: true }
            });
            createdExpenses.push(created);
          } catch (error) {
            errors.push({
              salesPersonId: expense.sales_person_id.toString(),
              error: error instanceof Error ? error.message : 'Database insertion failed'
            });
          }
        }
      });
    }

    return NextResponse.json(safeJson({
      message: 'PEMO expenses processed successfully',
      totalTransactions: transactions.length,
      processedExpenses: createdExpenses.length,
      created: createdExpenses,
      errors: errors
    }));

  } catch (error: any) {
    console.error('Error in get-pemo-expense API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process PEMO expenses' },
      { status: 500 }
    );
  }
}
