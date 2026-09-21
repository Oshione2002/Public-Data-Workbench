import { NextResponse } from "next/server";
import { aggregateFrequencyCounts, providerCatalogueCounts } from "@/lib/federated-catalog";

export const runtime="nodejs";

export async function GET(){
  const sources=await providerCatalogueCounts();
  const frequencies=aggregateFrequencyCounts(sources);

  return NextResponse.json({
    sources,
    frequencies,
    cap:1000,
    checkedAt:new Date().toISOString()
  });
}
