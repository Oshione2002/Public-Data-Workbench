"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "./AppProvider";

const links=[
  ["/discover","Discover"],
  ["/sources","Sources"],
  ["/resolver","Resolver"],
  ["/workspace","Workspace"]
] as const;

export default function Header(){
  const pathname=usePathname();
  const {items}=useCart();
  const [open,setOpen]=useState(false);

  return <header className="siteHeader">
    <div className="headerInner">
      <Link className="brand" href="/" onClick={()=>setOpen(false)}>
        <span className="brandMark" aria-hidden="true"><i/><i/><i/><i/></span>
        <span>Public Data Workbench</span>
      </Link>

      <button className="menuButton" type="button" aria-expanded={open} aria-label="Toggle navigation" onClick={()=>setOpen(v=>!v)}>
        <span/><span/><span/>
      </button>

      <nav className={"primaryNav "+(open?"open":"")} aria-label="Primary navigation">
        {links.map(([href,label])=><Link key={href} href={href} className={pathname.startsWith(href)?"active":""} onClick={()=>setOpen(false)}>{label}</Link>)}
      </nav>

      <Link className="cartLink" href="/discover#cart" aria-label={items.length+" selected series"}>
        <span>{items.length}</span> selected
      </Link>
    </div>
  </header>;
}
