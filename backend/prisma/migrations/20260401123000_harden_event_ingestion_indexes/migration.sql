-- CreateIndex
CREATE INDEX `Event_ownerId_timestamp_idx` ON `Event`(`ownerId`, `timestamp`);

-- CreateIndex
CREATE INDEX `Event_ownerId_eventName_timestamp_idx` ON `Event`(`ownerId`, `eventName`, `timestamp`);

-- CreateIndex
CREATE INDEX `Event_ownerId_userId_timestamp_idx` ON `Event`(`ownerId`, `userId`, `timestamp`);
