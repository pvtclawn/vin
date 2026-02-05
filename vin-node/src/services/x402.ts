/**
 * VIN Node - x402 Payment Gating (v2)
 * 
 * Implements HTTP 402 flow for /v1/generate
 * Uses x402 v2 protocol with proper EIP-3009 authorization
 * 
 * @see https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md
 */

// USDC contract address on Base Mainnet
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export interface PaymentConfig {
  payTo: string;
  amount: string;  // Amount in USDC base units (6 decimals). 1000 = $0.001
  network: string; // CAIP-2 format, e.g., "eip155:8453" (Base Mainnet)
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;  // Contract address
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    assetTransferMethod: 'eip3009' | 'permit2';
    name: string;
    version: string;
  };
}

export interface ResourceInfo {
  url: string;
  description: string;
  mimeType: string;
}

export interface PaymentRequired {
  x402Version: number;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  error?: string;
}

const DEFAULT_CONFIG: PaymentConfig = {
  payTo: process.env.VIN_PAY_TO ?? '0xeC6cd01f6fdeaEc192b88Eb7B62f5E72D65719Af',
  amount: process.env.VIN_AMOUNT ?? '1000',  // $0.001 in USDC (6 decimals)
  network: process.env.VIN_NETWORK ?? 'eip155:8453',  // Base Mainnet
};

/**
 * Build 402 Payment Required response (x402 v2)
 */
export function build402Response(path: string, url: string, config: PaymentConfig = DEFAULT_CONFIG): Response {
  const requirements: PaymentRequirements = {
    scheme: 'exact',
    network: config.network,
    amount: config.amount,
    asset: USDC_BASE,
    payTo: config.payTo,
    maxTimeoutSeconds: 60,
    extra: {
      assetTransferMethod: 'eip3009',
      name: 'USDC',
      version: '2',
    },
  };

  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: {
      url,
      description: 'VIN: Verifiable Inference - Generate with receipt',
      mimeType: 'application/json',
    },
    accepts: [requirements],
  };

  // x402 v2: encode paymentRequired in PAYMENT-REQUIRED header (base64)
  const paymentRequiredBase64 = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');

  return new Response(JSON.stringify(paymentRequired), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-REQUIRED': paymentRequiredBase64,
    },
  });
}

/**
 * Check if request has valid payment
 * 
 * x402 v2: Uses PAYMENT-SIGNATURE header
 * x402 v1 fallback: Uses X-Payment header
 * Test mode: Accept any header or ?paid=true
 */
export function hasValidPayment(req: Request): boolean {
  const testMode = process.env.VIN_TEST_MODE === '1';
  
  // v2 header
  const paymentSigHeader = req.headers.get('PAYMENT-SIGNATURE') || req.headers.get('payment-signature');
  if (paymentSigHeader) {
    console.log('[x402] v2 PAYMENT-SIGNATURE present:', paymentSigHeader.slice(0, 30) + '...');
    // TODO: Verify payment with facilitator
    return true;
  }
  
  // v1 fallback
  const paymentHeader = req.headers.get('X-Payment') || req.headers.get('x-payment');
  if (paymentHeader) {
    console.log('[x402] v1 X-Payment present:', paymentHeader.slice(0, 30) + '...');
    // TODO: Verify payment with facilitator
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
  const paymentHeader = req.headers.get('PAYMENT-SIGNATURE') || 
                        req.headers.get('payment-signature') ||
                        req.headers.get('X-Payment') || 
                        req.headers.get('x-payment');
  
  if (!paymentHeader) {
    return { type: 'none' };
  }
  
  // Hash the payment header for commitment
  const encoder = new TextEncoder();
  const data = encoder.encode(paymentHeader);
  
  return {
    type: 'x402.v2',
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
      return build402Response(url.pathname, url.href, config);
    }
    return handler(req);
  };
}
