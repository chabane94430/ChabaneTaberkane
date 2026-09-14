import bcrypt from "bcryptjs";
import { prisma } from "../src/db";
import { config } from "../src/config";

// Bootstraps a single admin account from ADMIN_EMAIL / ADMIN_PASSWORD in .env, if one
// doesn't already exist. Run with `npm run seed`. The admin back-office (served at
// /admin) logs in through the normal /auth/login endpoint with these credentials.
async function main() {
  if (!config.adminEmail || !config.adminPassword) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set in .env — skipping admin seed.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: config.adminEmail } });
  if (existing) {
    console.log(`Admin user ${config.adminEmail} already exists (role: ${existing.role}).`);
    return;
  }

  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  await prisma.user.create({
    data: {
      email: config.adminEmail,
      passwordHash,
      role: "ADMIN",
      fullName: "Admin",
    },
  });
  console.log(`Created admin user: ${config.adminEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
