import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === "production"
      ? (() => {
          throw new Error("SESSION_SECRET must be configured in production");
        })()
      : "local-development-secret-change-me-32chars"),
  cookieName: "notulen_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export function verifyPin(pin: string): boolean {
  const adminPin =
    process.env.ADMIN_PIN ||
    (process.env.NODE_ENV === "production"
      ? (() => {
          throw new Error("ADMIN_PIN must be configured in production");
        })()
      : "1234");
  return pin === adminPin;
}
