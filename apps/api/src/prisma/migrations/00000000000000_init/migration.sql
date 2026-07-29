-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "drive_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowed_folders" (
    "id" TEXT NOT NULL,
    "drive_account_id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowed_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_logs" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "file_id" TEXT,
    "size" BIGINT,
    "status" "UploadStatus" NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drive_accounts_email_key" ON "drive_accounts"("email");

-- CreateIndex
CREATE INDEX "idx_allowed_folder_drive_account_id" ON "allowed_folders"("drive_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "allowed_folders_drive_account_id_folder_id_key" ON "allowed_folders"("drive_account_id", "folder_id");

-- CreateIndex
CREATE INDEX "idx_upload_log_created_at" ON "upload_logs"("created_at");

-- AddForeignKey
ALTER TABLE "allowed_folders" ADD CONSTRAINT "allowed_folders_drive_account_id_fkey" FOREIGN KEY ("drive_account_id") REFERENCES "drive_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

