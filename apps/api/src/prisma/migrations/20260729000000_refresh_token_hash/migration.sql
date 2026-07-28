-- Move refresh tokens from JWT-with-jti to opaque secrets stored only as a SHA-256 hash, and add
-- an absolute session cap. Refresh tokens are ephemeral, so clear the table to add the NOT NULL
-- columns cleanly (this just forces a re-login).
DELETE FROM "refresh_tokens";

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "token_hash" TEXT NOT NULL;
ALTER TABLE "refresh_tokens" ADD COLUMN "session_expires_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
