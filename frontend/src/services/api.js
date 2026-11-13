
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API error: ${response.status}`);
  }

  return response.json();
}

export function getHealth() {
  return request("/api/health");
}

export function getDeals() {
  return request("/api/deals");
}

export function getIntegrationStatus() {
  return request("/api/integrations/status");
}

export function createDeal(deal) {
  return request("/api/deals", {
    method: "POST",
    body: JSON.stringify(deal),
  });
}
