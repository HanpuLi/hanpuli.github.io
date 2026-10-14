'use strict';
(() => {
  const MAX_UNITS=24, STORAGE_KEY='poetry-voucher-bag-v1', ORDER_KEY='poetry-voucher-order-v1-';
  const pageKind=typeof document!=='undefined'?document.body.dataset.page:'',orderPage=pageKind==='order',editionPage=pageKind==='edition';
  const EDIT_KEY='poetry-voucher-edition-edit-v1';
  let orderPageStatus=null;
  const el=id=>document.getElementById(id);
  const t=key=>SHOP_COPY[key]?.[SHOP_LANGS.indexOf(uiLocale)]||SHOP_COPY[key]?.[0]||key;
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const button=(text,action,className='text-button')=>{const n=node('button',text,className);n.type='button';n.addEventListener('click',action);return n;};
  let retainedCustom=[],bag=[],editingId=null,editingLocale='en',busy=false,ready=false,storageOK=true,canNavigate=true,toastTimer,toastKey=null,editorStatusKey=null,checkoutStatusKey=null,orders=[],pendingOrder=null,pendingPlan=null,catalogueExpanded=false,previewTimer=null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const units=()=>bag.reduce((sum,line)=>sum+line.quantity,0);
  const keyOf=line=>JSON.stringify([line.workId,line.title,line.author,line.poem,line.locale,line.translations,line.font,line.size]);
  const findWork=id=>works.find(work=>work.id===id||work.legacy_ids?.includes(id));
  const workFor=line=>findWork(line.workId);
  function quote(line){const w=workFor(line),additions=(line.translations||[]).map(locale=>({locale,body:w?.translations?.[locale]?.body||''}));return quotePoem(w?.poem||line.poem,additions,line.font,!w);}
  function validateLine(raw){
    if(!raw||typeof raw!=='object'||!Number.isInteger(raw.quantity)||raw.quantity<1||raw.quantity>MAX_UNITS)throw Error('quantity');
    if(!['bitmap','site'].includes(raw.font)||!typeSizes(raw.font).includes(raw.size))throw Error('type');
    if(!SHOP_LANGS.includes(raw.locale))throw Error('locale');
    const w=findWork(raw.workId);
    if(!w)throw Error('catalogue-only');
    const legacy=raw.language&&raw.language!=='receipt'?raw.language:null;
    const locale=w?(raw.locale==='zh-Hans'||legacy==='zh-Hans'?'zh-Hans':'zh-Hant'):raw.locale;
    const translations=w?(Array.isArray(raw.translations)?raw.translations:legacy&&legacy!=='zh-Hans'?[legacy]:[]):[];
    if(translations.length>5||new Set(translations).size!==translations.length||translations.some(value=>!['en','ja','de','fr','ru'].includes(value)||!w.translations?.[value]))throw Error('translation');
    const line={id:crypto.randomUUID(),workId:w?.id||null,font:raw.font,size:raw.size,locale,translations:['en','ja','de','fr','ru'].filter(value=>translations.includes(value)),quantity:raw.quantity};
    if(raw.workId&&!w)throw Error('work');
    if(w){line.title=locale==='zh-Hans'?w.translations['zh-Hans'].title:w.title;line.author=w.author;line.poem=locale==='zh-Hans'?w.translations['zh-Hans'].body:w.poem;}
    else {for(const k of ['title','author','poem']){if(typeof raw[k]!=='string'||raw[k].length>INPUT_LIMITS[k])throw Error('text');line[k]=raw[k];}}
    if(!line.title.trim()||!line.poem.trim()||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(line.title+line.author+line.poem)||/[\r\n]/.test(line.title+line.author))throw Error('text');
    if(!quote(line).price)throw Error('empty');
    return line;
  }
  function renderToast(key){const toast=el('shop-status');toast.replaceChildren(document.createTextNode(t(key)));if(key==='added'&&!editionPage){const next=button(t('viewBag'),()=>{if(!el('bag-dialog').open)show('bag-dialog');toast.classList.remove('visible');},'toast-action');toast.append(' ',next);}}
  function notify(key){toastKey=key;if(!editionPage&&el('product-editor').open){editorStatusKey=key;el('editor-status').textContent=t(key);}renderToast(key);el('shop-status').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('shop-status').classList.remove('visible'),4500);}
  function persist(){
    const payload=JSON.stringify({version:1,savedAt:Date.now(),saveCustom:retainedCustom.length>0,lines:bag,retiredCustom:retainedCustom});
    let tabSaved=false;
    try{localStorage.setItem(STORAGE_KEY,payload);storageOK=true;}catch{storageOK=false;}
    try{sessionStorage.setItem(STORAGE_KEY,payload);tabSaved=true;}catch{}
    canNavigate=storageOK||tabSaved;
    el('storage-note').textContent=t(storageOK?'storage':tabSaved?'storageError':'storageBlocked');
  }
  function restore(){
    let rejected=false;
    try{
      // Prefer the newest validated snapshot. A session copy keeps an active bag
      // alive across the real product document when persistent storage is denied.
      const candidates=[];let sameTab=false;
      for(const storageName of ['localStorage','sessionStorage']){
        try{const raw=window[storageName].getItem(STORAGE_KEY);if(raw){candidates.push(JSON.parse(raw));if(storageName==='sessionStorage')sameTab=true;}}catch{}
      }
      const saved=candidates.sort((a,b)=>(b?.savedAt||0)-(a?.savedAt||0))[0];
      if(!saved){persist();return;}
      if(saved.version!==1||!Array.isArray(saved.lines)||saved.lines.length>MAX_UNITS)throw Error('version');
      // Do not silently delete previously consented custom text when retiring its editor.
      retainedCustom=saved.saveCustom===true?[...saved.lines,...(Array.isArray(saved.retiredCustom)?saved.retiredCustom:[])].filter(line=>line&&typeof line==='object'&&!line.workId):[];
      for(const candidate of saved.lines){if(!candidate?.workId)continue;try{const line=validateLine(candidate);if(units()+line.quantity>MAX_UNITS)throw Error('limit');const match=bag.find(x=>keyOf(x)===keyOf(line));if(match)match.quantity+=line.quantity;else bag.push(line);}catch{rejected=true;}}
      if(rejected)notify('recovered');else if(retainedCustom.length)notify('legacyCustom');else if(bag.length&&!sameTab)notify('restored');
    }catch{rejected=true;notify('recovered');}
    // Re-save only validated data. Without persistent storage the bag lives in this
    // tab's session storage; only with both unavailable does the product page refuse
    // to leave (saveEditor), because the selection could not survive the navigation.
    persist();
  }
  function show(id){el(id).showModal();}
  function close(id){el(id).close();}
  const isEditorActive=()=>editionPage||el('product-editor').open;
  // Leaving a product returns to the shelf it came from, with focus on its card;
  // leaving after an edit returns to the bag that was being edited.
  function backToCatalogue(toBag=false){
    const params=new URLSearchParams({lang:uiLocale});
    const work=currentWork(),shelf=new URL(location.href).searchParams.get('collection')||work?.shelf||el('shop-filter').value;
    if(shelf&&shelf!=='all')params.set('collection',shelf);
    if(toBag)params.set('bag','1');
    return 'shop.html?'+params.toString()+(!toBag&&work?'#work-choose-'+work.id:'');
  }
  function syncCollectionURL(){
    if(editionPage||orderPage)return;
    const url=new URL(location.href),filter=el('shop-filter').value;
    if(filter&&filter!=='all'&&!el('shop-search').value.trim())url.searchParams.set('collection',filter);else url.searchParams.delete('collection');
    url.hash='';history.replaceState(null,'',url);
  }
  function productHeading(){
    if(!editionPage)return;
    const work=currentWork();if(!work)return;
    const title=localeTitle(work),shelf=work.shelf_labels?.[uiLocale]||work.collection;
    el('edition-product-title').textContent=title;
    el('edition-collection').textContent=shelf;
    el('edition-back').href=backToCatalogue(!!editingId);
    el('edition-back').textContent=editingId?t('backToBag'):t('backToShelf').replace('{collection}',shelf);
    el('edition-editing').hidden=!editingId;
    el('edition-from').textContent=t('editionFrom').replace('{base}',uiMoney(quotePoem(work.poem,[],'bitmap',false).price)).replace('{price}',uiMoney(TARIFF.addOn));
    document.title=title+' · Poetry Voucher · Hanpu Li';
    document.querySelector('meta[name="description"]').content=title+' · '+t('editionDelivery');
  }
  function editionLink(workId,edit=false){
    const work=findWork(workId),params=new URLSearchParams({lang:uiLocale,work:work.id,collection:work.shelf});
    if(edit)params.set('edit','1');
    return 'edition.html?'+params.toString();
  }
  function localeTitle(work){const title=work.translations?.[uiLocale]?.title||work.title;return work.part_id?`${title} · ${(work.edition_labels?.[uiLocale]||work.edition).split(' · ')[0]}`:title;}
  function catalogueFilters(){
    const select=el('shop-filter'),selected=select.value;
    const options=[['all',t('all')]],seen=new Set();
    for(const work of works)if(!seen.has(work.shelf)){seen.add(work.shelf);options.push([work.shelf,work.shelf_labels?.[uiLocale]||work.collection]);}
    select.replaceChildren(...options.map(([value,label])=>{const option=node('option',label);option.value=value;return option;}));
    select.value=options.some(([value])=>value===selected)?selected:'all';
  }
  const contentLang=locale=>locale==='zh-Hant'?'zh-Hant-HK':locale;
  const lineTitle=line=>line.work?localeTitle(line.work):workFor(line)?localeTitle(workFor(line)):line.title;
  const displayLang=line=>(line.work||workFor(line))?.translations?.[uiLocale]?contentLang(uiLocale):contentLang(line.locale);
  const languageName=locale=>new Intl.DisplayNames([document.documentElement.lang],{type:'language'}).of(locale);
  function editorReading(){
    const work=currentWork(),original=unchanged(work),reading=work?.translations?.[uiLocale]||work;
    el('shop-reading').hidden=!original;el('original-language-note').hidden=!original;
    if(original){el('shop-reading-title').textContent=reading.title;el('shop-reading-text').textContent=reading.body||reading.poem;el('shop-reading-title').lang=el('shop-reading-text').lang=work.translations?.[uiLocale]?contentLang(uiLocale):'zh-Hant-HK';}
    for(const id of ['title','author','poem'])el(id).lang=original?contentLang(el('original-script').value):contentLang(editingLocale);
    el('original-language-note').textContent=el('original-script').value==='zh-Hans'?t('originalSimplified'):t('originalLanguage');
  }
  function defaultEdition(work){
    return {workId:work.id,locale:uiLocale==='zh-Hans'?'zh-Hans':'zh-Hant',translations:[],font:'bitmap',size:TYPE_CONFIG.defaultSize,quantity:1};
  }
  function catalogue(){
    const grid=el('product-grid'),picker=el('collection-picker'),search=el('shop-search').value.trim().toLocaleLowerCase(),filter=el('shop-filter').value;
    const groups=[],byShelf=new Map();
    for(const work of works){
      if(!byShelf.has(work.shelf)){const group={shelf:work.shelf,title:work.shelf_labels?.[uiLocale]||work.collection,count:0};byShelf.set(work.shelf,group);groups.push(group);}
      byShelf.get(work.shelf).count++;
    }
    picker.replaceChildren();
    for(const [index,group] of groups.entries()){
      const tile=node('button',undefined,'collection-tile');tile.type='button';
      tile.append(node('span',String(index+1).padStart(2,'0'),'collection-no'),node('strong',group.title),node('span',t('poemCount').replace('{count}',group.count),'collection-count'));
      tile.addEventListener('click',()=>{el('shop-search').value='';el('shop-filter').value=group.shelf;catalogueExpanded=false;catalogue();syncCollectionURL();el('current-collection').focus({preventScroll:true});el('catalogue-heading').scrollIntoView({block:'start'});});
      picker.append(tile);
    }
    const showWorks=!!search||filter!=='all'||catalogueExpanded;
    picker.hidden=showWorks;el('browse-all').hidden=showWorks;el('collection-navigation').hidden=!showWorks;grid.hidden=!showWorks;
    el('current-collection').textContent=search?t('search'):filter!=='all'?(byShelf.get(filter)?.title||t('collection')):t('all');
    grid.replaceChildren();let count=0;
    for(const work of works){
      if(filter!=='all'&&work.shelf!==filter)continue;
      const title=localeTitle(work),edition=work.translations?.[uiLocale];
      const haystack=[title,work.title,work.source_id,work.poem,edition?.body||''].join(' ').toLocaleLowerCase();
      if(search&&!haystack.includes(search))continue;
      count++;
      const card=node('article',undefined,'product-card'),head=node('div',undefined,'product-meta');
      head.append(node('span',work.authorial_label||work.edition_labels?.[uiLocale]||work.edition),node('span',work.shelf_labels?.[uiLocale]||work.collection));
      const heading=node('h3',title),excerpt=node('p',(edition?.body||work.poem).split('\n').filter(Boolean).slice(0,3).join('\n'),'product-excerpt');
      if(!edition){heading.lang='zh-Hant-HK';excerpt.lang='zh-Hant-HK';}
      const amount=quotePoem(work.poem,[],'bitmap',false).price;
      const foot=node('div',undefined,'product-foot'),price=node('strong',t('priceFrom').replace('{price}',uiMoney(amount)),'product-price');
      foot.append(price);
      const actions=node('div',undefined,'product-actions'),choose=window.parent===window?Object.assign(node('a',t('choose'),'choose-button'),{href:editionLink(work.id)}):button(t('choose'),()=>openEditor(work.id),'choose-button');
      heading.id='work-title-'+work.id;choose.id='work-choose-'+work.id;choose.setAttribute('aria-labelledby',choose.id+' '+heading.id);actions.append(choose);
      card.append(head,heading,excerpt,foot,actions);grid.append(card);
    }
    el('catalogue-count').textContent=showWorks?String(count).padStart(2,'0')+' / '+String(works.length).padStart(2,'0'):t('collectionWorks').replace('{count}',works.length);
    el('no-results').hidden=!showWorks||count>0;
  }
  function addDefault(work){editingId=null;insert(validateLine(defaultEdition(work)));}
  function insert(line){
    const previous=bag.find(x=>x.id===editingId),quantity=previous?.quantity||line.quantity;
    if(units()-(previous?.quantity||0)+quantity>MAX_UNITS){notify('limit');return false;}
    bag=bag.filter(x=>x.id!==editingId);line.quantity=quantity;
    const match=bag.find(x=>keyOf(x)===keyOf(line));if(match)match.quantity+=quantity;else bag.push(line);
    const edited=!!editingId;editingId=null;pendingOrder=null;pendingPlan=null;persist();renderBag();notify(edited?'updated':'added');return true;
  }
  function schedulePreview(){
    clearTimeout(previewTimer);
    if(!isEditorActive())return;
    el('preview-status').textContent=t('previewWorking');el('preview-status').classList.remove('is-error');el('full-image').hidden=true;
    previewTimer=setTimeout(async()=>{
      if(!isEditorActive())return;
      await generate();
      if(isEditorActive()){const failed=el('full-image').hidden;el('preview-status').textContent=t(failed?'previewError':'previewReady');el('preview-status').classList.toggle('is-error',failed);}
    },220);
  }
  function openEditor(workId,line=null){
    const selected=findWork(workId);
    if(!selected){notify('authorOnly');return;}
    // Public purchasing has a real product URL and a normal document scroll.
    // Only the paired local printer iframe keeps its legacy embedded editor.
    if(!editionPage&&window.parent===window){
      if(line){try{sessionStorage.setItem(EDIT_KEY,JSON.stringify({workId,line}));}catch{notify('storageBlocked');return;}}
      location.assign(editionLink(workId,!!line));return;
    }
    editorStatusKey=null;el('editor-status').textContent='';editingId=line?.id||null;editingLocale=line?.locale||uiLocale;
    el('work').value=workId;loadWork();
    if(line){for(const k of ['title','author','poem'])el(k).value=line[k];el('font').value=line.font;el('original-script').value=line.locale;document.querySelectorAll('#translation-options input').forEach(input=>input.checked=line.translations.includes(input.value));syncTypeSize();el('size').value=String(line.size);dirty();}
    else {const preset=defaultEdition(selected);el('font').value=preset.font;syncTypeSize();el('size').value=String(preset.size);el('original-script').value=preset.locale;if(preset.locale==='zh-Hans'){const simplified=selected.translations?.['zh-Hans'];if(simplified){el('title').value=simplified.title;el('poem').value=simplified.body;}}document.querySelectorAll('#translation-options input').forEach(input=>input.checked=preset.translations.includes(input.value));dirty();}
    document.querySelector('#product-editor .advanced-type').open=false;
    el('save-line').textContent=t(line?'save':'add');editorPrice();
    if(editionPage){
      const url=new URL(location.href);if(url.searchParams.get('work')!==workId){url.searchParams.set('work',workId);history.replaceState(null,'',url);}
      productHeading();document.querySelector('[data-view="voucher"]')?.click();
    }else show('product-editor');
    schedulePreview();
  }
  // Editing from a bag always opens that work's own product URL in edit mode, so a reload keeps it.
  function editLine(line){
    if(window.parent!==window){openEditor(line.workId,line);return;}
    try{sessionStorage.setItem(EDIT_KEY,JSON.stringify({workId:line.workId,line}));}catch{notify('storageBlocked');return;}
    location.assign(editionLink(line.workId,true));
  }
  function editorPrice(){editorReading();for(const option of el('size').options)option.textContent=sizeName(Number(option.value));if(editionPage){const w=currentWork();if(w)el('edition-summary').textContent=lineSummary({workId:w.id,locale:el('original-script').value,translations:[...document.querySelectorAll('#translation-options input:checked')].map(input=>input.value),font:el('font').value,size:Number(el('size').value)});}el('typeface-note').dataset.owner='shop';el('typeface-note').textContent=t('typefaceShopNote').replace('{price}',uiMoney(TARIFF.addOn));try{el('editor-price').textContent=uiMoney(updatePrice().price);}catch{el('editor-price').textContent='—';}}
  function saveEditor(){
    if(editionPage&&!canNavigate){notify('storageBlocked');return;}
    const w=currentWork(),original=unchanged(w);
    if(!original){notify('authorOnly');return;}
    if(!el('title').value.trim()||!el('poem').value.trim()){notify('required');return;}
    try{const line=validateLine({workId:original?w.id:null,title:el('title').value.trim(),author:el('author').value,poem:el('poem').value.replace(/\r\n?/g,'\n'),locale:original?el('original-script').value:editingLocale,translations:original?[...document.querySelectorAll('#translation-options input:checked')].map(input=>input.value):[],font:el('font').value,size:Number(el('size').value),quantity:1});if(insert(line)){if(editionPage){try{sessionStorage.removeItem(EDIT_KEY);}catch{}const url=new URL(location.href);if(url.searchParams.has('edit')){url.searchParams.delete('edit');history.replaceState(null,'',url);}el('save-line').textContent=t('add');productHeading();show('bag-dialog');}else close('product-editor');}}
    catch{notify('invalid');}
  }
  // Dot counts are printer settings; readers choose a named size.
  function sizeName(size){const standard=TYPE_CONFIG.defaultSize;return t(size===standard?'sizeStandard':size<standard?'sizeSmall':'sizeLarge');}
  function lineSpecs(line){
    const script=line.workId?t(line.locale==='zh-Hans'?'simplified':'traditional'):languageName(line.locale);
    const specs=[[t('lineOriginal'),script]];
    if(line.translations.length)specs.push([t('lineTranslations'),line.translations.map(languageName).join(/^(zh|ja)/.test(uiLocale)?'、':', ')]);
    specs.push([t('lineType'),(line.font==='site'?tr('網站字體'):t('typePixel'))+' · '+sizeName(line.size)]);
    return specs;
  }
  const lineSummary=line=>lineSpecs(line).map(([,value])=>value).join(' · ');
  function specList(line){const list=node('dl',undefined,'line-specs');for(const [term,value] of lineSpecs(line)){const row=node('div');row.append(node('dt',term),node('dd',value));list.append(row);}return list;}
  // The bag shows the actual poem being bought: a crop of its rendered voucher from the title down.
  const thumbs=new Map();
  async function thumbnail(line,img){
    const key=keyOf(line);
    if(!thumbs.has(key))thumbs.set(key,(async()=>{
      const work=workFor(line),translations=line.translations.map(locale=>({locale,...work.translations[locale]}));
      const sample=line.poem+line.title+translations.map(item=>item.title+item.body).join('')+'李函璞';
      await Promise.all(['EB','Courier','ShipCommon','Ship','HanpuGap','Hanpu Chinese Common','Hanpu Chinese',...new Set([line.locale,'en',...line.translations].map(bitmapFace))].map(font=>document.fonts.load(`${TYPE_CONFIG.defaultSize}px "${font}"`,sample)));
      const paper=new PagedPaper({kind:'VOUCHER',ref:'PREVIEW'}),text=paper.text.bind(paper);let top=null;paper.threshold=TYPE_CONFIG.threshold[line.font];
      paper.text=(value,...rest)=>{if(top===null&&value===line.title)top=paper.y;return text(value,...rest);};
      renderVoucherBody(paper,{...line,work,original:true,translations},paperVoucherId(work,'PREVIEW'),line.font==='site'?siteSerif(line.locale):bitmapFamily(line.locale),locale=>line.font==='site'?siteSerif(locale):bitmapFamily(locale));
      const page=paper.finishPages()[0],y=Math.max(0,(top??0)-16),height=Math.min(page.height-y,480),crop=canvas(page.width,height);
      crop.getContext('2d').drawImage(page,0,y,page.width,height,0,0,page.width,height);return crop.toDataURL('image/png');
    })().catch(error=>{console.warn('Bag thumbnail unavailable',error);return '';}));
    const src=await thumbs.get(key);if(src&&img.isConnected){img.src=src;img.hidden=false;}
  }
  function renderBag(focusId=null){
    el('bag-count').textContent=String(units());const container=el('bag-lines');container.replaceChildren();
    if(!bag.length)container.append(node('p',t('empty'),'empty-bag'));
    for(const line of bag){
      const q=quote(line),row=node('article',undefined,'bag-line'),heading=node('h3',lineTitle(line)),details=specList(line),thumb=node('img',undefined,'bag-thumb'),body=node('div',undefined,'bag-line-body');
      thumb.alt='';thumb.width=64;thumb.height=80;thumb.hidden=true;thumbnail(line,thumb);
      heading.lang=displayLang(line);
      const charges=node('details',undefined,'bag-charges'),cost=node('summary',t('priceBreakdown'));charges.append(cost);for(const item of q.items)charges.append(node('span',`${tr(item.label)} ${uiMoney(itemAmount(item))}`));
      const actions=node('div',undefined,'bag-actions'),label=node('label',t('quantity')),input=node('input');input.type='number';input.min='1';input.max=String(MAX_UNITS);input.step='1';input.value=line.quantity;input.id='qty-'+line.id;input.setAttribute('aria-label',t('quantity')+' · '+lineTitle(line));
      input.addEventListener('change',()=>{const quantity=Number(input.value);if(!Number.isInteger(quantity)||quantity<1||units()-line.quantity+quantity>MAX_UNITS){input.value=line.quantity;notify('limit');return;}line.quantity=quantity;pendingOrder=null;pendingPlan=null;persist();renderBag(input.id);});label.append(input);
      actions.append(label,button(t('edit'),()=>editLine(line)),button(t('remove'),()=>{bag=bag.filter(x=>x.id!==line.id);pendingOrder=null;pendingPlan=null;persist();renderBag();notify('updated');el('to-checkout').focus();},'text-button remove-line'),node('strong',uiMoney(q.price*line.quantity),'line-total'));
      body.append(heading,details,charges,actions);row.append(thumb,body);container.append(row);
    }
    el('bag-total').textContent=uiMoney(bag.reduce((sum,line)=>sum+quote(line).price*line.quantity,0));el('to-checkout').disabled=!bag.length||busy;
    el('storage-note').textContent=t(storageOK?'storage':'storageError');if(focusId)el(focusId)?.focus();
  }
  function renderCheckout(){
    const summary=el('checkout-summary');summary.replaceChildren();
    for(const line of bag){const row=node('div',undefined,'checkout-line'),name=node('span',`${lineTitle(line)} × ${line.quantity}`);name.append(node('small',lineSummary(line),'micro'));row.append(name,node('strong',uiMoney(quote(line).price*line.quantity)));summary.append(row);}
    el('checkout-total').textContent=el('bag-total').textContent;
  }
  const adapter=()=>window.poetryCheckoutAdapter;
  async function checkout(){
    if(!bag.length||busy)return;
    renderCheckout();checkoutStatusKey=null;el('checkout-status').textContent='';close('bag-dialog');show('checkout-dialog');
    if(!adapter())return;
    busy=true;el('place-order').disabled=true;el('back-to-bag').disabled=true;
    try{await preparedCheckout();el('place-order').disabled=false;}
    catch(error){console.error('Checkout review failed',error);checkoutStatusKey='failed';el('checkout-status').textContent=t(checkoutStatusKey);}
    finally{busy=false;el('back-to-bag').disabled=false;}
  }
  async function preparedCheckout(){
    if(!pendingOrder)pendingOrder=await freezeOrder();
    if(!pendingPlan){
      if(adapter())await adapter().reserve(pendingOrder);
      PoetryOrder.validate(pendingOrder);
      pendingPlan=await prepare(pendingOrder);
    }
    if(adapter()&&!pendingPlan.reviewed){await adapter().review(pendingPlan);pendingPlan.reviewed=true;}
    return {order:pendingOrder,result:pendingPlan};
  }
  class PagedPaper extends Paper{
    constructor(identity){super();this.pages=[];this.identity=identity;this.transcript=[];}
    ensure(height){
      // Reserve a footer before laying out any content; short, single-page works stay unmarked.
      if(this.y+height<=PAPER_CONFIG.contentMaxDots-80){this.grow(this.y+height+600);return;}
      this.pages.push(super.finish());
      this.c=canvas(PAPER_CONFIG.printableDots,PAPER_CONFIG.initialCanvasDots);this.x=this.c.getContext('2d');this.y=PAPER_CONFIG.receiptInsetDots;
      if(this.identity){
        super.till(this.identity.kind+' CONT. '+(this.pages.length+1));
        super.till(this.identity.ref);super.till('-'.repeat(RECEIPT_CONFIG.lineChars));
      }
    }
    space(n){this.ensure(n);this.y+=n;}
    till(left='',right=null,center=false,tall=false){
      this.ensure(tall?48:24);
      this.transcript.push(left+(right===null?'':'  '+right));
      super.till(left,right,center,tall);
    }
    text(text,size=22,family=serif,center=false,leading=size+7,italic=false,weight=400){
      if(isBitmapFamily(family)){size=size<TYPE_CONFIG.pixelSmallCutoff?TYPE_CONFIG.pixelGrid:Math.max(TYPE_CONFIG.pixelMinBody,Math.round(size/TYPE_CONFIG.pixelGrid)*TYPE_CONFIG.pixelGrid);leading=Math.max(leading,size+8);italic=false;}
      const setFont=()=>{this.x.font=`${italic?'italic ':''}${weight} ${size}px ${family}`;this.x.textBaseline='alphabetic';};setFont();
      for(const part of wrapText(text,value=>this.x.measureText(value).width)){this.ensure(leading+4);setFont();const width=this.x.measureText(part).width;this.x.fillText(part,center?Math.round((PAPER_CONFIG.printableDots-width)/2):PAPER_CONFIG.bodyInsetDots,this.y+size);this.y+=leading;}
    }
    finishPages(){
      const pages=[...this.pages,super.finish()];
      if(pages.length===1)return pages;
      return pages.map((page,index)=>{
        const footer=new Paper();footer.threshold=this.threshold;
        footer.c=canvas(page.width,page.height+60);footer.x=footer.c.getContext('2d');footer.x.drawImage(page,0,0);footer.y=page.height+4;
        footer.till(this.identity.kind+' '+(index+1)+'/'+pages.length,index+1<pages.length?'CONTINUES':'END');
        return footer.finish();
      });
    }
  }
  function receiptPages(order){
    const p=new PagedPaper({kind:'RECEIPT',ref:order.ref}),meta=order.receiptMetadata||receiptMeta(order.ref),sep='-'.repeat(RECEIPT_CONFIG.lineChars),pay=order.payment;
    p.till('HANPU LI',null,true);p.till('POETRY VOUCHER',null,true);p.till('LONDON',null,true);p.till(RECEIPT_CONFIG.merchant.site,null,true);p.space(10);p.till('CUSTOMER COPY',null,true);
    p.till('STORE '+meta.store,'TILL '+meta.till);p.till('OPERATOR '+meta.operator,'TRANS '+meta.transaction);
    p.till(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric'}).format(order.created),new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(order.created));
    p.till('ORDER',order.ref);p.till(sep);p.till(receiptItemLine('QTY','DESCRIPTION','RSP(£)','AMT(£)'));p.till(sep);
    for(const line of order.lines){p.ensure(120);p.till('EDITION '+(line.work?.source_id||'CUSTOM'));for(const item of line.items)for(const text of receiptItemRows(item,line.work?.source_id||'CUSTOM'))p.till(text);p.space(8);}
    p.till(sep);p.till('RSP/AMT INCLUDE VAT',null,true);p.till('SUBTOTAL','GBP '+priceText(order.total));p.till('TOTAL TO PAY','GBP '+priceText(order.total),false,true);
    p.till('NUMBER OF VOUCHERS',String(order.units));p.till('NUMBER OF ITEMS',String(order.items.reduce((sum,item)=>sum+item.quantity,0)));p.space(10);
    p.till('VAT SUMMARY',null,true);p.till('RATE','NET VAT GROSS');for(const row of vatSummary(order.items))p.till(row.code+' '+row.rate+'%',[row.net,row.vat,row.gross].map(priceText).join(' '));p.till('NOT A VAT INVOICE',null,true);p.space(12);
    if(pay.method==='card'){p.till('PAYMENT SALE');p.till('TERMINAL',meta.terminal);p.till('PAYMENT REF',meta.paymentRef);p.till('CARD ENDING',meta.cardEnding);p.till('ENTRY',meta.entry);p.till('AMOUNT','GBP '+priceText(order.total));p.till('AUTH CODE',meta.auth);}
    else {p.till('CASH SALE');p.till('TENDERED','GBP '+priceText(pay.tender));p.till('CHANGE','GBP '+priceText(pay.change));}
    p.space(12);p.till('THANK YOU',null,true);p.ensure(100);const bits=barcodeBits(order.ref),module=Math.min(2,Math.floor((PAPER_CONFIG.printableDots-40)/bits.length));let x=(PAPER_CONFIG.printableDots-bits.length*module)/2;for(const bit of bits){if(bit==='1')p.x.fillRect(Math.floor(x),p.y,module,PAPER_CONFIG.barcodeHeightDots);x+=module;}p.space(PAPER_CONFIG.barcodeHeightDots+8);p.till(order.ref,null,true);p.space(8);
    p.till('ART EDITION',null,true);p.till('NO PAYMENT PROCESSED',null,true);p.till('NOT PROOF OF PURCHASE',null,true);const pages=p.finishPages();pages.transcript=p.transcript.join('\n');return pages;
  }
  function multipagePDF(pages){
    const encoder=new TextEncoder(),objects=[['<< /Type /Catalog /Pages 2 0 R >>'],[]],kids=[];
    for(const c of pages){const id=objects.length+1;kids.push(`${id} 0 R`);const w=PAPER_CONFIG.paperMm*PAPER_CONFIG.dotsPerMm,h=c.height+PAPER_CONFIG.pdfVerticalMarginDots*2,stride=Math.ceil(w/8),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data,data=new Uint8Array(stride*h).fill(255);
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(pixels[(y*c.width+x)*4]===0)data[(y+PAPER_CONFIG.pdfVerticalMarginDots)*stride+Math.floor((x+PAPER_CONFIG.pdfSideMarginDots)/8)]&=~(128>>((x+PAPER_CONFIG.pdfSideMarginDots)%8));
      const width=(PAPER_CONFIG.paperMm*72/25.4).toFixed(6),height=(h/PAPER_CONFIG.dotsPerMm*72/25.4).toFixed(6),stream=`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
      objects.push([`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`],[`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 1 /Interpolate false /Length ${data.length} >>\nstream\n`,data,'\nendstream'],[`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`]);
    }
    objects[1]=[`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`];const chunks=[],offsets=[0];let length=0;const add=part=>{const bytes=typeof part==='string'?encoder.encode(part):part;chunks.push(bytes);length+=bytes.length;};add('%PDF-1.4\n');objects.forEach((parts,i)=>{offsets.push(length);add(`${i+1} 0 obj\n`);parts.forEach(add);add('\nendobj\n');});const start=length;add(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`);offsets.slice(1).forEach(o=>add(String(o).padStart(10,'0')+' 00000 n \n'));add(`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);return new Blob(chunks,{type:'application/pdf'});
  }
  async function freezeOrder(){
    const random=new Uint32Array(2);crypto.getRandomValues(random);const created=new Date(),ref=receiptReference(created,crypto.getRandomValues(new Uint8Array(4)));
    const lines=bag.map(line=>{const copy=clone(line),q=quote(line);copy.work=clone(workFor(line)||null);copy.items=q.items.map(item=>({...item,quantity:line.quantity,amount:item.unitPrice*line.quantity}));copy.unitPrice=q.price;return copy;});
    const items=lines.flatMap(line=>line.items),total=items.reduce((sum,item)=>sum+itemAmount(item),0);
    return {schema:2,id:crypto.randomUUID(),ref,created,lines,items,total,units:units(),tariff:TARIFF.version,receiptMetadata:clone(receiptMeta(ref)),publication:{...clone(PUBLICATION_BUILD),textSnapshotSha256:await OrderReading.textHash(lines)},payment:automaticPayment(total,random[0]/4294967296,random[1]/4294967296)};
  }
  async function prepare(order){
    PoetryOrder.validate(order);
    if(order.publication?.textSnapshotSha256&&await OrderReading.textHash(order.lines)!==order.publication.textSnapshotSha256)throw Error('Saved text fingerprint does not match.');
    const sample=order.lines.map(line=>line.poem+line.title+line.author+line.translations.map(locale=>line.work?.translations?.[locale]?.body||'').join('')).join('')+'李函璞';
    await Promise.all(['EB','Courier','ShipCommon','Ship','HanpuGap','Hanpu Chinese Common','Hanpu Chinese',...new Set(SHOP_LANGS.map(bitmapFace))].map(font=>document.fonts.load(`${TYPE_CONFIG.defaultSize}px "${font}"`,sample)));
    await document.fonts.load(`italic ${TYPE_CONFIG.translation}px EB`);
    const receipt=receiptPages(order),vouchers=[];let index=0,rows=receipt.reduce((n,page)=>n+page.height,0),count=receipt.length;
    const cutHeight=cutHerePage().height;
    for(const line of order.lines){const translations=line.translations.map(locale=>({locale,...line.work.translations[locale]}));
      for(let unit=0;unit<line.quantity;unit++){
        index++;const voucherId=paperVoucherId(line.work,order.ref,index),paper=new PagedPaper({kind:'VOUCHER',ref:voucherId});paper.threshold=TYPE_CONFIG.threshold[line.font];
        const spec={...line,original:!!line.work,translations};
        renderVoucherBody(paper,spec,voucherId,line.font==='site'?siteSerif(line.locale):bitmapFamily(line.locale),locale=>line.font==='site'?siteSerif(locale):bitmapFamily(locale));
        const pages=paper.finishPages();rows+=cutHeight+pages.reduce((n,page)=>n+page.height,0);count+=1+pages.length;
        if(rows>120000||count>128)throw Error('Order exceeds page budget; reduce quantities or translations.');
        vouchers.push({id:voucherId,title:line.title,line,pages});
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    const result={receipt,vouchers};
    result.pages=continuousOrderPages(result);
    return result;
  }
  function cutHerePage(){
    const p=new Paper();p.space(22);p.till('-------- CUT HERE --------',null,true);p.space(22);return p.finish();
  }
  function continuousOrderPages(result){
    const pages=[];
    pages.push(...result.receipt);
    for(const voucher of result.vouchers){pages.push(cutHerePage(),...voucher.pages);}
    return pages;
  }
  function orderPages(result){return result.pages||(result.pages=continuousOrderPages(result));}
  function download(label,blob,name,urls){const link=node('a',label,'download-link');link.href=URL.createObjectURL(blob);link.download=name;urls.push(link.href);return link;}
  async function outputOrder(order,result){
    // Build off-DOM first: an export failure cannot clear the bag or erase an earlier order.
    const urls=[],section=node('article',undefined,'completed-order'),heading=node('div',undefined,'order-record'),proofs=node('div',undefined,'order-proof-grid');
    try{
      const title=node('h2'),meta=node('p'),payment=node('p',undefined,'micro'),hint=node('p',undefined,'micro');
      title.dataset.orderField='title';meta.dataset.orderField='meta';payment.dataset.orderField='payment';hint.dataset.shop='orderStorage';
      const fullLink=download(t('orderPdf'),multipagePDF(orderPages(result)),`poetry-order-${order.ref}.pdf`,urls);
      fullLink.dataset.shop='orderPdf';
      const h10Print=node('button',t('Print receipt and vouchers on H10S'),'download-link h10-print-order');
      const printStatus=node('span',undefined,'h10-print-status micro');printStatus.setAttribute('role','status');
      window.h10OrderPrinter?.add(h10Print,order,result);
      const textLink=node('a',t('textDownload'),'download-link'),readLink=node('a',t('readOrder'),'download-link');textLink.dataset.shop='textDownload';readLink.dataset.shop='readOrder';readLink.href='#reading-'+order.ref;textLink.download='poetry-order-'+order.ref+'-reading.html';
      heading.append(title,meta,payment,fullLink,h10Print,printStatus,textLink,readLink,hint);
      section.refreshReading=()=>{
        const reading=OrderReading.view(order,result,t,uiMoney);reading.id='reading-'+order.ref;
        section.querySelector('.order-text-copy')?.remove();section.append(reading);
        if(textLink.hasAttribute('href'))URL.revokeObjectURL(textLink.href);
        textLink.href=URL.createObjectURL(OrderReading.html(order,result,t,uiMoney,uiLocale));urls.push(textLink.href);
      };
      if(!order.id&&!order.terminalId){
        const copy=clone(order);copy.created=new Date(order.created);copy.receiptMetadata={...(copy.receiptMetadata||receiptMeta(copy.ref)),till:'002'};
        result.legacyH10Pages=continuousOrderPages({receipt:receiptPages(copy),vouchers:result.vouchers});
        const legacy=node('details',undefined,'h10-legacy-proof');legacy.append(node('summary',t('h10LegacyCopy')));
        legacy.append(download(t('h10LegacyCopy'),multipagePDF(result.legacyH10Pages),`poetry-order-${order.ref}-h10.pdf`,urls));
        for(const page of result.legacyH10Pages){const img=node('img');img.src=page.toDataURL('image/png');img.alt=t('h10LegacyCopy');img.width=page.width;img.height=page.height;img.loading='lazy';legacy.append(img);}proofs.append(legacy);
      }
      const strip=node('figure',undefined,'order-strip-proof');strip.append(node('figcaption',t('continuousEdition')+' / '+order.ref));
      for(const [i,page] of orderPages(result).entries()){const img=node('img');img.src=page.toDataURL('image/png');img.alt=i?'':t('continuousEdition')+' '+order.ref;img.width=page.width;img.height=page.height;img.loading='lazy';strip.append(img);}proofs.append(strip);
      // Complete receipt and poems remain readable without interpreting the proof images.
      section.prepend(heading,proofs);updateOrderUI(order,section);return {section,urls};
    }catch(error){urls.forEach(URL.revokeObjectURL);throw error;}
  }
  function updateOrderUI(order,section){
    section.refreshReading();
    section.querySelectorAll('[data-shop]').forEach(n=>n.textContent=t(n.dataset.shop));
    section.querySelector('[data-order-field="title"]').textContent=t('order')+' '+order.ref;
    section.querySelector('[data-order-field="meta"]').textContent=new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(order.created)+' · '+uiMoney(order.total);
    const payment=order.payment;section.querySelector('[data-order-field="payment"]').textContent=t('simulatedPayment')+' · '+t(payment.method==='card'?'card':'cash')+(payment.method==='cash'?` · ${t('received')} ${uiMoney(payment.tender)} · ${t('change')} ${uiMoney(payment.change)}`:'');
    section.querySelector('.order-strip-proof figcaption').textContent=t('continuousEdition')+' / '+order.ref;
    section.querySelectorAll('.order-strip-proof img').forEach((img,i)=>img.alt=i?'':t('continuousEdition')+' '+order.ref);
  }
  function rememberOrder(order){const key=PoetryOrder.identity(order);sessionStorage.setItem(ORDER_KEY+key,JSON.stringify(order));sessionStorage.setItem(ORDER_KEY+'latest',key);}
  async function openSavedOrder(){
    let ref=new URL(location.href).searchParams.get('order');try{ref ||= sessionStorage.getItem(ORDER_KEY+'latest');}catch{}
    orderPageStatus='orderLoading';el('order-page-status').textContent=t(orderPageStatus);
    let saved;
    try{saved=ref&&(/^\d{12,14}$/.test(ref)||PoetryOrder.isUUID(ref))?sessionStorage.getItem(ORDER_KEY+ref):null;}catch{}
    if(!saved){orderPageStatus='orderMissing';el('order-heading').textContent=t('order');el('order-page-status').textContent=t(orderPageStatus);return;}
    try{
      const order=PoetryOrder.restore(saved);if(PoetryOrder.identity(order)!==ref)throw Error('saved order identity');
      const result=await prepare(order),output=await outputOrder(order,result);
      orders.push({order,...output});el('order-proofs').replaceChildren(output.section);orderPageStatus=null;el('order-page-status').textContent='';el('order-heading').focus({preventScroll:true});
    }catch(error){console.error('Saved order could not be opened',error);orderPageStatus='orderUnavailable';el('order-heading').textContent=t('order');el('order-page-status').textContent=t(orderPageStatus);}
  }
  async function placeOrder(){
    if(busy||!bag.length)return;busy=true;el('place-order').disabled=true;el('back-to-bag').disabled=true;checkoutStatusKey='preparing';el('checkout-status').textContent=t(checkoutStatusKey);
    try{
      const {order,result}=await preparedCheckout(),output=await outputOrder(order,result);
      try{rememberOrder(order);if(adapter())await adapter().submit(order,result);}catch(error){output.urls.forEach(URL.revokeObjectURL);throw error;}
      bag=[];pendingOrder=null;pendingPlan=null;persist();adapter()?.complete();renderBag();close('checkout-dialog');output.urls.forEach(URL.revokeObjectURL);location.assign('order.html?lang='+encodeURIComponent(uiLocale)+'&order='+PoetryOrder.identity(order));
    }catch(error){console.error('Order preparation failed',error);checkoutStatusKey='failed';el('checkout-status').textContent=t(checkoutStatusKey);}
    finally{busy=false;el('place-order').disabled=false;el('back-to-bag').disabled=false;renderBag();}
  }
  function translateUI(){
    document.querySelectorAll('[data-shop]').forEach(n=>n.textContent=t(n.dataset.shop).replace('{price}',uiMoney(TARIFF.addOn)));document.querySelectorAll('[data-shop-placeholder]').forEach(n=>n.placeholder=t(n.dataset.shopPlaceholder));document.querySelectorAll('[data-shop-label]').forEach(n=>n.setAttribute('aria-label',t(n.dataset.shopLabel)));let hasSavedOrder=false;try{const id=sessionStorage.getItem(ORDER_KEY+'latest');hasSavedOrder=!!id&&!!sessionStorage.getItem(ORDER_KEY+id);}catch{}document.querySelectorAll('[data-order-link]').forEach(n=>{n.href='order.html?lang='+encodeURIComponent(uiLocale);n.hidden=!hasSavedOrder;});if(!editionPage)document.title=t(orderPage?'order':'shop')+' · Poetry Voucher · Hanpu Li';if(orderPageStatus){el('order-page-status').textContent=t(orderPageStatus);if(orderPageStatus!=='orderLoading')el('order-heading').textContent=t('order');}
    if(ready){catalogueFilters();catalogue();renderBag();renderCheckout();editorPrice();productHeading();}if(editionPage){el('voucher-hero-image').alt=t('viewVoucher');el('voucher-expand').textContent=t(el('voucher-view').classList.contains('expanded')?'viewLess':'viewWhole');}for(const entry of orders)updateOrderUI(entry.order,entry.section);if(toastKey)renderToast(toastKey);if(editorStatusKey)el('editor-status').textContent=t(editorStatusKey);if(checkoutStatusKey)el('checkout-status').textContent=t(checkoutStatusKey);if(editingId)el('save-line').textContent=t('save');
  }
  document.querySelectorAll('[data-close]').forEach(n=>n.addEventListener('click',()=>{if(busy)return;if(editionPage&&n.dataset.close==='bag-dialog'&&n.dataset.shop==='continue')location.assign(backToCatalogue());else close(n.dataset.close);}));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();}));
  el('open-bag').addEventListener('click',()=>show('bag-dialog'));el('save-line').addEventListener('click',saveEditor);
  el('browse-all').addEventListener('click',()=>{catalogueExpanded=true;catalogue();syncCollectionURL();el('current-collection').focus({preventScroll:true});});
  el('back-to-collections').addEventListener('click',()=>{catalogueExpanded=false;el('shop-filter').value='all';el('shop-search').value='';catalogue();el('collection-picker').querySelector('button')?.focus({preventScroll:true});});
  el('shop-search').addEventListener('input',catalogue);el('shop-filter').addEventListener('change',()=>{catalogue();syncCollectionURL();});el('to-checkout').addEventListener('click',checkout);el('place-order').addEventListener('click',placeOrder);
  el('back-to-bag').addEventListener('click',()=>{close('checkout-dialog');show('bag-dialog');});
  document.querySelector('.controls').addEventListener('input',()=>{editorPrice();schedulePreview();});el('work').addEventListener('change',()=>{editorPrice();schedulePreview();});el('original-script').addEventListener('change',()=>{editorPrice();schedulePreview();});
  document.addEventListener('presslocalechange',translateUI);
  if(editionPage){
    el('voucher-expand').addEventListener('click',()=>{const view=el('voucher-view'),open=!view.classList.contains('expanded');view.classList.toggle('expanded',open);el('voucher-expand').setAttribute('aria-expanded',String(open));el('voucher-expand').textContent=t(open?'viewLess':'viewWhole');if(!open)view.scrollIntoView({block:'nearest'});});
    // Keep the choices beside the long paper while they fit above the purchase bar.
    const controls=document.querySelector('.controls'),bar=document.querySelector('.editor-actions');
    const fit=()=>controls.classList.toggle('is-sticky',innerWidth>780&&controls.offsetHeight+24+bar.offsetHeight+16<=innerHeight);
    new ResizeObserver(fit).observe(controls);addEventListener('resize',fit);fit();
  }
  const initialise=()=>{
    if(ready)return;ready=true;restore();translateUI();
    const params=new URL(location.href).searchParams,requested=params.get('work');
    if(orderPage){openSavedOrder();return;}
    if(editionPage){
      const work=findWork(requested);
      if(!work){location.replace('shop.html?lang='+encodeURIComponent(uiLocale));return;}
      let line=null;
      if(params.get('edit')==='1'){
        try{const selected=JSON.parse(sessionStorage.getItem(EDIT_KEY)||'null');
          if(selected?.workId===work.id)line=bag.find(item=>keyOf(item)===keyOf(selected.line))||null;
        }catch{}
      }
      openEditor(work.id,line);return;
    }
    const collection=params.get('collection');
    if(collection&&[...el('shop-filter').options].some(o=>o.value===collection)){
      el('shop-filter').value=collection;catalogue();
    }
    // Returning from a product page: put the reader back on the card they left.
    const returnTo=location.hash.startsWith('#work-choose-')&&document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if(returnTo&&params.get('bag')!=='1'){returnTo.scrollIntoView({block:'center'});returnTo.focus({preventScroll:true});}
    if(requested){
      const work=findWork(requested);
      if(work&&window.parent===window){location.replace(editionLink(work.id));return;}
      if(work)openEditor(work.id);
    }
    if(params.get('bag')==='1'&&bag.length){
      const clean=new URL(location.href);clean.searchParams.delete('bag');history.replaceState(null,'',clean);
      show('bag-dialog');
    }
  };
  document.addEventListener('catalogueready',initialise);
  document.addEventListener('catalogueerror',()=>{notify('loadError');el('no-results').hidden=false;el('no-results').textContent=t('loadError');});
  translateUI();renderBag();if(works.length)initialise();
  function recoverBasket(purchased){
    if(busy||!Array.isArray(purchased)||purchased.length>24)return false;
    let selections;
    try{selections=purchased.map(saved=>{
      if(!Array.isArray(saved)||saved.length!==9)throw Error('saved basket');
      const raw={workId:saved[0],title:saved[1],author:saved[2],poem:saved[3],locale:saved[4],font:saved[6],size:saved[7],quantity:saved[8]};
      if(Array.isArray(saved[5]))raw.translations=saved[5];else raw.language=saved[5];
      const validated=validateLine(raw);return {key:keyOf(validated),remaining:validated.quantity};
    });}catch{return false;}
    for(const selected of selections)for(const line of bag)if(keyOf(line)===selected.key){const count=Math.min(line.quantity,selected.remaining);line.quantity-=count;selected.remaining-=count;}
    bag=bag.filter(line=>line.quantity>0);pendingOrder=null;pendingPlan=null;persist();renderBag();return true;
  }
  // Read-only inspection surface for regression tests; no mutable cart or order state exposed.
  window.poetryShop={orderPages,recoverBasket,resetCheckout:()=>{if(!busy){pendingOrder=null;pendingPlan=null;}},snapshot:()=>clone({bag,orders:orders.map(x=>x.order),busy}),quote:raw=>quote(validateLine(raw)),multipagePDF,
    pagesForH10:(identity,result)=>{
      const saved=orders.find(entry=>PoetryOrder.identity(entry.order)===identity)?.order;
      if(!saved||!result?.vouchers?.length)return null;
      // New orders print their exact frozen preview. Legacy keys must retain their
      // old till-002 pixels so a software upgrade cannot create a new print intent.
      if(saved.id)return orderPages(result);
      if(!result.legacyH10Pages){const copy=clone(saved);copy.created=new Date(saved.created);copy.receiptMetadata={...(copy.receiptMetadata||receiptMeta(copy.ref)),till:'002'};result.legacyH10Pages=continuousOrderPages({receipt:receiptPages(copy),vouchers:result.vouchers});}
      return result.legacyH10Pages;
    }

  };
})();
