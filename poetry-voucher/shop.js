'use strict';
(() => {
  const MAX_UNITS=24, STORAGE_KEY='poetry-voucher-bag-v1', ORDER_KEY='poetry-voucher-order-v1-';
  const orderPage=typeof document!=='undefined'&&document.body.dataset.page==='order';
  let orderPageStatus=null;
  const el=id=>document.getElementById(id);
  const t=key=>SHOP_COPY[key]?.[SHOP_LANGS.indexOf(uiLocale)]||SHOP_COPY[key]?.[0]||key;
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const button=(text,action,className='text-button')=>{const n=node('button',text,className);n.type='button';n.addEventListener('click',action);return n;};
  let retainedCustom=[],bag=[],editingId=null,editingLocale='en',busy=false,ready=false,storageOK=true,toastTimer,toastKey=null,editorStatusKey=null,checkoutStatusKey=null,orders=[],pendingOrder=null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const units=()=>bag.reduce((sum,line)=>sum+line.quantity,0);
  const keyOf=line=>JSON.stringify([line.workId,line.title,line.author,line.poem,line.locale,line.translations,line.font,line.size]);
  const workFor=line=>works.find(work=>work.id===line.workId);
  function quote(line){const w=workFor(line),additions=(line.translations||[]).map(locale=>({locale,body:w?.translations?.[locale]?.body||''}));return quotePoem(w?.poem||line.poem,additions,line.font,!w);}
  function validateLine(raw){
    if(!raw||typeof raw!=='object'||!Number.isInteger(raw.quantity)||raw.quantity<1||raw.quantity>MAX_UNITS)throw Error('quantity');
    if(!['bitmap','site'].includes(raw.font)||!typeSizes(raw.font).includes(raw.size))throw Error('type');
    if(!SHOP_LANGS.includes(raw.locale))throw Error('locale');
    const w=works.find(work=>work.id===raw.workId);
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
  function notify(key){toastKey=key;if(el('product-editor').open){editorStatusKey=key;el('editor-status').textContent=t(key);}el('shop-status').textContent=t(key);el('shop-status').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('shop-status').classList.remove('visible'),4500);}
  function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,saveCustom:retainedCustom.length>0,lines:bag,retiredCustom:retainedCustom}));storageOK=true;}catch{storageOK=false;}el('storage-note').textContent=t(storageOK?'storage':'storageError');}
  function restore(){
    let rejected=false;
    try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;const saved=JSON.parse(raw);if(saved.version!==1||!Array.isArray(saved.lines)||saved.lines.length>MAX_UNITS)throw Error('version');
      // Do not silently delete previously consented custom text when retiring its editor.
      retainedCustom=saved.saveCustom===true?[...saved.lines,...(Array.isArray(saved.retiredCustom)?saved.retiredCustom:[])].filter(line=>line&&typeof line==='object'&&!line.workId):[];
      for(const candidate of saved.lines){if(!candidate?.workId)continue;try{const line=validateLine(candidate);if(units()+line.quantity>MAX_UNITS)throw Error('limit');const match=bag.find(x=>keyOf(x)===keyOf(line));if(match)match.quantity+=line.quantity;else bag.push(line);}catch{rejected=true;}}
      if(rejected)notify('recovered');else if(retainedCustom.length)notify('legacyCustom');else if(bag.length)notify('restored');
    }catch{rejected=true;notify('recovered');}
    // Re-save only validated data; unavailable storage never prevents shopping.
    persist();
  }
  function show(id){el(id).showModal();}
  function close(id){el(id).close();}
  function localeTitle(work){const title=work.translations?.[uiLocale]?.title||work.title;return work.kind==='POEM'?`${title} · ${work.source_id}`:title;}
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
  function catalogue(){
    const grid=el('product-grid'),search=el('shop-search').value.trim().toLocaleLowerCase(),filter=el('shop-filter').value;
    grid.replaceChildren();let count=0;
    for(const work of works){
      if(filter!=='all'&&work.shelf!==filter)continue;
      const title=localeTitle(work),edition=work.translations?.[uiLocale];
      if(search&&!`${title} ${work.title} ${work.source_id} ${work.poem} ${edition?.body||''}`.toLocaleLowerCase().includes(search))continue;
      count++;
      const card=node('article',undefined,'product-card'),head=node('div',undefined,'product-meta');
      head.append(node('span',work.source_id),node('span',work.id.startsWith('shi-d')?t('draft'):work.shelf==='甲乙十六首'?t('cycle'):work.shelf==='詞'?t('lyrics'):t('roof')));
      const heading=node('h3',title),excerpt=node('p',(edition?.body||work.poem).split('\n').filter(Boolean).slice(0,3).join('\n'),'product-excerpt');
      if(!edition){heading.lang='zh-Hant-HK';excerpt.lang='zh-Hant-HK';}
      const foot=node('div',undefined,'product-foot'),price=node('strong',uiMoney(quotePoem(work.poem).price),'product-price');
      foot.append(price);
      const actions=node('div',undefined,'product-actions');
      actions.append(button(t('choose'),()=>openEditor(work.id),'text-button'),button(t('add'),()=>addDefault(work),'add-button'));
      card.append(head,heading,excerpt,foot,actions);grid.append(card);
    }
    el('catalogue-count').textContent=String(count).padStart(2,'0')+' / '+String(works.length).padStart(2,'0');el('no-results').hidden=count>0;
  }
  function addDefault(work){
    editingId=null;
    const line=validateLine({workId:work.id,font:'bitmap',size:TYPE_CONFIG.defaultSize,locale:'zh-Hant',translations:[],quantity:1});
    insert(line);
  }
  function insert(line){
    const previous=bag.find(x=>x.id===editingId),quantity=previous?.quantity||line.quantity;
    if(units()-(previous?.quantity||0)+quantity>MAX_UNITS){notify('limit');return false;}
    bag=bag.filter(x=>x.id!==editingId);line.quantity=quantity;
    const match=bag.find(x=>keyOf(x)===keyOf(line));if(match)match.quantity+=quantity;else bag.push(line);
    const edited=!!editingId;editingId=null;pendingOrder=null;persist();renderBag();notify(edited?'updated':'added');return true;
  }
  function openEditor(workId,line=null){
    if(!works.some(work=>work.id===workId)){notify('authorOnly');return;}
    editorStatusKey=null;el('editor-status').textContent='';editingId=line?.id||null;editingLocale=line?.locale||uiLocale;
    el('work').value=workId||'custom';loadWork();
    if(line){for(const k of ['title','author','poem'])el(k).value=line[k];el('font').value=line.font;el('original-script').value=line.workId?line.locale:'zh-Hant';document.querySelectorAll('#translation-options input').forEach(input=>input.checked=line.translations.includes(input.value));syncTypeSize();el('size').value=String(line.size);dirty();}
    else {el('font').value='bitmap';syncTypeSize();el('size').value=String(TYPE_CONFIG.defaultSize);dirty();}
    el('save-line').textContent=t(line?'save':'add');editorPrice();show('product-editor');
  }
  function editorPrice(){editorReading();el('typeface-note').textContent=t('typefaceShopNote').replace('{price}',uiMoney(TARIFF.addOn));try{el('editor-price').textContent=uiMoney(updatePrice().price);}catch{el('editor-price').textContent='—';}}
  function saveEditor(){
    const w=currentWork(),original=unchanged(w);
    if(!original){notify('authorOnly');return;}
    if(!el('title').value.trim()||!el('poem').value.trim()){notify('required');return;}
    try{const line=validateLine({workId:original?w.id:null,title:el('title').value.trim(),author:el('author').value,poem:el('poem').value.replace(/\r\n?/g,'\n'),locale:original?el('original-script').value:editingLocale,translations:original?[...document.querySelectorAll('#translation-options input:checked')].map(input=>input.value):[],font:el('font').value,size:Number(el('size').value),quantity:1});if(insert(line))close('product-editor');}
    catch{notify('invalid');}
  }
  function lineDetails(line){const script=line.workId?(line.locale==='zh-Hans'?t('originalSimplified'):t('originalLanguage')):languageName(line.locale),added=line.translations.length?' + '+line.translations.map(languageName).join(', '):'';return `${script}${added} / ${line.font==='site'?tr('網站字體'):tr('點陣體 · 預設，已包含')} / ${line.size}`;}
  function renderBag(focusId=null){
    el('bag-count').textContent=String(units());const container=el('bag-lines');container.replaceChildren();
    if(!bag.length)container.append(node('p',t('empty'),'empty-bag'));
    for(const line of bag){
      const q=quote(line),row=node('article',undefined,'bag-line'),heading=node('h3',lineTitle(line)),details=node('p',lineDetails(line),'micro');
      heading.lang=displayLang(line);
      const charges=node('div',undefined,'bag-charges');for(const item of q.items)charges.append(node('span',`${tr(item.label)} ${uiMoney(itemAmount(item))}`));
      const actions=node('div',undefined,'bag-actions'),label=node('label',t('quantity')),input=node('input');input.type='number';input.min='1';input.max=String(MAX_UNITS);input.step='1';input.value=line.quantity;input.id='qty-'+line.id;input.setAttribute('aria-label',t('quantity')+' · '+lineTitle(line));
      input.addEventListener('change',()=>{const quantity=Number(input.value);if(!Number.isInteger(quantity)||quantity<1||units()-line.quantity+quantity>MAX_UNITS){input.value=line.quantity;notify('limit');return;}line.quantity=quantity;pendingOrder=null;persist();renderBag(input.id);});label.append(input);
      actions.append(label,button(t('edit'),()=>openEditor(line.workId,line)),button(t('remove'),()=>{bag=bag.filter(x=>x.id!==line.id);pendingOrder=null;persist();renderBag();notify('updated');el('to-checkout').focus();}),node('strong',uiMoney(q.price*line.quantity),'line-total'));
      row.append(heading,details,charges,actions);container.append(row);
    }
    el('bag-total').textContent=uiMoney(bag.reduce((sum,line)=>sum+quote(line).price*line.quantity,0));el('to-checkout').disabled=!bag.length||busy;
    el('storage-note').textContent=t(storageOK?'storage':'storageError');if(focusId)el(focusId)?.focus();
  }
  function renderCheckout(){
    const summary=el('checkout-summary');summary.replaceChildren();
    for(const line of bag){const row=node('div',undefined,'checkout-line');row.append(node('span',`${lineTitle(line)} × ${line.quantity}`),node('strong',uiMoney(quote(line).price*line.quantity)));summary.append(row);}
    el('checkout-total').textContent=el('bag-total').textContent;
  }
  function checkout(){if(!bag.length)return;renderCheckout();checkoutStatusKey=null;el('checkout-status').textContent='';close('bag-dialog');show('checkout-dialog');
  }
  class PagedPaper extends Paper{
    constructor(identity){super();this.pages=[];this.identity=identity;this.transcript=[];}
    ensure(height){
      // Reserve a footer before laying out any content; short, single-page works stay unmarked.
      if(this.y+height<=PAPER_CONFIG.contentMaxDots-80)return;
      this.pages.push(super.finish());
      this.c=canvas(PAPER_CONFIG.printableDots,PAPER_CONFIG.canvasMaxDots);this.x=this.c.getContext('2d');this.y=PAPER_CONFIG.receiptInsetDots;
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
    p.space(12);p.till('THANK YOU',null,true);p.ensure(100);const bits=barcodeBits(order.ref),module=2;let x=(PAPER_CONFIG.printableDots-bits.length*module)/2;for(const bit of bits){if(bit==='1')p.x.fillRect(Math.floor(x),p.y,module,PAPER_CONFIG.barcodeHeightDots);x+=module;}p.space(PAPER_CONFIG.barcodeHeightDots+8);p.till(order.ref,null,true);p.space(8);
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
    return {ref,created,lines,items,total,units:units(),tariff:TARIFF.version,receiptMetadata:clone(receiptMeta(ref)),publication:{...clone(PUBLICATION_BUILD),textSnapshotSha256:await OrderReading.textHash(lines)},payment:automaticPayment(total,random[0]/4294967296,random[1]/4294967296)};
  }
  async function prepare(order){
    const sample=order.lines.map(line=>line.poem+line.title+line.author+line.translations.map(locale=>line.work?.translations?.[locale]?.body||'').join('')).join('')+'李函璞';
    await Promise.all(['EB','Courier','ShipCommon','Ship','IMing','Noto',...new Set(SHOP_LANGS.map(bitmapFace))].map(font=>document.fonts.load(`${TYPE_CONFIG.defaultSize}px ${font}`,sample)));
    await document.fonts.load(`italic ${TYPE_CONFIG.translation}px EB`);
    const receipt=receiptPages(order),vouchers=[];let index=0;
    for(const line of order.lines){const translations=line.translations.map(locale=>({locale,...line.work.translations[locale]}));
      for(let unit=0;unit<line.quantity;unit++){
        index++;const voucherId=(line.work?.source_id||'CUSTOM')+'-'+order.ref+'-'+String(index).padStart(2,'0'),paper=new PagedPaper({kind:'VOUCHER',ref:voucherId});paper.threshold=TYPE_CONFIG.threshold[line.font];
        const spec={...line,original:!!line.work,translations};
        renderVoucherBody(paper,spec,voucherId,line.font==='site'?serif:bitmapFamily(line.locale),locale=>line.font==='site'?serif:bitmapFamily(locale));
        const pages=paper.finishPages();vouchers.push({id:voucherId,title:line.title,line,pages});
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    return {receipt,vouchers};
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
  function download(label,blob,name,urls){const link=node('a',label,'download-link');link.href=URL.createObjectURL(blob);link.download=name;urls.push(link.href);return link;}
  async function outputOrder(order,result){
    // Build off-DOM first: an export failure cannot clear the bag or erase an earlier order.
    const urls=[],section=node('article',undefined,'completed-order'),heading=node('div',undefined,'order-record'),proofs=node('div',undefined,'order-proof-grid');
    try{
      const title=node('h2'),meta=node('p'),payment=node('p',undefined,'micro'),hint=node('p',undefined,'micro');
      title.dataset.orderField='title';meta.dataset.orderField='meta';payment.dataset.orderField='payment';hint.dataset.shop='downloadHint';
      const fullLink=download(t('orderPdf'),multipagePDF(continuousOrderPages(result)),`poetry-order-${order.ref}.pdf`,urls);
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
      const strip=node('figure',undefined,'order-strip-proof');strip.append(node('figcaption',t('continuousEdition')+' / '+order.ref));
      for(const [i,page] of continuousOrderPages(result).entries()){const img=node('img');img.src=page.toDataURL('image/png');img.alt=t('continuousEdition')+' '+order.ref+' / '+(i+1);img.width=page.width;img.height=page.height;img.loading='lazy';strip.append(img);}proofs.append(strip);
      // Complete receipt and poems remain readable without interpreting the proof images.
      section.prepend(heading,proofs);updateOrderUI(order,section);return {section,urls};
    }catch(error){urls.forEach(URL.revokeObjectURL);throw error;}
  }
  function updateOrderUI(order,section){
    section.refreshReading();
    section.querySelectorAll('[data-shop]').forEach(n=>n.textContent=t(n.dataset.shop));
    section.querySelector('[data-order-field="title"]').textContent=t('order')+' '+order.ref;
    section.querySelector('[data-order-field="meta"]').textContent=new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(order.created)+' · '+uiMoney(order.total);
    const payment=order.payment;section.querySelector('[data-order-field="payment"]').textContent=t(payment.method==='card'?'card':'cash')+(payment.method==='cash'?` · ${t('received')} ${uiMoney(payment.tender)} · ${t('change')} ${uiMoney(payment.change)}`:'');
    section.querySelector('.order-strip-proof figcaption').textContent=t('continuousEdition')+' / '+order.ref;
    section.querySelectorAll('.order-strip-proof img').forEach((img,i)=>img.alt=t('continuousEdition')+' '+order.ref+' / '+(i+1));
  }
  function rememberOrder(order){sessionStorage.setItem(ORDER_KEY+order.ref,JSON.stringify(order));sessionStorage.setItem(ORDER_KEY+'latest',order.ref);}
  async function openSavedOrder(){
    let ref=new URL(location.href).searchParams.get('order');try{ref ||= sessionStorage.getItem(ORDER_KEY+'latest');}catch{}
    orderPageStatus='orderLoading';el('order-page-status').textContent=t(orderPageStatus);
    let saved;
    try{saved=ref&&/^\d{12,14}$/.test(ref)?sessionStorage.getItem(ORDER_KEY+ref):null;}catch{}
    if(!saved){orderPageStatus='orderMissing';el('order-heading').textContent=t('order');el('order-page-status').textContent=t(orderPageStatus);return;}
    try{
      const order=JSON.parse(saved);if(order.ref!==ref||!Array.isArray(order.lines)||order.lines.length>MAX_UNITS)throw Error('saved order');
      for(const line of order.lines)if(!Array.isArray(line.translations))line.translations=line.language&&line.language!=='receipt'?[line.language]:[];
      order.created=new Date(order.created);const result=await prepare(order),output=await outputOrder(order,result);
      orders.push({order,...output});el('order-proofs').replaceChildren(output.section);orderPageStatus=null;el('order-page-status').textContent='';el('order-heading').focus({preventScroll:true});
    }catch(error){console.error('Saved order could not be opened',error);orderPageStatus='orderUnavailable';el('order-heading').textContent=t('order');el('order-page-status').textContent=t(orderPageStatus);}
  }
  async function placeOrder(){
    if(busy||!bag.length)return;busy=true;el('place-order').disabled=true;el('back-to-bag').disabled=true;checkoutStatusKey='preparing';el('checkout-status').textContent=t(checkoutStatusKey);
    try{
      const order=pendingOrder||(pendingOrder=await freezeOrder()),result=await prepare(order),output=await outputOrder(order,result);
      try{rememberOrder(order);}catch(error){output.urls.forEach(URL.revokeObjectURL);throw error;}
      bag=[];pendingOrder=null;persist();renderBag();close('checkout-dialog');output.urls.forEach(URL.revokeObjectURL);location.assign('order.html?lang='+encodeURIComponent(uiLocale)+'&order='+order.ref);
    }catch(error){console.error('Order preparation failed',error);checkoutStatusKey='failed';el('checkout-status').textContent=t(checkoutStatusKey);}
    finally{busy=false;el('place-order').disabled=false;el('back-to-bag').disabled=false;renderBag();}
  }
  function translateUI(){
    document.querySelectorAll('[data-shop]').forEach(n=>n.textContent=t(n.dataset.shop).replace('{price}',uiMoney(TARIFF.addOn)));document.querySelectorAll('[data-shop-placeholder]').forEach(n=>n.placeholder=t(n.dataset.shopPlaceholder));document.querySelectorAll('[data-order-link]').forEach(n=>n.href='order.html?lang='+encodeURIComponent(uiLocale));document.title=t(orderPage?'order':'shop')+' · Poetry Voucher · Hanpu Li';if(orderPageStatus){el('order-page-status').textContent=t(orderPageStatus);if(orderPageStatus!=='orderLoading')el('order-heading').textContent=t('order');}
    if(ready){catalogue();renderBag();renderCheckout();editorPrice();}for(const entry of orders)updateOrderUI(entry.order,entry.section);if(toastKey)el('shop-status').textContent=t(toastKey);if(editorStatusKey)el('editor-status').textContent=t(editorStatusKey);if(checkoutStatusKey)el('checkout-status').textContent=t(checkoutStatusKey);if(editingId)el('save-line').textContent=t('save');
  }
  document.querySelectorAll('[data-close]').forEach(n=>n.addEventListener('click',()=>{if(!busy)close(n.dataset.close);}));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();}));
  el('open-bag').addEventListener('click',()=>show('bag-dialog'));el('save-line').addEventListener('click',saveEditor);
  el('shop-search').addEventListener('input',catalogue);el('shop-filter').addEventListener('change',catalogue);el('to-checkout').addEventListener('click',checkout);el('place-order').addEventListener('click',placeOrder);
  el('back-to-bag').addEventListener('click',()=>{close('checkout-dialog');show('bag-dialog');});
  document.querySelector('.controls').addEventListener('input',editorPrice);el('work').addEventListener('change',editorPrice);el('original-script').addEventListener('change',editorPrice);
  document.addEventListener('presslocalechange',translateUI);
  const initialise=()=>{if(ready)return;ready=true;restore();translateUI();const requested=new URL(location.href).searchParams.get('work');if(orderPage)openSavedOrder();else if(requested)openEditor(works.some(w=>w.id===requested)?requested:null);};
  document.addEventListener('catalogueready',initialise);
  document.addEventListener('catalogueerror',()=>{notify('loadError');el('no-results').hidden=false;el('no-results').textContent=t('loadError');});
  translateUI();renderBag();if(works.length)initialise();
  // Read-only inspection surface for regression tests; no mutable cart or order state exposed.
  window.poetryShop={snapshot:()=>clone({bag,orders:orders.map(x=>x.order),busy}),quote:raw=>quote(validateLine(raw)),multipagePDF,
    pagesForH10:(ref,result)=>{const saved=orders.find(entry=>entry.order.ref===ref)?.order;if(!saved||!result||!Array.isArray(result.vouchers)||!result.vouchers.length)return null;const copy=clone(saved);copy.created=new Date(saved.created);copy.receiptMetadata={...copy.receiptMetadata,till:'002'};return continuousOrderPages({receipt:receiptPages(copy),vouchers:result.vouchers});}
  };
})();
