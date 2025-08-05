-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "tags" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "external_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "quote_similarities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quote_id" TEXT NOT NULL,
    "similar_quote_id" TEXT NOT NULL,
    "similarity_score" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_similarities_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quote_similarities_similar_quote_id_fkey" FOREIGN KEY ("similar_quote_id") REFERENCES "quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_likes" ON "quotes"("likes" DESC);

-- CreateIndex
CREATE INDEX "idx_author" ON "quotes"("author");

-- CreateIndex
CREATE INDEX "idx_source" ON "quotes"("source");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_source_external_id_key" ON "quotes"("source", "external_id");

-- CreateIndex
CREATE INDEX "idx_quote_similarity" ON "quote_similarities"("quote_id", "similarity_score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quote_similarities_quote_id_similar_quote_id_key" ON "quote_similarities"("quote_id", "similar_quote_id");
