import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const SECRET_KEY = "pemo-secret-2024"; // Hardcoded secret key
const EXTERNAL_API_URL = "https://external-api.pemo.io/v1/transactions";
const EXCHANGE_RATE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";
const LIMIT_PER_PAGE = 50;

// Fallback rates in case API fails
const FALLBACK_RATES: { [key: string]: number } = {
  AED: 0.272, // 1 AED = 0.272 USD (approximate)
  USD: 1,
  EUR: 1.08, // 1 EUR = 1.08 USD (approximate)
  GBP: 1.27, // 1 GBP = 1.27 USD (approximate)
};

// Cache for exchange rates (valid for 1 hour)
let exchangeRatesCache: { [key: string]: number } | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

function safeJson<T>(data: T) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// Fetch exchange rates from external API
async function fetchExchangeRates(): Promise<{ [key: string]: number }> {
  try {
    // Check cache first
    const now = Date.now();
    if (exchangeRatesCache && (now - cacheTimestamp) < CACHE_DURATION) {
      return exchangeRatesCache;
    }

    console.log('Fetching fresh exchange rates from API...');
    const response = await fetch(EXCHANGE_RATE_API_URL, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Exchange rate API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.rates) {
      // Convert rates to USD base (API returns rates FROM USD, we need rates TO USD)
      const usdRates: { [key: string]: number } = {};
      usdRates.USD = 1; // USD to USD is always 1

      for (const [currency, rate] of Object.entries(data.rates)) {
        if (typeof rate === 'number') {
          usdRates[currency] = 1 / rate; // Invert to get rate TO USD
        }
      }

      // Cache the rates
      exchangeRatesCache = usdRates;
      cacheTimestamp = now;

      console.log('Exchange rates updated successfully');
      return usdRates;
    } else {
      throw new Error('Invalid response format from exchange rate API');
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates, using fallback rates:', error);
    return FALLBACK_RATES;
  }
}

// Convert currency amount to USD
async function convertToUSD(amount: number, currency: string): Promise<number> {
  const rates = await fetchExchangeRates();
  const rate = rates[currency] || 1;

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
    const url = `${EXTERNAL_API_URL}?startDate=${formatDateForAPI(startDate)}&endDate=${formatDateForAPI(endDate)}&page=${page}&limit=${LIMIT_PER_PAGE}&exportStatus=all`;
    console.log(`Fetching page ${page} from ${url}`);
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
    const allTransactions = await fetchAllTransactions(startDate, endDate);

    // Filter transactions to only include completed and exported ones
    const transactions = allTransactions.filter(transaction =>
      transaction.status === "completed" && transaction.exportStatus === "exported"
    );

    console.log(`Total transactions fetched: ${allTransactions.length}`);
    console.log(`Filtered transactions (completed & exported): ${transactions.length}`);

    if (transactions.length === 0) {
      return NextResponse.json({
        message: 'No completed and exported transactions found',
        totalFetched: allTransactions.length,
        filteredCount: 0,
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
          // Convert amount to USD using real-time rates
          const expenseAmountUSD = await convertToUSD(actualAmount, actualCurrency);

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

    // Bulk insert expenses using batch processing
    let createdExpenses: any[] = [];
    const BATCH_SIZE = 10; // Process in smaller batches

    if (expenseData.length > 0) {
      console.log(`Processing ${expenseData.length} expenses in batches of ${BATCH_SIZE}`);

      // Process expenses in batches to avoid long-running transactions
      for (let i = 0; i < expenseData.length; i += BATCH_SIZE) {
        const batch = expenseData.slice(i, i + BATCH_SIZE);

        try {
          // Use a separate transaction for each batch
          await prismaAny.$transaction(
            async (tx: any) => {
              for (const expense of batch) {
                try {
                  const created = await tx.expense.create({
                    data: expense,
                    include: { sales_person: true, customer: true }
                  });
                  createdExpenses.push(created);
                } catch (error) {
                  console.error('Error creating individual expense:', error);
                  errors.push({
                    salesPersonId: expense.sales_person_id.toString(),
                    error: error instanceof Error ? error.message : 'Database insertion failed'
                  });
                }
              }
            },
            {
              maxWait: 5000, // Wait up to 5 seconds for a transaction slot
              timeout: 10000, // Transaction timeout of 10 seconds
            }
          );

          console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} completed: ${batch.length} expenses processed`);

        } catch (batchError) {
          console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, batchError);

          // If batch transaction fails, try individual inserts as fallback
          for (const expense of batch) {
            try {
              const created = await prismaAny.expense.create({
                data: expense,
                include: { sales_person: true, customer: true }
              });
              createdExpenses.push(created);
            } catch (individualError) {
              errors.push({
                salesPersonId: expense.sales_person_id.toString(),
                error: individualError instanceof Error ? individualError.message : 'Individual expense creation failed'
              });
            }
          }
        }
      }
    }

    return NextResponse.json(safeJson({
      message: 'PEMO expenses processed successfully',
      totalFetched: allTransactions.length,
      filteredTransactions: transactions.length,
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
