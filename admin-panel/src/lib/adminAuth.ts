const ADMIN_PASSWORD_ENV_KEY = "ADMIN_PANEL_PASSWORD";

export const ADMIN_AUTH_COOKIE = "admin_auth";

export function getAdminPassword(): string | null {
  const password = process.env[ADMIN_PASSWORD_ENV_KEY];
  if (!password || !password.trim()) {
    return null;
  }

  return password;
}

export function isValidAdminPassword(password: string | null | undefined): boolean {
  const expectedPassword = getAdminPassword();
  if (!expectedPassword) {
    return false;
  }

  return typeof password === "string" && password === expectedPassword;
}

export function extractAdminPassword(headers: Headers): string | null {
  const headerPassword = headers.get("x-admin-password");
  if (headerPassword) {
    return headerPassword;
  }

  const authHeader = headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export function hasValidAdminPasswordHeader(headers: Headers): boolean {
  return isValidAdminPassword(extractAdminPassword(headers));
}

export function getAuthErrorMessage(): string {
  return "Unauthorized: valid admin password required";
}

export function isValidAuthCookie(cookieValue: string | null | undefined): boolean {
  return isValidAdminPassword(cookieValue);
}

export function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return null;
}

export function requestHasAdminAccess(headers: Headers): boolean {
  const passwordFromHeader = extractAdminPassword(headers);
  if (isValidAdminPassword(passwordFromHeader)) {
    return true;
  }

  const cookiePassword = getCookieValue(headers.get("cookie"), ADMIN_AUTH_COOKIE);
  return isValidAuthCookie(cookiePassword);
}
