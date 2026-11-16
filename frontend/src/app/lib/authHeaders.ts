import { getAuthToken } from "./authToken";

export async function authorizationHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return { Authorization: `Bearer ${token}` };
}
