-- CreateTable
CREATE TABLE "RequestPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestPhoto_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueType" TEXT NOT NULL,
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LocksmithProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "latitude" REAL,
    "longitude" REAL,
    "lastLocationAt" DATETIME,
    "ratingAvg" REAL NOT NULL DEFAULT 5,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT,
    "yearsExperience" INTEGER DEFAULT 0,
    "idDocumentUrl" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "cancelledJobsCount" INTEGER NOT NULL DEFAULT 0,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "stripeAccountId" TEXT,
    "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "LocksmithProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LocksmithProfile" ("bio", "id", "isOnline", "lastLocationAt", "latitude", "longitude", "ratingAvg", "ratingCount", "userId", "yearsExperience") SELECT "bio", "id", "isOnline", "lastLocationAt", "latitude", "longitude", "ratingAvg", "ratingCount", "userId", "yearsExperience" FROM "LocksmithProfile";
DROP TABLE "LocksmithProfile";
ALTER TABLE "new_LocksmithProfile" RENAME TO "LocksmithProfile";
CREATE UNIQUE INDEX "LocksmithProfile_userId_key" ON "LocksmithProfile"("userId");
CREATE TABLE "new_ServiceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "locksmithId" TEXT,
    "issueType" TEXT NOT NULL,
    "description" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priceEstimateMin" INTEGER,
    "priceEstimateMax" INTEGER,
    "finalPrice" INTEGER,
    "cancellationFee" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    "arrivedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "paymentIntentId" TEXT,
    "paidAt" DATETIME,
    CONSTRAINT "ServiceRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_locksmithId_fkey" FOREIGN KEY ("locksmithId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceRequest" ("acceptedAt", "address", "arrivedAt", "cancelReason", "cancelledAt", "clientId", "completedAt", "createdAt", "description", "finalPrice", "id", "issueType", "latitude", "locksmithId", "longitude", "priceEstimateMax", "priceEstimateMin", "status") SELECT "acceptedAt", "address", "arrivedAt", "cancelReason", "cancelledAt", "clientId", "completedAt", "createdAt", "description", "finalPrice", "id", "issueType", "latitude", "locksmithId", "longitude", "priceEstimateMax", "priceEstimateMin", "status" FROM "ServiceRequest";
DROP TABLE "ServiceRequest";
ALTER TABLE "new_ServiceRequest" RENAME TO "ServiceRequest";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Message_requestId_createdAt_idx" ON "Message"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_issueType_key" ON "PricingRule"("issueType");
