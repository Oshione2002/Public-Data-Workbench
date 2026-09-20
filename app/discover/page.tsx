import type { Metadata } from "next";
import DiscoverClient from "./DiscoverClient";

export const metadata:Metadata={title:"Discover"};

export default async function DiscoverPage({searchParams}:{searchParams:Promise<{q?:string}>}){
  const params=await searchParams;
  return <DiscoverClient initialQuery={params.q||""}/>;
}
