import { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/adminAuth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
