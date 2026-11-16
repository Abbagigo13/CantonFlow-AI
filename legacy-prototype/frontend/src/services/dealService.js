
import { getDeals, createDeal } from "../services/api";

export function normalizeDeal(deal) {
  return {
    ...deal,
    id: String(deal.id || ""),
    title: String(deal.title || "Untitled agreement"),
    buyer: String(deal.buyer || ""),
    seller: String(deal.seller || ""),
    amount: Number(deal.amount || 0),
    currency: String(deal.currency || "USD"),
    status: String(deal.status || "Pending"),
  };
}

export async function listDeals() {
  const response = await getDeals();
  const records = Array.isArray(response)
    ? response
    : response.deals || [];

  return records.map(normalizeDeal);
}

export function submitDeal(input) {
  const deal = normalizeDeal(input);

  if (!deal.title.trim()) {
    throw new Error("Agreement title is required.");
  }

  if (!deal.buyer.trim()) {
    throw new Error("Buyer is required.");
  }

  if (!deal.seller.trim()) {
    throw new Error("Seller is required.");
  }

  if (!Number.isFinite(deal.amount) || deal.amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  if (deal.buyer === deal.seller) {
    throw new Error("Buyer and seller must be different parties.");
  }

  return createDeal({
    title: deal.title,
    buyer: deal.buyer,
    seller: deal.seller,
    amount: deal.amount,
    currency: deal.currency,
  });
}
