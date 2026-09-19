import { betterAuth } from "better-auth";
import { db } from "@/lib/db";
import { isAllowedEmail } from "@/lib/auth-policy";

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  database: db,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: googleConfigured ? {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      requireEmailVerification: true,
    },
  } : {},
  user: {
    validateUserInfo: ({ user }) => {
      if (!isAllowedEmail(user.email)) {
        return { error: "email_not_allowed", errorDescription: "This Google account is not approved for this workspace." };
      }
    },
  },
});
