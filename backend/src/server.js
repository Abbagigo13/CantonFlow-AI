
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8000);
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const demoDeals = [
  {
    id: "CF-DEMO-001",
    title: "Agricultural Equipment Supply",
    buyer: "Northstar Trading",
    seller: "Greenfield Industries",
    amount: 24500,
    currency: "USD",
    status: "Awaiting approval",
    mode: "DEMO",
  },
  {
    id: "CF-DEMO-002",
    title: "Commercial Solar Equipment",
    buyer: "Helio Partners",
    seller: "Volt Systems",
    amount: 18200,
    currency: "USD",
    status: "Evidence review",
    mode: "DEMO",
  },
];

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  res.end(JSON.stringify(data, null, 2));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;

      if (size > 16_384) {
        reject(new Error("Request body exceeds 16 KB."));
        req.destroy();
        return;
      }

      body += chunk.toString();
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must contain valid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function normalizeDeal(input) {
  const title = String(input.title || "").trim();
  const buyer = String(input.buyer || "").trim();
  const seller = String(input.seller || "").trim();
  const amount = Number(input.amount);

  if (!title || !buyer || !seller) {
    throw new Error("Title, buyer, and seller are required.");
  }

  if (title.length > 120 || buyer.length > 100 || seller.length > 100) {
    throw new Error("A transaction field exceeds its allowed length.");
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new Error("Amount must be a valid positive number.");
  }

  return {
    id: `CF-DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    buyer,
    seller,
    amount,
    currency: "USD",
    status: "Awaiting approval",
    mode: "DEMO",
  };
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;

  if (origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
    );
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`
  );

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        service: "CantonFlow AI API",
        environment: "local-development",
        cantonLedger: "not-connected",
        ai: "not-configured",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/deals") {
      sendJson(res, 200, {
        mode: "DEMO",
        warning: "These are demonstration records, not Canton ledger data.",
        deals: demoDeals,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/deals") {
      const input = await readJson(req);
      const deal = normalizeDeal(input);

      demoDeals.unshift(deal);

      sendJson(res, 201, {
        mode: "DEMO",
        warning:
          "Saved in server memory only. This has NOT been submitted to Canton.",
        deal,
      });
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/integrations/status"
    ) {
      sendJson(res, 200, {
        cantonLedger: {
          configured: false,
          status: "not-connected",
        },
        scanApi: {
          configured: false,
          status: "not-configured",
        },
        ai: {
          configured: Boolean(process.env.AI_API_KEY),
          status: process.env.AI_API_KEY
            ? "credentials-present-not-verified"
            : "not-configured",
        },
      });
      return;
    }

    sendJson(res, 404, {
      error: "Route not found.",
      availableRoutes: [
        "GET /api/health",
        "GET /api/deals",
        "POST /api/deals",
        "GET /api/integrations/status",
      ],
    });
  } catch (error) {
    if (res.headersSent || res.destroyed) return;

    const message = error.message || "Unexpected server error.";
    const status = message.includes("Request body")
      ? 400
      : 400;

    sendJson(res, status, { error: message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`CantonFlow AI API: http://127.0.0.1:${PORT}`);
  console.log("Mode: local development; demo data only.");
  console.log("Canton ledger: not connected.");
});
