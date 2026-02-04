/**
 * VIN Node - Configuration
 * 
 * All environment variables and constants in one place.
 */

// Server
export const PORT = parseInt(process.env.VIN_PORT ?? '3402', 10);
export const TEST_MODE = process.env.VIN_TEST_MODE === '1';

// Keys
export const KEY_PATH = process.env.VIN_KEY_PATH;

// x402 Payment
export const PAY_TO = process.env.VIN_PAY_TO ?? '0xeC6cd01f6fdeaEc192b88Eb7B62f5E72D65719Af';
export const PRICE_USD = process.env.VIN_PRICE_USD ?? '$0.001';
export const NETWORK = process.env.VIN_NETWORK ?? 'eip155:8453'; // Base Mainnet

// LLM (for legacy mode)
export const LLM_PROVIDER = process.env.VIN_LLM_PROVIDER ?? 'echo';
export const LLM_URL = process.env.VIN_LLM_URL ?? 'https://api.anthropic.com/v1/messages';
export const LLM_MODEL = process.env.VIN_LLM_MODEL ?? 'claude-3-haiku-20240307';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// TEE
export const DSTACK_ENDPOINT = process.env.DSTACK_SIMULATOR_ENDPOINT ?? 'http://localhost:8090';

// Defaults
export const DEFAULT_VALIDITY_SECONDS = 600; // 10 minutes
export const DEFAULT_MAX_TOKENS = 1024;
