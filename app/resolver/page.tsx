import type { Metadata } from "next";
import ResolverClient from "./ResolverClient";

export const metadata:Metadata={title:"Resolver"};

export default function ResolverPage(){
  return <ResolverClient/>;
}
