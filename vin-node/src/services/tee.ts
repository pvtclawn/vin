/**
 * VIN Node - TEE Attestation (HTTP-based)
 * 
 * Calls dstack agent directly via HTTP to avoid SDK import issues.
 * When running in a dstack CVM, provides real TDX attestation.
 * Otherwise returns a stub response.
 */

export interface AttestationInfo {
  type: string;
  available: boolean;
  report?: string;  // base64url encoded attestation report
  measurement?: string;  // hex encoded measurement
  signer_pubkey?: string;  // base64url encoded pubkey bound to TEE
}

interface TdxQuoteResponse {
  quote?: string;
  rtmr0?: string;
  rtmr1?: string;
  rtmr2?: string;
  rtmr3?: string;
}

interface DeriveKeyResponse {
  key?: string;
  certificate_chain?: string[];
}

const DSTACK_ENDPOINT = process.env.DSTACK_SIMULATOR_ENDPOINT || 'http://localhost:8090';

/**
 * Check if dstack agent is available
 */
export async function isTeeAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${DSTACK_ENDPOINT}/prpc/Tappd.TdxQuote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_data: 'test' }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get TDX quote (attestation) via HTTP
 */
export async function getAttestation(
  reportData: string,
  nodePubkey?: string
): Promise<AttestationInfo> {
  try {
    // Hash the report data to fit in the 64-byte TDX report data field
    const reportDataHex = Buffer.from(reportData).toString('hex');
    
    const response = await fetch(`${DSTACK_ENDPOINT}/prpc/Tappd.TdxQuote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        report_data: reportDataHex.slice(0, 128), // 64 bytes max
        hash_algorithm: 'sha256',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log('[TEE] TdxQuote request failed:', response.status);
      return { type: 'none', available: false };
    }

    const quote = await response.json() as TdxQuoteResponse;
    
    if (!quote.quote) {
      return { type: 'none', available: false };
    }

    return {
      type: 'tdx.dstack.v0',
      available: true,
      report: quote.quote, // Already base64
      measurement: quote.rtmr0 || undefined,
      signer_pubkey: nodePubkey,
    };
  } catch (error) {
    console.log('[TEE] Attestation not available:', (error as Error).message);
    return { type: 'none', available: false };
  }
}

/**
 * Derive a key inside TEE (for persistent identity)
 */
export async function deriveKey(path: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(`${DSTACK_ENDPOINT}/prpc/Tappd.DeriveKey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        path,
        subject: path,  // Use same value for both
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.log('[TEE] DeriveKey request failed:', response.status);
      return null;
    }

    const derived = await response.json() as DeriveKeyResponse;
    
    if (derived.key) {
      // Take first 32 bytes for secp256k1 seed
      return new Uint8Array(Buffer.from(derived.key, 'hex').slice(0, 32));
    }
    return null;
  } catch (error) {
    console.log('[TEE] Key derivation not available:', (error as Error).message);
    return null;
  }
}
