# Jupiter Perpetuals API

A high-performance Fastify API for interacting with Jupiter Perpetuals on Solana. Fetch positions, pool data, oracle prices, and custody information from the Jupiter Perps protocol.

## Features

- Fetch all open positions or filter by wallet
- Get pool data including AUM and APY
- Real-time oracle prices for SOL, ETH, BTC, USDC, USDT
- Custody data for all supported tokens
- Position PnL, liquidation price, and borrow fee calculations
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
