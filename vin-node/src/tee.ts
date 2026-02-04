/**
 * VIN Node - TEE Attestation
 * 
 * Integrates with dstack SDK for TEE attestation reports.
 * When running in a dstack CVM, provides real TDX attestation.
 * Otherwise returns a stub response.
 */

import { TappdClient } from '@phala/dstack-sdk';

export interface AttestationInfo {
  type: string;
  available: boolean;
  report?: string;  // base64url encoded attestation report
  measurement?: string;  // hex encoded measurement
  signer_pubkey?: string;  // base64url encoded pubkey bound to TEE
}

// Singleton client (lazy init)
let tappdClient: TappdClient | null = null;

function getClient(): TappdClient {
  if (!tappdClient) {
    // Default endpoint for dstack guest agent
    const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT || 'http://localhost:8090';
    tappdClient = new TappdClient(endpoint);
  }
  return tappdClient;
}

/**
 * Check if running in dstack TEE environment
 */
export async function isTeeAvailable(): Promise<boolean> {
  try {
    const client = getClient();
    const info = await client.tdxQuote('test');
    return !!info;
  } catch {
    return false;
  }
}

/**
 * Get attestation report for given data
 */
export async function getAttestation(
  reportData: string,
  nodePubkey?: string
): Promise<AttestationInfo> {
  try {
    const client = getClient();
    
    // Generate TDX quote with report data
    const quote = await client.tdxQuote(reportData);
    
    if (!quote) {
      return {
        type: 'none',
        available: false,
      };
    }
    
    return {
      type: 'tdx.dstack.v0',
      available: true,
      report: Buffer.from(JSON.stringify(quote)).toString('base64url'),
      measurement: quote.rtmr0 || undefined,
      signer_pubkey: nodePubkey,
    };
  } catch (error) {
    console.log('[TEE] Attestation not available:', (error as Error).message);
    return {
      type: 'none',
      available: false,
    };
  }
}

/**
 * Derive a key inside TEE (for persistent identity)
 */
export async function deriveKey(path: string): Promise<Uint8Array | null> {
  try {
    const client = getClient();
    const derived = await client.deriveKey(path, path);
    
    if (derived?.key) {
      // Take first 32 bytes for ed25519 seed
      return new Uint8Array(Buffer.from(derived.key, 'hex').slice(0, 32));
    }
    return null;
  } catch {
    return null;
  }
}
