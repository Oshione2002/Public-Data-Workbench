"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type CountryOption={
  code:string;
  iso2:string;
  name:string;
  region:string;
  incomeLevel?:string;
};

function flag(iso2:string){
  if(!/^[A-Z]{2}$/.test(iso2)) return "🌐";
  return String.fromCodePoint(...iso2.split("").map(char=>127397+char.charCodeAt(0)));
}

export default function CountryMultiSelect({
  value,
  onChange
}:{
  value:CountryOption[];
  onChange:(countries:CountryOption[])=>void;
}){
  const [countries,setCountries]=useState<CountryOption[]>([]);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const rootRef=useRef<HTMLDivElement|null>(null);
  const searchRef=useRef<HTMLInputElement|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);

    fetch("/api/countries",{signal:controller.signal})
      .then(async response=>{
        const data=await response.json();
        if(!response.ok) throw new Error(data.error||"Could not load countries");
        return data;
      })
      .then(data=>{
        const list=Array.isArray(data.countries)?data.countries:[];
        setCountries(list);

        // Refresh the default placeholder country object with the canonical
        // metadata returned by the country list.
        if(value.length){
          const byCode=new Map(list.map((country:CountryOption)=>[country.code,country]));
          const refreshed=value.map(country=>byCode.get(country.code)||country);
          if(refreshed.some((country,index)=>country!==value[index])) onChange(refreshed);
        }
      })
      .catch(err=>{
        if(err?.name!=="AbortError") setError(err instanceof Error?err.message:"Could not load countries");
      })
      .finally(()=>setLoading(false));

    return ()=>controller.abort();
  },[]);

  useEffect(()=>{
    function onPointerDown(event:MouseEvent){
      if(rootRef.current&&!rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event:KeyboardEvent){
      if(event.key==="Escape") setOpen(false);
    }

    document.addEventListener("mousedown",onPointerDown);
    document.addEventListener("keydown",onKeyDown);
    return ()=>{
      document.removeEventListener("mousedown",onPointerDown);
      document.removeEventListener("keydown",onKeyDown);
    };
  },[]);

  useEffect(()=>{
    if(open) setTimeout(()=>searchRef.current?.focus(),0);
  },[open]);

  const selectedCodes=useMemo(()=>new Set(value.map(country=>country.code)),[value]);

  const filtered=useMemo(()=>{
    const term=query.trim().toLowerCase();
    if(!term) return countries;

    return countries.filter(country=>
      country.name.toLowerCase().includes(term)||
      country.code.toLowerCase().includes(term)||
      country.iso2.toLowerCase().includes(term)||
      country.region.toLowerCase().includes(term)
    );
  },[countries,query]);

  function toggle(country:CountryOption){
    if(selectedCodes.has(country.code)){
      onChange(value.filter(item=>item.code!==country.code));
    }else{
      onChange([...value,country]);
    }
  }

  const label=value.length===0
    ?"Select countries"
    :value.length===1
      ?value[0].name
      :value.length===2
        ?value.map(country=>country.name).join(", ")
        :value[0].name+" +"+(value.length-1);

  return <div className="countrySelect" ref={rootRef}>
    <button
      className="countrySelectButton"
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={()=>setOpen(current=>!current)}
    >
      <span className="countrySelectButtonText">{label}</span>
      <span className="countrySelectCount">{value.length||""}</span>
      <span className="countrySelectChevron" aria-hidden="true">⌄</span>
    </button>

    {open&&<div className="countrySelectPopover">
      <div className="countrySelectSearch">
        <input
          ref={searchRef}
          className="input"
          value={query}
          onChange={event=>setQuery(event.target.value)}
          placeholder="Search country or code"
          aria-label="Search countries"
        />
      </div>

      {value.length>0&&<div className="countrySelected">
        <div className="countrySelectedHead">
          <strong>{value.length} selected</strong>
          <button type="button" onClick={()=>onChange([])}>Clear</button>
        </div>
        <div className="countryChips">
          {value.map(country=><button
            type="button"
            className="countryChip"
            key={country.code}
            onClick={()=>toggle(country)}
            title={"Remove "+country.name}
          >
            {flag(country.iso2)} {country.name} <span>×</span>
          </button>)}
        </div>
      </div>}

      <div className="countryList" role="listbox" aria-multiselectable="true">
        {loading&&<div className="countryListState">Loading countries…</div>}
        {error&&<div className="countryListState errorText">{error}</div>}
        {!loading&&!error&&filtered.map(country=><button
          type="button"
          role="option"
          aria-selected={selectedCodes.has(country.code)}
          className={"countryOption "+(selectedCodes.has(country.code)?"selected":"")}
          key={country.code}
          onClick={()=>toggle(country)}
        >
          <span className="countryFlag">{flag(country.iso2)}</span>
          <span className="countryOptionCopy">
            <strong>{country.name}</strong>
            <small>{country.code} · {country.region}</small>
          </span>
          <span className="countryCheck" aria-hidden="true">{selectedCodes.has(country.code)?"✓":""}</span>
        </button>)}
        {!loading&&!error&&!filtered.length&&<div className="countryListState">No country matches “{query}”.</div>}
      </div>
    </div>}
  </div>;
}
