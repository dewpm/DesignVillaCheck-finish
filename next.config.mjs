export default {
 env: { NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || process.env.VITE_SUPPORT_EMAIL || "villacheck69@gmail.com", NEXT_PUBLIC_SUPPORT_PHONE: process.env.NEXT_PUBLIC_SUPPORT_PHONE || process.env.VITE_SUPPORT_PHONE || "", NEXT_PUBLIC_FACEBOOK_URL: process.env.NEXT_PUBLIC_FACEBOOK_URL || process.env.VITE_FACEBOOK_URL || "", NEXT_PUBLIC_INSTAGRAM_URL: process.env.NEXT_PUBLIC_INSTAGRAM_URL || process.env.VITE_INSTAGRAM_URL || "" },
 serverExternalPackages: ["@nestjs/core", "@nestjs/common", "@nestjs/platform-express", "@prisma/client", "@prisma/adapter-pg", "pg", "nodemailer"],
 outputFileTracingIncludes: { "/api/*": ["./.build/**/*", "./server/*.sql"] },
};
