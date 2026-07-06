import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Verifies a Google Identity Services ID token and returns the signed-in email, or null if invalid. */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (typeof payload.email !== "string" || payload.email_verified !== true) return null;
    return payload.email.toLowerCase();
  } catch {
    return null;
  }
}
