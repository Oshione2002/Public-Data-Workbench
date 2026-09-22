import DatasetExplorer from "./DatasetExplorer";

function decodeRouteValue(value:string){
  try{return decodeURIComponent(value);}catch{return value;}
}

export default async function DatasetPage({params,searchParams}:{params:Promise<{provider:string;dataset:string}>;searchParams:Promise<{agency?:string;version?:string}>}){
  const {provider,dataset}=await params;
  const {agency="all",version="latest"}=await searchParams;
  return <DatasetExplorer
    providerId={decodeRouteValue(provider)}
    dataset={decodeRouteValue(dataset)}
    agency={decodeRouteValue(agency)}
    version={decodeRouteValue(version)}
  />;
}
