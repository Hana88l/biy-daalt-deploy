/*
  Warnings:

  - You are about to drop the column `projectId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[apiKey]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ownerId` to the `Event` table without a default value. This is not possible if the table is not empty.
  - The required column `apiKey` was added to the `User` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE `Event` DROP FOREIGN KEY `Event_projectId_fkey`;

-- DropIndex
DROP INDEX `Event_projectId_fkey` ON `Event`;

-- AlterTable
ALTER TABLE `Event` DROP COLUMN `projectId`,
    ADD COLUMN `ownerId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `apiKey` VARCHAR(191) NOT NULL;

-- DropTable
DROP TABLE `Project`;

-- CreateIndex
CREATE UNIQUE INDEX `User_apiKey_key` ON `User`(`apiKey`);

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
