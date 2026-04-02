-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `siteUrl` VARCHAR(191) NULL,
    ADD COLUMN `siteName` VARCHAR(191) NULL,
    ADD COLUMN `lastAnalyzedAt` DATETIME(3) NULL;
