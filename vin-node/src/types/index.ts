/**
 * VIN Node - Receipt Types (v0.1)
 * 
 * Based on VIN_PROTOCOL.md
 */

// ============ Request Types ============

export interface ActionRequestV0 {
  schema: 'vin.action_request.v0';
  request_id?: string;
  action_type: 'compose_post' | 'challenge_response' | 'generic' | 'confidential_llm_call';
  policy_id: string;
  prompt?: string;  // For simple requests
  inputs?: Record<string, unknown>;
  constraints?: {
    max_chars?: number;
    max_tokens?: number;
    language?: string;
    style_tags?: string[];
  };
  llm?: {
    provider: string;
    model_id: string;
    params?: Record<string, unknown>;
  };
  client?: {
    agent_id: string;
    callback?: string;
  };
}

// ============ Output Types ============

export interface OutputV0 {
  schema: 'vin.output.v0';
  format: 'plain' | 'encypher';
  text: string;
  clean_text: string;
}

// ============ Receipt Types ============

export interface AttestationInfo {
  type: 'none' | 'dstack' | 'other';
  report_hash?: string;
  measurement?: string;
}

export interface PaymentInfo {
  type: 'none' | 'x402' | 'other';
  payment_ref?: string;
  payment_commitment?: string;
}

export interface ReceiptV0 {
  schema: 'vin.receipt.v0';
  version: '0.1';
  node_pubkey: string;  // base64url
  request_id: string;
  action_type: string;
  policy_id: string;
  
  inputs_commitment: string;       // hex(sha256)
  constraints_commitment: string;  // hex(sha256)
  llm_commitment: string;          // hex(sha256)
  
  output_clean_hash: string;       // hex(sha256)
  output_transport_hash: string;   // hex(sha256)
  
  iat: number;  // Unix epoch seconds
  exp: number;  // Unix epoch seconds
  nonce: string;  // base64url(16 bytes)
  
  attestation: AttestationInfo;
  payment: PaymentInfo;
  
  sig: string;  // base64url(ed25519)
}

// ============ Verification Types ============

export interface VerifyRequest {
  request?: ActionRequestV0;
  output: OutputV0;
  receipt: ReceiptV0;
}

export interface VerifyResponse {
  valid: boolean;
  reason?: string;
  checks?: Record<string, boolean>;
  error?: string;
}

// ============ Generate Response ============

export interface GenerateResponse {
  output?: OutputV0;
  receipt: ReceiptV0;
  encrypted_response?: string;
  response_ephemeral_pubkey?: string;
  response_nonce?: string;
  proof_bundle?: {
    attestation_report?: string;
    encypher?: {
      enabled: boolean;
      details?: Record<string, unknown>;
    };
  };
}
