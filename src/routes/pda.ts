import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  generatePositionPda,
  generatePositionRequestPda,
  generateBorrowPositionPda,
  generatePerpetualsPda,
} from "../utils/pda";
import { TOKEN_TO_CUSTODY, JLP_POOL_ACCOUNT_PUBKEY } from "../constants";

interface GeneratePositionPdaBody {
  custody: string;
  collateralCustody: string;
  wallet: string;
  side: "long" | "short";
}

interface GeneratePositionRequestPdaBody {
  positionPubkey: string;
  requestChange: "increase" | "decrease";
  counter?: string;
}

interface GenerateBorrowPositionPdaBody {
  wallet: string;
  custody: string;
}

export async function pdaRoutes(fastify: FastifyInstance) {
  // Generate Position PDA
  fastify.post<{ Body: GeneratePositionPdaBody }>(
    "/pda/position",
    async (request, reply) => {
      try {
        const { custody, collateralCustody, wallet, side } = request.body;

        if (!custody || !collateralCustody || !wallet || !side) {
          return reply.status(400).send({
            success: false,
            error: "Missing required fields: custody, collateralCustody, wallet, side",
          });
        }

        if (side !== "long" && side !== "short") {
          return reply.status(400).send({
            success: false,
            error: "Invalid side. Must be 'long' or 'short'",
          });
        }

        // Convert token names to custody pubkeys if needed
        const custodyPubkey = new PublicKey(
          TOKEN_TO_CUSTODY[custody.toUpperCase()] || custody
        );
        const collateralCustodyPubkey = new PublicKey(
          TOKEN_TO_CUSTODY[collateralCustody.toUpperCase()] || collateralCustody
        );
        const walletPubkey = new PublicKey(wallet);

        const { position, bump } = generatePositionPda({
          custody: custodyPubkey,
          collateralCustody: collateralCustodyPubkey,
          walletAddress: walletPubkey,
          side,
        });

        return {
          success: true,
          data: {
            positionPda: position.toString(),
            bump,
            inputs: {
              custody: custodyPubkey.toString(),
              collateralCustody: collateralCustodyPubkey.toString(),
              wallet: walletPubkey.toString(),
              side,
            },
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to generate position PDA: ${errorMessage}`,
        });
      }
    }
  );

  // Generate Position Request PDA
  fastify.post<{ Body: GeneratePositionRequestPdaBody }>(
    "/pda/position-request",
    async (request, reply) => {
      try {
        const { positionPubkey, requestChange, counter } = request.body;

        if (!positionPubkey || !requestChange) {
          return reply.status(400).send({
            success: false,
            error: "Missing required fields: positionPubkey, requestChange",
          });
        }

        if (requestChange !== "increase" && requestChange !== "decrease") {
          return reply.status(400).send({
            success: false,
            error: "Invalid requestChange. Must be 'increase' or 'decrease'",
          });
        }

        const positionPubkeyParsed = new PublicKey(positionPubkey);
        const counterBN = counter ? new BN(counter) : undefined;

        const { positionRequest, counter: usedCounter, bump } = generatePositionRequestPda({
          positionPubkey: positionPubkeyParsed,
          requestChange,
          counter: counterBN,
        });

        return {
          success: true,
          data: {
            positionRequestPda: positionRequest.toString(),
            counter: usedCounter.toString(),
            bump,
            inputs: {
              positionPubkey: positionPubkeyParsed.toString(),
              requestChange,
            },
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to generate position request PDA: ${errorMessage}`,
        });
      }
    }
  );

  // Generate Borrow Position PDA
  fastify.post<{ Body: GenerateBorrowPositionPdaBody }>(
    "/pda/borrow-position",
    async (request, reply) => {
      try {
        const { wallet, custody } = request.body;

        if (!wallet || !custody) {
          return reply.status(400).send({
            success: false,
            error: "Missing required fields: wallet, custody",
          });
        }

        const walletPubkey = new PublicKey(wallet);
        const custodyPubkey = new PublicKey(
          TOKEN_TO_CUSTODY[custody.toUpperCase()] || custody
        );

        const { borrowPosition, bump } = generateBorrowPositionPda({
          pool: JLP_POOL_ACCOUNT_PUBKEY,
          walletAddress: walletPubkey,
          custody: custodyPubkey,
        });

        return {
          success: true,
          data: {
            borrowPositionPda: borrowPosition.toString(),
            bump,
            inputs: {
              pool: JLP_POOL_ACCOUNT_PUBKEY.toString(),
              wallet: walletPubkey.toString(),
              custody: custodyPubkey.toString(),
            },
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to generate borrow position PDA: ${errorMessage}`,
        });
      }
    }
  );

  // Get Perpetuals Global State PDA
  fastify.get("/pda/perpetuals", async (request, reply) => {
    try {
      const { perpetuals, bump } = generatePerpetualsPda();

      return {
        success: true,
        data: {
          perpetualsPda: perpetuals.toString(),
          bump,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        success: false,
        error: `Failed to generate perpetuals PDA: ${errorMessage}`,
      });
    }
  });
}
