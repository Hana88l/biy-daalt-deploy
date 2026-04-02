const prisma = require("../src/lib/prisma");
const bcrypt = require("bcryptjs");
const { getPrimaryAdminEmail } = require("../src/lib/admin");

async function main() {
  console.log("Checking for Admin account...");

  const adminEmail = getPrimaryAdminEmail();
  const passwordHash = await bcrypt.hash("password123", 10);

  // upsert ашиглах нь: Хэрэв байгаа бол өөрчлөхгүй, байхгүй бол үүсгэнэ.
  // Ингэснээр таны өмнөх датанууд болон Events устах аюулгүй.
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {}, // Хэрэв хэрэглэгч байгаа бол юуг ч шинэчлэхгүй
    create: {
      email: adminEmail,
      passwordHash: passwordHash,
      // Админд зориулсан тогтмол API Key (Туршилт хийхэд хялбар болгоно)
      apiKey: "admin_master_key_d8a761aa495e4bf0", 
      createdAt: new Date(),
    },
  });

  console.log(`✅ Admin account is ready: ${admin.email}`);
  console.log(`🔑 Admin API Key: ${admin.apiKey}`);
  console.log("------------------------------------------");
  console.log("No dummy events were created. Ready for real data!");
}

main()
  .catch((e) => {
    console.error("Initialization failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
