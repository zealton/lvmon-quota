import { NextResponse } from "next/server";

let cachedApy: number | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  if (cachedApy !== null && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ apy: cachedApy });
  }

  try {
    const res = await fetch(
      "https://service.leverup.xyz/v1/slvmon/apy?blockChain=MONAD&days=1",
      { next: { revalidate: 300 } }
    );
    const text = await res.text();
    const raw = parseFloat(text);
    const apy = Math.round(raw * 100 * 100) / 100; // multiply by 100, keep 2 decimals

    cachedApy = apy;
    cacheTime = Date.now();

    return NextResponse.json({ apy });
  } catch {
    return NextResponse.json({ apy: cachedApy || 0 });
  }
}
