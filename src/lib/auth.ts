import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import { prisma } from "./prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Twitter({
      clientId: process.env.X_CLIENT_ID!,
      clientSecret: process.env.X_CLIENT_SECRET!,
      // Force Basic Auth for token exchange
      client: {
        token_endpoint_auth_method: "client_secret_basic",
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "twitter") return false;

      const providerUserId = account.providerAccountId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const twitterProfile = profile as any;
      const username = twitterProfile?.data?.username || twitterProfile?.username || user.name || "";

      let dbUser = await prisma.user.findFirst({
        where: {
          socialAccounts: {
            some: { provider: "x", providerUserId },
          },
        },
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            displayName: user.name || username,
            socialAccounts: {
              create: {
                provider: "x",
                providerUserId,
                username,
                name: user.name || null,
                avatarUrl: user.image || null,
                accessTokenEncrypted: account.access_token || null,
                refreshTokenEncrypted: account.refresh_token || null,
                tokenExpiresAt: account.expires_at
                  ? new Date(account.expires_at * 1000)
                  : null,
              },
            },
          },
        });
      } else {
        await prisma.socialAccount.updateMany({
          where: { provider: "x", providerUserId },
          data: {
            accessTokenEncrypted: account.access_token || undefined,
            refreshTokenEncrypted: account.refresh_token || undefined,
            tokenExpiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : undefined,
            avatarUrl: user.image || undefined,
            name: user.name || undefined,
            username: username || undefined,
          },
        });
      }

      return true;
    },
    async session({ session, token }) {
      if (token?.sub) {
        const socialAccount = await prisma.socialAccount.findUnique({
          where: {
            provider_providerUserId: { provider: "x", providerUserId: token.sub },
          },
          include: { user: true },
        });

        if (socialAccount) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s = session as any;
          s.userId = socialAccount.userId;
          s.username = socialAccount.username;
          s.role = socialAccount.user.role;
          s.userStatus = socialAccount.user.status;
        }
      }
      return session;
    },
    async jwt({ token, account }) {
      if (account) {
        token.sub = account.providerAccountId;
      }
      return token;
    },
  },
  pages: {
    signIn: "/tweets",
  },
});
