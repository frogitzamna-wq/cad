# Production Wallet Configuration

**Status**: ⏳ Awaiting Testnet Tokens  
**Priority**: P1 (Required for Blockchain Writes)  
**Security Level**: CRITICAL  
**Updated**: 2025-11-14 04:08 UTC

---

## 📋 Overview

The CAD system requires a BSV wallet to write incident events, resource updates, and dispatch actions to the blockchain. This document details the secure configuration and management of the production wallet.

---

## 🎯 Wallet Requirements

### Functional Requirements
1. **HD Wallet Support** - Hierarchical Deterministic (BIP32)
2. **Testnet Compatibility** - For development/staging
3. **Mainnet Ready** - For production deployment
4. **Transaction Signing** - ECDSA signatures for all writes
5. **UTXO Management** - Track spendable outputs
6. **Fee Estimation** - Dynamic fee calculation

### Security Requirements
1. **Private Key Protection** - Never expose xpriv
2. **Environment Variables** - Secrets stored securely
3. **Key Rotation** - Ability to migrate to new wallet
4. **Audit Trail** - All transactions logged
5. **Access Control** - Only authorized services can sign

---

## 🔐 Wallet Generation

### Method 1: Using bsv-wallet SDK (Recommended)

```typescript
import { Wallet, Mnemonic } from '@bsv/wallet';

// Generate new mnemonic (12 words)
const mnemonic = Mnemonic.generate();
console.log('Mnemonic:', mnemonic.toString());
// Store securely: paper backup, hardware wallet, KMS

// Derive HD wallet
const wallet = await Wallet.fromMnemonic(mnemonic);
const xpriv = wallet.toXPriv();
const xpub = wallet.toXPub();

console.log('Extended Private Key:', xpriv);
console.log('Extended Public Key:', xpub);

// Derive first address
const address = wallet.deriveAddress(0);
console.log('Address:', address.toString());
```

### Method 2: Command Line (for testing)

```bash
# Install bsv-cli (if available)
npm install -g @bsv/cli

# Generate testnet wallet
bsv-cli wallet generate --network testnet

# Output:
# Mnemonic: abandon ability able about above absent absorb abstract absurd abuse access accident
# xpriv: tprv8ZgxMBicQKsPd...
# xpub: tpubD6NzVbkrYhZ6...
# Address (m/0/0): n2JK8...
```

---

## 💰 Funding the Wallet (Testnet)

### Step 1: Get Testnet BSV

**Option A: Testnet Faucet**
```bash
curl -X POST https://faucet.bitcoincloud.net/api/send \
  -H "Content-Type: application/json" \
  -d '{"address": "YOUR_TESTNET_ADDRESS"}'

# Typical faucet amount: 0.1 - 1.0 tBSV
```

**Option B: ../bsv-wallet/ Resources**
Check if previous testnet tokens were obtained:
```bash
# Look for wallet config in parent project
cat ../bsv-wallet/.env | grep TESTNET
cat ../bsv-wallet/docs/TESTNET_SETUP.md
```

**Option C: Mining Testnet**
```bash
# Use testnet mining pool (if available)
# Or run local testnet node and mine blocks
```

### Step 2: Verify Balance

```typescript
import { Wallet } from '@bsv/wallet';

const wallet = await Wallet.fromXPriv('tprv8ZgxMBicQKsPd...');
const balance = await wallet.getBalance();

console.log(`Balance: ${balance.confirmed} satoshis`);
console.log(`Unconfirmed: ${balance.unconfirmed} satoshis`);
```

---

## 🏗️ Wallet Service Implementation

### WalletManager Class

```typescript
// src/blockchain/WalletManager.ts

import { Wallet, Transaction, Script } from '@bsv/sdk';

export class WalletManager {
  private wallet: Wallet;
  private network: 'mainnet' | 'testnet';

  constructor(xpriv: string, network: 'mainnet' | 'testnet' = 'testnet') {
    this.wallet = Wallet.fromXPriv(xpriv);
    this.network = network;
  }

  /**
   * Create incident transaction
   */
  async createIncidentTx(incident: IncidentData): Promise<string> {
    const data = {
      protocol: 'CAD',
      version: 1,
      type: 'INCIDENT_CREATED',
      data: incident,
      timestamp: Date.now()
    };

    const tx = new Transaction();
    
    // Add data output (OP_RETURN)
    tx.addOutput({
      satoshis: 0,
      script: Script.buildSafeDataOut([Buffer.from(JSON.stringify(data))])
    });

    // Add change output
    const changeAddress = this.wallet.deriveAddress(0);
    tx.addOutput({
      satoshis: 546, // dust limit
      script: Script.fromAddress(changeAddress)
    });

    // Add inputs (UTXOs)
    const utxos = await this.wallet.getUtxos();
    for (const utxo of utxos) {
      tx.addInput(utxo);
    }

    // Sign transaction
    await this.wallet.sign(tx);

    // Broadcast
    const txid = await tx.broadcast(this.network);
    
    return txid;
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<number> {
    const balance = await this.wallet.getBalance();
    return balance.confirmed;
  }

  /**
   * Get current address
   */
  getAddress(): string {
    return this.wallet.deriveAddress(0).toString();
  }
}
```

### Integration with CAD System

```typescript
// src/api/routes/incidents.ts (updated)

import { WalletManager } from '../../blockchain/WalletManager';

const walletManager = new WalletManager(
  process.env.BSV_WALLET_XPRIV!,
  process.env.BSV_NETWORK as 'mainnet' | 'testnet'
);

export class IncidentsRouter {
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<boolean> {
    if (req.method === 'POST' && pathname === '/api/incidents') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      
      await new Promise<void>(resolve => {
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            
            // Create blockchain transaction
            const txid = await walletManager.createIncidentTx(data);
            
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              incidentId: `incident_${Date.now()}`,
              txid: txid,
              network: process.env.BSV_NETWORK,
              explorer: `https://test.whatsonchain.com/tx/${txid}`
            }));
          } catch (error) {
            console.error('Blockchain write failed:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to write to blockchain' }));
          }
          resolve();
        });
      });
      return true;
    }
    
    return false;
  }
}
```

---

## 🔒 Security Best Practices

### 1. Environment Variable Management

```bash
# .env (NEVER commit this file)
BSV_WALLET_XPRIV=tprv8ZgxMBicQKsPd...
BSV_NETWORK=testnet
BSV_API_URL=https://api.whatsonchain.com/v1/bsv/test

# .env.example (commit this)
BSV_WALLET_XPRIV=your_testnet_xpriv_here
BSV_NETWORK=testnet
BSV_API_URL=https://api.whatsonchain.com/v1/bsv/test
```

### 2. Docker Secrets

```yaml
# docker-compose.yaml
services:
  cad-app:
    image: cad-bsv:dev
    secrets:
      - bsv_wallet_xpriv
    environment:
      BSV_WALLET_XPRIV_FILE: /run/secrets/bsv_wallet_xpriv

secrets:
  bsv_wallet_xpriv:
    file: ./secrets/bsv_wallet_xpriv.txt
```

### 3. Key Rotation Strategy

```typescript
/**
 * Migrate to new wallet
 * 1. Generate new wallet
 * 2. Transfer all UTXOs to new wallet
 * 3. Update environment variables
 * 4. Restart services
 */
async function rotateWallet(oldXpriv: string, newXpriv: string) {
  const oldWallet = Wallet.fromXPriv(oldXpriv);
  const newWallet = Wallet.fromXPriv(newXpriv);
  
  // Get all UTXOs
  const utxos = await oldWallet.getUtxos();
  
  // Create sweep transaction
  const tx = new Transaction();
  utxos.forEach(utxo => tx.addInput(utxo));
  
  tx.addOutput({
    satoshis: utxos.reduce((sum, u) => sum + u.satoshis, 0) - 1000, // minus fee
    script: Script.fromAddress(newWallet.deriveAddress(0))
  });
  
  await oldWallet.sign(tx);
  const txid = await tx.broadcast();
  
  console.log(`Wallet rotated: ${txid}`);
}
```

### 4. Audit Logging

```typescript
// src/blockchain/AuditLogger.ts

export class AuditLogger {
  async logTransaction(tx: Transaction, metadata: any) {
    const logEntry = {
      txid: tx.id,
      timestamp: Date.now(),
      type: metadata.type,
      user: metadata.user,
      ip: metadata.ip,
      amount: tx.outputs.reduce((sum, o) => sum + o.satoshis, 0)
    };
    
    // Write to blockchain (meta-audit)
    await this.writeAuditToChain(logEntry);
    
    // Write to database
    await db.auditLog.insert(logEntry);
    
    // Write to file
    fs.appendFileSync('/var/log/cad-audit.log', JSON.stringify(logEntry) + '\n');
  }
}
```

---

## 📊 Monitoring & Alerts

### Balance Monitoring

```typescript
// src/monitoring/BalanceMonitor.ts

export class BalanceMonitor {
  private threshold: number = 10000000; // 0.1 BSV in satoshis
  
  async checkBalance() {
    const balance = await walletManager.getBalance();
    
    if (balance < this.threshold) {
      await this.sendAlert({
        level: 'WARNING',
        message: `Wallet balance low: ${balance} satoshis`,
        action: 'Fund wallet to continue operations'
      });
    }
    
    if (balance === 0) {
      await this.sendAlert({
        level: 'CRITICAL',
        message: 'Wallet balance is ZERO - blockchain writes disabled',
        action: 'IMMEDIATE funding required'
      });
    }
  }
  
  async sendAlert(alert: Alert) {
    // Send to Prometheus
    balanceGauge.set(balance);
    
    // Send to Slack/Discord
    await slack.send(`🚨 ${alert.level}: ${alert.message}`);
    
    // Email admin
    await email.send({
      to: 'admin@example.com',
      subject: `CAD Wallet Alert: ${alert.level}`,
      body: alert.message
    });
  }
}

// Run every 5 minutes
setInterval(() => new BalanceMonitor().checkBalance(), 5 * 60 * 1000);
```

### Transaction Monitoring

```typescript
// Prometheus metrics
const txCounter = new Counter({
  name: 'cad_blockchain_transactions_total',
  help: 'Total blockchain transactions'
});

const txDuration = new Histogram({
  name: 'cad_blockchain_tx_duration_seconds',
  help: 'Transaction creation duration'
});

const txFees = new Histogram({
  name: 'cad_blockchain_tx_fees_satoshis',
  help: 'Transaction fees'
});
```

---

## 🧪 Testing Checklist

### Pre-Production Tests

- [ ] Generate testnet wallet
- [ ] Fund wallet with testnet BSV (minimum 0.1 tBSV)
- [ ] Verify balance via API
- [ ] Create test transaction (incident)
- [ ] Verify transaction on explorer (test.whatsonchain.com)
- [ ] Test UTXO management (multiple transactions)
- [ ] Test error handling (insufficient funds)
- [ ] Test key rotation procedure
- [ ] Verify audit logging
- [ ] Load test (100+ transactions)

---

## 🚀 Deployment Steps

### Step 1: Generate Wallet
```bash
# Use wallet generation script
npm run wallet:generate -- --network testnet

# Output saved to .env.local
```

### Step 2: Fund Wallet
```bash
# Get testnet address
npm run wallet:address

# Use faucet to fund
# Verify balance
npm run wallet:balance
```

### Step 3: Configure Services
```bash
# Update .env
BSV_WALLET_XPRIV=<generated_xpriv>
BSV_NETWORK=testnet

# Rebuild containers
docker-compose down
docker-compose up -d --build
```

### Step 4: Verify
```bash
# Health check
curl http://localhost:3000/health

# Create test incident
curl -X POST http://localhost:3000/api/incidents \
  -H "Content-Type: application/json" \
  -d '{"priority":"HIGH","description":"Test blockchain write"}'

# Check blockchain
curl https://api.whatsonchain.com/v1/bsv/test/tx/<txid>
```

---

## 📚 Additional Resources

- **BIP32 HD Wallets**: https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
- **BSV Wallet SDK**: https://docs.bsvblockchain.org/
- **Testnet Explorer**: https://test.whatsonchain.com/
- **Testnet Faucet**: https://faucet.bitcoincloud.net/

---

**Status**: Waiting for user notification when testnet tokens are ready

**Next Steps**:
1. User funds testnet wallet
2. Update .env with xpriv
3. Implement WalletManager class
4. Integrate with API endpoints
5. Test blockchain writes
6. Monitor balance and transactions
