import { NextResponse } from "next/server";
import {
  ADMIN_AUTH_COOKIE,
  getAdminPassword,
  getAuthErrorMessage,
  isValidAdminPassword,
} from "@/lib/adminAuth";

type LoginBody = {
  password?: string;
};

export async function POST(req: Request) {
  const configuredPassword = getAdminPassword();
  if (!configuredPassword) {
    return NextResponse.json(
      { error: "ADMIN_PANEL_PASSWORD is not configured" },
      { status: 500 }
    );
  }

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isValidAdminPassword(body.password)) {
    return NextResponse.json({ error: getAuthErrorMessage() }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: configuredPassword,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
