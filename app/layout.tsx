import type { Metadata } from "next";
import "./globals.css";
import AppProvider from "@/components/AppProvider";
import Header from "@/components/Header";

export const metadata:Metadata={
  title:{default:"Public Data Workbench",template:"%s — Public Data Workbench"},
  description:"Search, compare, reconcile and export public statistical series with their provenance intact."
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>
    <AppProvider>
      <Header/>
      {children}
    </AppProvider>
  </body></html>;
}
