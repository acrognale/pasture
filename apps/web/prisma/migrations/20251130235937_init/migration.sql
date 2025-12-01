-- CreateTable
CREATE TABLE "SharedThread" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "model" TEXT,
    "transcript" JSONB NOT NULL,

    CONSTRAINT "SharedThread_pkey" PRIMARY KEY ("id")
);
