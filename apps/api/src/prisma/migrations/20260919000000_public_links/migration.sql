-- CreateTable
CREATE TABLE "public_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "backend" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_links_token_key" ON "public_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "uq_public_link_backend_item" ON "public_links"("backend", "item_id");
