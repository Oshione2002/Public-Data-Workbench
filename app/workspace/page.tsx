import type { Metadata } from "next";
import WorkspaceClient from "./WorkspaceClient";

export const metadata:Metadata={title:"Workspace"};

export default function WorkspacePage(){
  return <WorkspaceClient/>;
}
