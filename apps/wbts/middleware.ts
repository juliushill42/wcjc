import { NextRequest, NextResponse } from "next/server";

const SOURCE_HOST = "wbts.wecanjuschill.net";
const DESTINATION_ORIGIN = "https://geturclarity.net";

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "")
    .split(":")[0]
    .toLowerCase();

  if (host !== SOURCE_HOST) {
    return NextResponse.next();
  }

  const destination = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    DESTINATION_ORIGIN,
  );

  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: "/:path*",
};
