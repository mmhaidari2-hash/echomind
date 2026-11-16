export class AuthSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthSessionError";
  }
}

type TokenProvider = () => Promise<string | null>;

let provider: TokenProvider | null = null;
const TOKEN_TIMEOUT_MS = 4_000;

export function setAuthTokenProvider(next: TokenProvider | null) {
  provider = next;
}

export async function getAuthToken(): Promise<string> {
  if (!provider) {
    throw new AuthSessionError("Please sign in to use your personal EchoMind data.");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const token = await Promise.race([
      provider(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS);
      }),
    ]);
    if (!token?.trim()) {
      throw new AuthSessionError("Could not get your secure session. Please sign in again.");
    }
    return token.trim();
  } catch (error) {
    if (error instanceof AuthSessionError) throw error;
    throw new AuthSessionError("Could not get your secure session. Please sign in again.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
