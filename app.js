(function(){
  const qs=(s,c=document)=>c.querySelector(s);
  const qsa=(s,c=document)=>[...c.querySelectorAll(s)];
  const toast=qs('#toast');
  const CART_KEY='pdw-selected-series-v2';

  function notify(msg){
    if(!toast) return;
    toast.textContent=msg;
    toast.classList.add('show');
    clearTimeout(window.__toast);
    window.__toast=setTimeout(()=>toast.classList.remove('show'),2200);
  }

  qsa('[data-toggle-filters]').forEach(b=>b.addEventListener('click',()=>qs('.filter-rail')?.classList.toggle('open')));
  qsa('[data-drawer]').forEach(b=>b.addEventListener('click',()=>{ const id=b.dataset.drawer; qs('#'+id)?.classList.add('open'); }));
  qsa('[data-close-drawer]').forEach(b=>b.addEventListener('click',()=>b.closest('.drawer-backdrop')?.classList.remove('open')));
  qsa('.drawer-backdrop').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.classList.remove('open')}));

  const defaults=[
    {code:'NY.GDP.MKTP.KD.ZG',title:'GDP growth',source:'World Bank'},
    {code:'CPI_IX',title:'Consumer price inflation',source:'IMF'},
    {code:'UNE_DEAP_SEX_AGE_RT',title:'Unemployment rate by sex and age',source:'ILO'}
  ];

  function loadCart(){
    try{
      const raw=localStorage.getItem(CART_KEY);
      if(!raw) return new Map(defaults.map(x=>[x.code,x]));
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed)) throw new Error('Invalid cart');
      return new Map(parsed.filter(x=>x&&x.code).map(x=>[x.code,x]));
    }catch(_){
      return new Map(defaults.map(x=>[x.code,x]));
    }
  }
  const selected=loadCart();
  let inspectedSeries=null;

  function persistCart(){
    try{ localStorage.setItem(CART_KEY,JSON.stringify([...selected.values()])); }catch(_){}
  }

  function seriesFromRow(row){
    return {
      code:row?.dataset.code||'',
      title:row?.dataset.title||'Untitled series',
      source:row?.dataset.source||'Unknown source'
    };
  }

  function setButtonState(btn,isSelected,labels){
    if(!btn) return;
    const addLabel=labels?.add||'Add';
    const removeLabel=labels?.remove||'Remove';
    btn.textContent=isSelected?removeLabel:addLabel;
    btn.disabled=false;
    btn.setAttribute('aria-pressed',String(isSelected));
    btn.classList.toggle('selected-action',isSelected);
  }

  function updateCartUI(){
    qsa('[data-cart-count]').forEach(el=>el.textContent=String(selected.size));

    qsa('.result-row').forEach(row=>{
      const code=row.dataset.code;
      const btn=qs('[data-add-series]',row);
      setButtonState(btn,selected.has(code),{add:'Add',remove:'Remove'});
    });

    if(inspectedSeries){
      setButtonState(qs('[data-inspector-cart]'),selected.has(inspectedSeries.code),{add:'Add series',remove:'Remove series'});
    }

    const list=qs('[data-cart-items]');
    const empty=qs('[data-cart-empty]');
    const build=qs('[data-build-dataset]');
    if(list){
      list.innerHTML='';
      [...selected.values()].forEach(item=>{
        const row=document.createElement('div');
        row.className='cart-item';
        const copy=document.createElement('div');
        copy.className='cart-item-copy';
        const strong=document.createElement('strong');
        strong.textContent=item.title;
        const small=document.createElement('small');
        small.textContent=item.source;
        copy.append(strong,small);
        const remove=document.createElement('button');
        remove.type='button';
        remove.className='cart-remove';
        remove.dataset.cartRemove=item.code;
        remove.setAttribute('aria-label','Remove '+item.title+' from data cart');
        remove.textContent='Remove';
        row.append(copy,remove);
        list.append(row);
      });
    }
    if(empty) empty.hidden=selected.size!==0;
    if(build){
      build.classList.toggle('disabled-link',selected.size===0);
      build.setAttribute('aria-disabled',String(selected.size===0));
    }
  }

  function addSeries(series,silent=false){
    if(!series?.code) return;
    selected.set(series.code,series);
    persistCart();
    updateCartUI();
    if(!silent) notify('Series added to the data cart');
  }

  function removeSeries(code,silent=false){
    if(!code||!selected.has(code)) return;
    const item=selected.get(code);
    selected.delete(code);
    persistCart();
    updateCartUI();
    if(!silent) notify((item?.title||'Series')+' removed from the data cart');
  }

  function toggleSeries(series){
    if(!series?.code) return;
    if(selected.has(series.code)) removeSeries(series.code);
    else addSeries(series);
  }

  qsa('[data-add-series]').forEach(b=>b.addEventListener('click',()=>{
    const row=b.closest('.result-row');
    if(row) toggleSeries(seriesFromRow(row));
  }));

  document.addEventListener('click',e=>{
    const remove=e.target.closest('[data-cart-remove]');
    if(remove) removeSeries(remove.dataset.cartRemove);
  });

  qsa('[data-inspect]').forEach(b=>b.addEventListener('click',()=>{
    const row=b.closest('.result-row');
    const d=qs('#series-inspector');
    if(!d||!row) return;
    inspectedSeries=seriesFromRow(row);
    qs('[data-inspector-title]',d).textContent=inspectedSeries.title;
    qs('[data-inspector-source]',d).textContent=inspectedSeries.source;
    qs('[data-inspector-code]',d).textContent=inspectedSeries.code;
    setButtonState(qs('[data-inspector-cart]',d),selected.has(inspectedSeries.code),{add:'Add series',remove:'Remove series'});
    d.classList.add('open');
  }));

  const inspectorToggle=qs('[data-inspector-cart]');
  if(inspectorToggle) inspectorToggle.addEventListener('click',()=>{ if(inspectedSeries) toggleSeries(inspectedSeries); });

  const searchForm=qs('[data-global-search]');
  if(searchForm) searchForm.addEventListener('submit',e=>{
    e.preventDefault();
    const v=qs('input',searchForm)?.value.trim();
    if(v) location.href='discover.html?q='+encodeURIComponent(v);
  });

  const params=new URLSearchParams(location.search);
  const query=params.get('q');
  if(query){
    qsa('[data-query-text]').forEach(el=>el.textContent=query);
    const input=qs('[data-discover-query]');
    if(input) input.value=query;
  }

  qsa('[data-resolver-choice]').forEach(b=>b.addEventListener('click',()=>{
    qsa('[data-resolver-choice]').forEach(x=>x.classList.remove('primary'));
    b.classList.add('primary');
    const selection=qs('#resolver-selection');
    if(selection) selection.textContent='Selected: '+b.dataset.resolverChoice;
    notify('Series construction updated');
  }));

  qsa('[data-tab]').forEach(tab=>tab.addEventListener('click',()=>{
    const name=tab.dataset.tab;
    qsa('[data-tab]').forEach(t=>t.classList.toggle('active',t===tab));
    qsa('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name);
  }));

  qsa('[data-transform]').forEach(b=>b.addEventListener('click',()=>{
    b.textContent='Created';
    b.disabled=true;
    notify(b.dataset.transform+' added to the dataset');
  }));

  const sourceSearch=qs('#source-search');
  if(sourceSearch) sourceSearch.addEventListener('input',()=>{
    const v=sourceSearch.value.toLowerCase();
    qsa('.source-entry').forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(v));
  });

  qsa('[data-filter-provider]').forEach(cb=>cb.addEventListener('change',applyFilters));
  function applyFilters(){
    const selectedProviders=qsa('[data-filter-provider]:checked').map(x=>x.value);
    qsa('.result-row').forEach(row=>{ row.hidden=selectedProviders.length>0&&!selectedProviders.includes(row.dataset.source); });
  }

  const build=qs('[data-build-dataset]');
  if(build) build.addEventListener('click',e=>{
    if(selected.size===0){ e.preventDefault(); notify('Add at least one series before building a dataset'); }
  });

  updateCartUI();
})();
