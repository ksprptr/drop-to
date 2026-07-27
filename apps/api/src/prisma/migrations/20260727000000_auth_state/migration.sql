-- CreateTable
CREATE TABLE "auth_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_state_pkey" PRIMARY KEY ("id")
);
