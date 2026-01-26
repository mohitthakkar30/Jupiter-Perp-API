# Jupiter Perpetuals API

A comprehensive Fastify API for interacting with Jupiter Perpetuals on Solana. Fetch positions, pool data, oracle prices, custody information, and build transactions for the Jupiter Perps protocol.

## Features

- **Positions**: Fetch all open positions, filter by wallet, calculate PnL, liquidation price, and borrow fees
- **Pool & JLP**: Get pool data, AUM, APY, JLP virtual price, mint/burn calculations
- **Prices**: Real-time oracle prices for SOL, ETH, BTC, USDC, USDT
- **Custodies**: Complete custody data including funding rates and utilization
- **Fees**: Calculate swap fees, price impact, and open/close position fees
- **Analytics**: Global PnL tracking, detailed AUM breakdown, pool utilization
- **Position Requests**: Track and manage pending position requests
- **Borrow Positions**: Monitor borrow positions and rates
- **Wallet Summary**: Complete portfolio overview for any wallet
- **Trade**: Build unsigned transactions to open/close perpetual positions
- Vercel-ready for serverless deployment

## Prerequisites

- Node.js 18+
- A Solana RPC URL (Helius, QuickNode, etc.)

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory:

```env
RPC_URL=https://your-solana-rpc-url
PORT=3001
HOST=0.0.0.0
```

## Development

```bash
npm run dev
```

The server will start at `http://localhost:3001`

## Production Build

```bash
npm run build
npm start
```

## API Endpoints

### Health & Info

| Endpoint | Description |
|----------|-------------|
| `GET /` | API information and available endpoints |
| `GET /health` | Health check |

### Positions

| Endpoint | Description |
|----------|-------------|
| `GET /positions` | Get all open positions |
| `GET /positions/:wallet` | Get positions for a specific wallet |
| `GET /positions/:wallet/:positionPubkey` | Get a specific position |
| `GET /positions/pnl/:positionPubkey` | Calculate position PnL |
| `GET /positions/liquidation/:positionPubkey` | Calculate liquidation price |
| `GET /positions/borrow-fee/:positionPubkey` | Calculate borrow fee |

### Pool & JLP

| Endpoint | Description |
|----------|-------------|
| `GET /pool` | Get pool data |
| `GET /pool/aum` | Get pool Assets Under Management |
| `GET /pool/apy` | Get pool APY |
| `GET /jlp/price` | Get JLP virtual price |

### Prices

| Endpoint | Description |
|----------|-------------|
| `GET /prices` | Get all token prices |
| `GET /prices/:token` | Get specific token price (SOL, ETH, BTC, USDC, USDT) |

### Custodies

| Endpoint | Description |
|----------|-------------|
| `GET /custodies` | Get all custody data |
| `GET /custodies/:token` | Get specific custody data |
| `GET /custodies/:token/funding-rate` | Get funding rate for a custody |
| `GET /custodies/:token/utilization` | Get utilization for a custody |

### Fees

| Endpoint | Description |
|----------|-------------|
| `GET /fees/open-close-base` | Get base open/close fees for all custodies |
| `GET /fees/open/:custody` | Get open position fee for a custody |
| `GET /fees/close/:custody` | Get close position fee for a custody |
| `POST /fees/price-impact` | Calculate price impact fee |
| `POST /fees/swap` | Calculate swap fee and output amount |

### Analytics

| Endpoint | Description |
|----------|-------------|
| `GET /analytics/global-pnl/longs` | Get global unrealized PnL for all long positions |
| `GET /analytics/global-pnl/shorts` | Get global unrealized PnL for all short positions |
| `GET /analytics/global-pnl/estimate/longs` | Estimate global long PnL (faster) |
| `GET /analytics/global-pnl/estimate/shorts` | Estimate global short PnL (faster) |
| `GET /analytics/pool/aum/detailed` | Get detailed AUM breakdown by custody |
| `GET /analytics/pool/utilization` | Get pool utilization by custody |

### JLP

| Endpoint | Description |
|----------|-------------|
| `GET /jlp/price` | Get JLP virtual price |
| `POST /jlp/calculate-mint` | Calculate JLP tokens for deposit |
| `POST /jlp/calculate-burn` | Calculate tokens for JLP burn |

### Position Requests

| Endpoint | Description |
|----------|-------------|
| `GET /position-requests` | Get all pending position requests |
| `GET /position-requests/wallet/:wallet` | Get position requests by wallet |
| `GET /position-requests/:pubkey` | Get specific position request |
| `POST /position-requests/close` | Build transaction to close a position request |

### Borrow

| Endpoint | Description |
|----------|-------------|
| `GET /borrow/positions` | Get all borrow positions |
| `GET /borrow/positions/wallet/:wallet` | Get borrow positions by wallet |
| `GET /borrow/positions/:pubkey` | Get specific borrow position |
| `GET /borrow/rates/:custody` | Get borrow rates for a custody |

### Wallet

| Endpoint | Description |
|----------|-------------|
| `GET /wallet/:wallet/summary` | Get complete wallet portfolio summary |

### Trade (Write Endpoints)

| Endpoint | Description |
|----------|-------------|
| `POST /trade/increase-position` | Build transaction to open/increase a position |
| `POST /trade/decrease-position` | Build transaction to close/decrease a position |

#### POST /trade/increase-position

Build an unsigned transaction to open or increase a perpetual position.

**Request Body:**
```json
{
  "owner": "wallet_address",
  "inputMint": "SOL",
  "custody": "SOL",
  "collateralCustody": "SOL",
  "side": "long",
  "sizeUsd": "1000000000",
  "collateralAmount": "100000000",
  "priceSlippage": "300000"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | string | Yes | Wallet address |
| `inputMint` | string | Yes | Token name (SOL, ETH, BTC, USDC, USDT) |
| `custody` | string | Yes | Position custody (token name or pubkey) |
| `collateralCustody` | string | Yes | Collateral custody (token name or pubkey) |
| `side` | string | Yes | Position direction: "long" or "short" |
| `sizeUsd` | string | Yes | Position size in USD (6 decimals) |
| `collateralAmount` | string | Yes | Collateral amount in token decimals |
| `priceSlippage` | string | No | Slippage tolerance (default 0.3%) |

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": "base64_encoded_transaction",
    "positionPda": "position_pubkey",
    "positionRequestPda": "position_request_pubkey"
  }
}
```

#### POST /trade/decrease-position

Build an unsigned transaction to close or decrease a perpetual position.

**Request Body:**
```json
{
  "owner": "wallet_address",
  "positionPubkey": "existing_position_pubkey",
  "desiredMint": "SOL",
  "entirePosition": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | string | Yes | Wallet address |
| `positionPubkey` | string | Yes | Existing position pubkey |
| `desiredMint` | string | Yes | Output token name (SOL, ETH, BTC, USDC, USDT) |
| `entirePosition` | boolean | No | Close entire position (default true) |
| `sizeUsdDelta` | string | No | Partial close amount in USD |
| `collateralUsdDelta` | string | No | Collateral to withdraw |
| `priceSlippage` | string | No | Slippage tolerance |

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": "base64_encoded_transaction",
    "positionRequestPda": "position_request_pubkey"
  }
}
```

## Example Requests

```bash
# Get all prices
curl http://localhost:3001/prices

# Get SOL price
curl http://localhost:3001/prices/SOL

# Get pool AUM
curl http://localhost:3001/pool/aum

# Get positions for a wallet
curl http://localhost:3001/positions/YOUR_WALLET_ADDRESS

# Get custody data for ETH
curl http://localhost:3001/custodies/ETH

# Open a long position (returns unsigned transaction)
curl -X POST http://localhost:3001/trade/increase-position \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "YOUR_WALLET_ADDRESS",
    "inputMint": "SOL",
    "custody": "SOL",
    "collateralCustody": "SOL",
    "side": "long",
    "sizeUsd": "100000000",
    "collateralAmount": "1000000000"
  }'

# Close a position (returns unsigned transaction)
curl -X POST http://localhost:3001/trade/decrease-position \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "YOUR_WALLET_ADDRESS",
    "positionPubkey": "YOUR_POSITION_PUBKEY",
    "desiredMint": "SOL",
    "entirePosition": true
  }'

# Get funding rate for SOL
curl http://localhost:3001/custodies/SOL/funding-rate

# Get custody utilization
curl http://localhost:3001/custodies/ETH/utilization

# Calculate swap fee
curl -X POST http://localhost:3001/fees/swap \
  -H "Content-Type: application/json" \
  -d '{
    "inputToken": "SOL",
    "outputToken": "USDC",
    "amountIn": "1000000000"
  }'

# Get global PnL for longs
curl http://localhost:3001/analytics/global-pnl/longs

# Get detailed AUM breakdown
curl http://localhost:3001/analytics/pool/aum/detailed

# Calculate JLP mint amount
curl -X POST http://localhost:3001/jlp/calculate-mint \
  -H "Content-Type: application/json" \
  -d '{
    "inputToken": "SOL",
    "inputAmount": "1000000000"
  }'

# Get wallet summary
curl http://localhost:3001/wallet/YOUR_WALLET_ADDRESS/summary

# Get borrow rates for SOL custody
curl http://localhost:3001/borrow/rates/SOL
```

## Vercel Deployment

This project is configured for Vercel serverless deployment.

1. Push to GitHub
2. Import the repository in Vercel
3. Set the `RPC_URL` environment variable
4. Deploy

The `vercel.json` and `api/index.ts` handle the serverless function routing.

## Project Structure

```
jup-perp-api/
├── api/
│   └── index.ts          # Vercel serverless handler
├── src/
│   ├── app.ts            # Fastify app builder
│   ├── index.ts          # Local dev entry point
│   ├── config/           # Environment configuration
│   ├── constants/        # Program IDs, addresses, precision
│   ├── idl/              # Jupiter Perpetuals & Doves IDLs
│   ├── types/            # TypeScript types
│   ├── utils/            # PDA, math, formatting utilities
│   ├── services/         # Business logic (position, pool, oracle, custody)
│   └── routes/           # Fastify route handlers
├── vercel.json           # Vercel configuration
├── tsconfig.json
└── package.json
```

## Program IDs

- **Jupiter Perpetuals**: `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu`
- **Doves Oracle**: `DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e`
- **JLP Pool**: `5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq`

## Supported Tokens

| Token | Custody Address |
|-------|-----------------|
| SOL | `7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz` |
| ETH | `AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn` |
| BTC | `5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm` |
| USDC | `G18jKKXQwBbrHpFFSHwHNx7CSwcU7RuGMMrGtPgUBqSp` |
| USDT | `4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk` |

## License

MIT
