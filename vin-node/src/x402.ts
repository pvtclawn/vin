/**
 * VIN Node - x402 Payment Gating (Stub)
 * 
 * Implements HTTP 402 flow for /v1/generate
 * MVP: Returns 402 with payment instructions, accepts X-Payment header
 * 
 * TODO: Integrate with actual x402 facilitator for verification
 */

export interface PaymentConfig {
  payTo: string;
  priceUsd: string;  // e.g., "$0.001"
  network: string;   // CAIP-2 format, e.g., "eip155:8453" (Base Mainnet)
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: Record<string, unknown>;
}

const DEFAULT_CONFIG: PaymentConfig = {
  payTo: process.env.VIN_PAY_TO ?? '0xeC6cd01f6fdeaEc192b88Eb7B62f5E72D65719Af',
  priceUsd: process.env.VIN_PRICE_USD ?? '$0.001',
  network: process.env.VIN_NETWORK ?? 'eip155:8453',  // Base Mainnet
};

/**
 * Build 402 Payment Required response
 */
export function build402Response(path: string, config: PaymentConfig = DEFAULT_CONFIG): Response {
  const requirements: PaymentRequirements = {
    scheme: 'exact',
    network: config.network,
    maxAmountRequired: config.priceUsd.replace('$', ''),  // Remove $ prefix
    resource: path,
    description: 'VIN: Verifiable Inference - Generate with receipt',
    mimeType: 'application/json',
    payTo: config.payTo,
    maxTimeoutSeconds: 60,
    asset: 'USDC',
    extra: {},
  };

  return new Response(JSON.stringify({
    error: 'payment_required',
    message: 'Payment required to access this resource',
    x402Version: 1,
    accepts: [requirements],
  }), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Required': 'true',
    },
  });
}

/**
 * Check if request has valid payment
 * MVP: Accept any X-Payment header as valid (stub)
 * TODO: Verify with x402 facilitator
 */
export function hasValidPayment(req: Request): boolean {
  const paymentHeader = req.headers.get('X-Payment');
  
  // MVP: If header exists, consider paid
  // Real implementation would verify via facilitator
  if (paymentHeader) {
    console.log('[x402] Payment header present:', paymentHeader.slice(0, 20) + '...');
    return true;
  }
  
  // Also accept query param for testing
  const url = new URL(req.url);
  if (url.searchParams.get('paid') === 'true') {
    console.log('[x402] Paid query param present (test mode)');
    return true;
  }
  
  return false;
}

/**
 * x402 middleware for Bun server
 */
export function requirePayment(
  handler: (req: Request) => Promise<Response> | Response,
  config: PaymentConfig = DEFAULT_CONFIG
): (req: Request) => Promise<Response> | Response {
  return async (req: Request) => {
    if (!hasValidPayment(req)) {
      const url = new URL(req.url);
      return build402Response(url.pathname, config);
    }
    return handler(req);
  };
}
