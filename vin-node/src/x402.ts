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
 * 
 * In test mode (VIN_TEST_MODE=1): Accept any X-Payment header or ?paid=true
 * In production: Require X-Payment header (TODO: verify with facilitator)
 */
export function hasValidPayment(req: Request): boolean {
  const testMode = process.env.VIN_TEST_MODE === '1';
  const paymentHeader = req.headers.get('X-Payment');
  
  // Check X-Payment header
  if (paymentHeader) {
    console.log('[x402] Payment header present:', paymentHeader.slice(0, 20) + '...');
    // TODO: Verify payment with facilitator
    // const isValid = await verifyWithFacilitator(paymentHeader);
    return true;
  }
  
  // Test mode: Also accept query param
  if (testMode) {
    const url = new URL(req.url);
    if (url.searchParams.get('paid') === 'true') {
      console.log('[x402] Paid query param present (TEST MODE ONLY)');
      return true;
    }
  }
  
  return false;
}

/**
 * Extract payment info for receipt binding
 */
export function getPaymentInfo(req: Request): { type: string; payment_header_hash?: string } {
  const paymentHeader = req.headers.get('X-Payment');
  
  if (!paymentHeader) {
    return { type: 'none' };
  }
  
  // Hash the payment header for commitment
  const encoder = new TextEncoder();
  const data = encoder.encode(paymentHeader);
  const hashBuffer = new Uint8Array(32); // Placeholder - would use sha256
  
  return {
    type: 'x402.v0',
    payment_header_hash: Buffer.from(data.slice(0, 32)).toString('hex'),
  };
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
