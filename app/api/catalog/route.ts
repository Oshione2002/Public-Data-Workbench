import { NextRequest, NextResponse } from "next/server";
import { aggregateFrequencyCounts, federatedCatalogSearch } from "@/lib/federated-catalog";
import type { ProviderFrequency } from "@/lib/providers";

export const runtime="nodejs";

export async function GET(request:NextRequest){
  const q=request.nextUrl.searchParams.get("q")||"";
  const providers=(request.nextUrl.searchParams.get("providers")||"")
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean);
  const frequencies=(request.nextUrl.searchParams.get("frequencies")||"")
    .split(",")
    .map(value=>value.trim())
    .filter((value):value is ProviderFrequency=>[
      "annual","semiannual","quarterly","monthly","weekly","daily","hourly"
    ].includes(value));
  const page=Math.max(1,Number(request.nextUrl.searchParams.get("page")||1)||1);
  const requestedPageSize=request.nextUrl.searchParams.get("pageSize")||"20";
  const pageSize=requestedPageSize==="all"
    ?250
    :[20,50,100,250].includes(Number(requestedPageSize))?Number(requestedPageSize):20;

  const result=await federatedCatalogSearch({q,providerIds:providers,frequencies,page,pageSize});
  const frequencySummary=aggregateFrequencyCounts(result.status);

  return NextResponse.json({
    query:q,
    providers,
    selectedFrequencies:frequencies,
    page:result.page,
    pageSize:requestedPageSize==="all"?"all":result.pageSize,
    chunkSize:result.pageSize,
    total:result.total,
    totalPages:requestedPageSize==="all"?1:result.totalPages,
    hasMore:result.page<result.totalPages,
    partial:result.status.some(status=>status.partial),
    results:result.results,
    sourceStatus:result.status,
    frequencies:frequencySummary
  });
}
