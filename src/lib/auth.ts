import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  isLoggedIn: boolean;
}

function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured in production");
  }

  return {
    password: password || "local-development-secret-change-me-32chars",
    cookieName: "notulen_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  };
}

// Middleware needs a stable options export, while the secret must be checked only at request time.
export const sessionOptions: SessionOptions = {
  get password() {
    return getSessionOptions().password;
  },
  cookieName: "notulen_session",
  cookieOptions: {
    get secure() {
      return process.env.NODE_ENV === "production";
    },
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
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
