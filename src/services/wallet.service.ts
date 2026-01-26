import { BN } from "@coral-xyz/anchor";
import { getPositionsForWallet, calculatePositionPnl } from "./position.service";
import { getBorrowPositionsByWallet } from "./borrow.service";
import { getPositionRequestsByWallet } from "./position-request.service";
import { USDC_DECIMALS } from "../constants/index";
import { BNToUSDRepresentation } from "../utils/formatting";

export interface WalletSummaryResponse {
  wallet: string;
  positions: {
    count: number;
    totalSizeUsd: string;
    totalCollateralUsd: string;
    totalUnrealizedPnlUsd: string;
    hasProfit: boolean;
    positions: Array<{
      pubkey: string;
      side: string;
      sizeUsd: string;
      collateralUsd: string;
      pnlUsd: string;
      hasProfit: boolean;
    }>;
  };
  borrowPositions: {
    count: number;
    totalBorrowedUsd: string;
  };
  pendingRequests: {
    count: number;
  };
}

export async function getWalletSummary(
  walletAddress: string
): Promise<WalletSummaryResponse> {
  // Fetch all data in parallel
  const [positions, borrowPositions, positionRequests] = await Promise.all([
    getPositionsForWallet(walletAddress),
    getBorrowPositionsByWallet(walletAddress),
    getPositionRequestsByWallet(walletAddress),
  ]);

  // Calculate PnL for each position
  let totalSizeUsd = new BN(0);
  let totalCollateralUsd = new BN(0);
  let totalUnrealizedPnl = new BN(0);

  const positionDetails = await Promise.all(
    positions.map(async (position) => {
      const pnlResult = await calculatePositionPnl(position.publicKey);
      const sizeUsd = new BN(position.sizeUsd);
      const collateralUsd = new BN(position.collateralUsd);

      totalSizeUsd = totalSizeUsd.add(sizeUsd);
      totalCollateralUsd = totalCollateralUsd.add(collateralUsd);

      // Parse PnL value
      const pnlValue = parseFloat(pnlResult.pnlUsd) * Math.pow(10, USDC_DECIMALS);
      if (pnlResult.hasProfit) {
        totalUnrealizedPnl = totalUnrealizedPnl.add(new BN(Math.floor(pnlValue)));
      } else {
        totalUnrealizedPnl = totalUnrealizedPnl.sub(new BN(Math.floor(Math.abs(pnlValue))));
      }

      return {
        pubkey: position.publicKey,
        side: position.side,
        sizeUsd: BNToUSDRepresentation(sizeUsd, USDC_DECIMALS),
        collateralUsd: BNToUSDRepresentation(collateralUsd, USDC_DECIMALS),
        pnlUsd: pnlResult.pnlUsd,
        hasProfit: pnlResult.hasProfit,
      };
    })
  );

  // Calculate total borrowed
  let totalBorrowedUsd = new BN(0);
  for (const bp of borrowPositions) {
    totalBorrowedUsd = totalBorrowedUsd.add(new BN(bp.borrowSizeUsd));
  }

  const hasOverallProfit = totalUnrealizedPnl.gtn(0) || totalUnrealizedPnl.eqn(0);

  return {
    wallet: walletAddress,
    positions: {
      count: positions.length,
      totalSizeUsd: BNToUSDRepresentation(totalSizeUsd, USDC_DECIMALS),
      totalCollateralUsd: BNToUSDRepresentation(totalCollateralUsd, USDC_DECIMALS),
      totalUnrealizedPnlUsd: BNToUSDRepresentation(
        totalUnrealizedPnl.abs(),
        USDC_DECIMALS
      ),
      hasProfit: hasOverallProfit,
      positions: positionDetails,
    },
    borrowPositions: {
      count: borrowPositions.length,
      totalBorrowedUsd: BNToUSDRepresentation(totalBorrowedUsd, USDC_DECIMALS),
    },
    pendingRequests: {
      count: positionRequests.length,
    },
  };
}
