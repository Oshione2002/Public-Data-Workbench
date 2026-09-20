import { NextRequest, NextResponse } from "next/server";
import { searchCatalog } from "@/lib/catalog";

export async function GET(request:NextRequest){
  const q=request.nextUrl.searchParams.get("q")||"";
  return NextResponse.json({query:q,results:searchCatalog(q)});
}
