"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SeriesCatalogItem } from "@/lib/catalog";

type CartContextValue = {
  items: SeriesCatalogItem[];
  add: (item:SeriesCatalogItem)=>void;
  remove: (id:string)=>void;
  toggle: (item:SeriesCatalogItem)=>void;
  has: (id:string)=>boolean;
  clear: ()=>void;
};

const CartContext = createContext<CartContextValue | null>(null);
const KEY = "pdw-cart-v3";

export default function AppProvider({children}:{children:React.ReactNode}){
  const [items,setItems]=useState<SeriesCatalogItem[]>([]);
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed)) setItems(parsed);
      }
    }catch{}
    setReady(true);
  },[]);

  useEffect(()=>{
    if(!ready) return;
    try{ localStorage.setItem(KEY,JSON.stringify(items)); }catch{}
  },[items,ready]);

  const value=useMemo<CartContextValue>(()=>({
    items,
    add:(item)=>setItems(prev=>prev.some(x=>x.id===item.id)?prev:[...prev,item]),
    remove:(id)=>setItems(prev=>prev.filter(x=>x.id!==id)),
    toggle:(item)=>setItems(prev=>prev.some(x=>x.id===item.id)?prev.filter(x=>x.id!==item.id):[...prev,item]),
    has:(id)=>items.some(x=>x.id===id),
    clear:()=>setItems([])
  }),[items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(){
  const ctx=useContext(CartContext);
  if(!ctx) throw new Error("useCart must be used inside AppProvider");
  return ctx;
}
