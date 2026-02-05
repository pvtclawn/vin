/**
 * VIN x402 Client - Test the full payment flow
 * 
 * Usage: WALLET_PASSWORD=xxx bun scripts/x402-client.ts
 */

import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const VIN_ENDPOINT = process.env.VIN_ENDPOINT || 'https://d2614dddf56f87bc44bb87818090fcadfd8fcecb-3402.dstack-pha-prod5.phala.network';

// Load wallet from keystore
async function loadWallet() {
  const password = process.env.WALLET_PASSWORD;
  if (!password) {
    throw new Error('WALLET_PASSWORD required');
  }
  
  // Get key from foundry
  const proc = Bun.spawn(['/home/clawn/.foundry/bin/cast', 'wallet', 'decrypt-keystore', 'clawn', '--unsafe-password', password], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  // Output is "clawn's private key is: 0x..."
  const match = output.match(/0x[a-fA-F0-9]{64}/);
  if (!match) {
    throw new Error('Could not parse private key from: ' + output);
  }
  const privateKey = match[0] as `0x${string}`;
  
  const account = privateKeyToAccount(privateKey);
  console.log('Loaded wallet:', account.address);
  
  return { account, privateKey };
}

async function main() {
  console.log('=== VIN x402 Client ===\n');
  
  // 1. Check health
  console.log('1. Checking VIN health...');
  const healthRes = await fetch(`${VIN_ENDPOINT}/health`);
  const health = await healthRes.json();
  console.log('   Health:', health.ok ? '✓' : '✗');
  console.log('   x402:', health.x402 ? 'enabled' : 'disabled');
  console.log();
  
  // 2. Try to call /v1/generate without payment
  console.log('2. Testing 402 response...');
  const unpaidRes = await fetch(`${VIN_ENDPOINT}/v1/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request: { prompt: 'test' } }),
  });
  console.log('   Status:', unpaidRes.status);
  
  if (unpaidRes.status === 402) {
    const requirements = await unpaidRes.json();
    console.log('   x402Version:', requirements.x402Version);
    console.log('   Payment to:', requirements.accepts?.[0]?.payTo);
    console.log('   Amount:', requirements.accepts?.[0]?.maxAmountRequired);
    console.log('   Network:', requirements.accepts?.[0]?.network);
    console.log('   Asset:', requirements.accepts?.[0]?.asset);
  }
  console.log();
  
  // 3. Load wallet and create x402 client
  console.log('3. Loading wallet and creating x402 client...');
  const { account, privateKey } = await loadWallet();
  
  // The account itself is the ClientEvmSigner (has address + signTypedData)
  const evmSigner = toClientEvmSigner(account);
  
  // Create x402 client with EVM scheme
  const client = new x402Client()
    .register('eip155:8453', new ExactEvmScheme(evmSigner));
  
  // Wrap fetch with x402 payment handling
  const paidFetch = wrapFetchWithPayment(fetch, client);
  
  // 4. Make paid request
  console.log('\n4. Making paid request...');
  try {
    const paidRes = await paidFetch(`${VIN_ENDPOINT}/v1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          policy_id: 'P0_COMPOSE_POST_V1',
          action_type: 'compose_post',
          prompt: 'Say hello in one word.',
        },
      }),
    });
    
    console.log('   Status:', paidRes.status);
    const result = await paidRes.json();
    console.log('   Result:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.log('   Error:', error.message);
    
    // Check if it's a balance issue
    if (error.message.includes('balance') || error.message.includes('insufficient')) {
      console.log('\n   ⚠️  Insufficient USDC balance. Need to fund wallet.');
    }
  }
}

main().catch(console.error);
