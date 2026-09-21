import { NextRequest, NextResponse } from "next/server";
import { federatedCatalogSearch } from "@/lib/federated-catalog";

export const runtime="nodejs";

export async function GET(request:NextRequest){
  const q=request.nextUrl.searchParams.get("q")||"";
  const providers=(request.nextUrl.searchParams.get("providers")||"")
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean);

  const result=await federatedCatalogSearch(q,providers);
  return NextResponse.json({
    query:q,
    providers,
    results:result.results,
    sourceStatus:result.status
  });
}
