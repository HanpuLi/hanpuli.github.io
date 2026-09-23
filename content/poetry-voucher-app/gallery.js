'use strict';
// Stable artwork/system parameters. Transaction-specific display values are
// derived from each local receipt reference below rather than stored as identities.
const UK_CASH=Object.freeze({
  notes:Object.freeze([5000,2000,1000,500]),
  coins:Object.freeze([200,100,50,20,10,5,2,1]),
  coinOnlyMax:1000
});
const TARIFF=Object.freeze({
  version:'PV3',
  base:100,
  character:2,
  line:5,
  stanza:10,
  roundUnit:100,
  roundEnding:99,
  addOn:199
});
const PAYMENT_SCENE=Object.freeze({
  weights:Object.freeze({card:.50,notes:.25,mixed:.15,coins:.10}),
  cashRounding:Object.freeze([
    Object.freeze({until:.10,step:1}),
    Object.freeze({until:.55,step:100}),
    Object.freeze({until:.85,step:200}),
    Object.freeze({until:1,step:50})
  ])
});
const RECEIPT_CONFIG=Object.freeze({
  currency:'GBP',
  locale:'en-GB',
  timeZone:'Europe/London',
  merchant:Object.freeze({
    name:'HANPU LI',
    project:'POETRY VOUCHER',
    city:'LONDON',
    site:'HANPULI.GITHUB.IO',
    store:'001',
    till:'001',
    terminal:'T001'
  }),
  operatorCount:8,
  operatorDigits:2,
  paymentRefPrefix:'PV',
  cardEntries:Object.freeze(['CONTACTLESS','CHIP','MOBILE']),
  lineChars:30,
  columns:Object.freeze({qty:3,description:11,rsp:6,amount:6}),
  defaultWork:'ci-b3',
  customWorkCode:'CUSTOM',
  referenceDigits:6,
  paymentRefDigits:8,
  cardEndingDigits:4,
  authLength:6
});
const PAPER_CONFIG=Object.freeze({
  paperMm:58,
  printableDots:384,
  dotsPerMm:8,
  bodyInsetDots:16,
  bodyWidthDots:352,
  receiptInsetDots:12,
  receiptCellDots:12,
  canvasMaxDots:5960,
  contentMaxDots:5900,
  pdfSideMarginDots:40,
  pdfVerticalMarginDots:20,
  barcodeHeightDots:38
});
const TYPE_CONFIG=Object.freeze({
  bitmapSizes:Object.freeze([24,36]),
  siteSizes:Object.freeze([22,24,26]),
  defaultSize:24,
  // Preserve small counters in the site's CJK faces after one-bit conversion.
  threshold:Object.freeze({bitmap:128,site:160}),
  translation:19,
  authorLatin:42,
  authorCjk:20,
  authorNameGapDots:12,
  pixelGrid:12,
  pixelSmallCutoff:16,
  pixelMinBody:24
});
const TAX_CODES=Object.freeze({
  Z:Object.freeze({code:'Z',rate:0}),
  A:Object.freeze({code:'A',rate:20})
});
const SKU_DEFINITIONS=Object.freeze({
  poem:Object.freeze({id:'poem',label:'詩券',receipt:'POETRY VOUCHER',taxCode:TAX_CODES.A.code,taxRate:TAX_CODES.A.rate}),
  font:Object.freeze({id:'font',label:'網站字體版本',receipt:'WEBSITE TYPEFACES',taxCode:TAX_CODES.A.code,taxRate:TAX_CODES.A.rate}),
  translation:Object.freeze({id:'translation',label:'附加翻譯',receipt:'TRANSLATION',taxCode:TAX_CODES.A.code,taxRate:TAX_CODES.A.rate}),
  custom:Object.freeze({id:'custom',label:'自選內容',receipt:'CUSTOM TEXT',taxCode:TAX_CODES.A.code,taxRate:TAX_CODES.A.rate})
});
const TRANSLATION_RECEIPTS=Object.freeze({en:'ENGLISH TRANSLATION','zh-Hans':'SIMPLIFIED CHINESE',ja:'JAPANESE TRANSLATION',de:'GERMAN TRANSLATION',fr:'FRENCH TRANSLATION',ru:'RUSSIAN TRANSLATION'});
const noteValues=UK_CASH.notes,changeValues=Object.freeze([...UK_CASH.notes,...UK_CASH.coins]);
function denominations(amount,values){
  const parts=[];
  for(const value of values){const count=Math.floor(amount/value);if(count)parts.push({value,count});amount%=value;}
  return parts;
}
function cashPayment(price){
  if(!price)return {tender:0,change:0,notes:[],changeParts:[]};
  const smallestNote=Math.min(...noteValues);
  const tender=[...noteValues].reverse().find(value=>value>=price)||Math.ceil(price/smallestNote)*smallestNote;
  return {tender,change:tender-price,notes:denominations(tender,noteValues),changeParts:denominations(tender-price,changeValues)};
}
function paymentFor(price,mode){
  if(mode==='card')return {method:'card',tender:price,change:0,notes:[],changeParts:[]};
  if(mode==='notes')return {method:'cash',...cashPayment(price)};
  const values=mode==='coins'?UK_CASH.coins:changeValues;
  const notes=denominations(price,values),tender=notes.reduce((sum,p)=>sum+p.value*p.count,0);
  return {method:'cash',tender,change:Math.max(0,tender-price),notes,changeParts:[]};
}
// Artistic scene weights, not a claim about retail payment statistics.
function automaticPayment(price,roll,cashRoll=0.5){
  const w=PAYMENT_SCENE.weights,notesAt=w.card+w.notes,mixedAt=notesAt+w.mixed;
  const mode=roll<w.card?'card':roll<notesAt?'notes':roll<mixedAt?'mixed':price<=UK_CASH.coinOnlyMax?'coins':'mixed';
  if(price>0&&(mode==='coins'||mode==='mixed')){
    const step=PAYMENT_SCENE.cashRounding.find(entry=>cashRoll<entry.until).step;
    const tender=Math.ceil(price/step)*step,change=tender-price;
    const values=mode==='coins'?UK_CASH.coins:changeValues;
    return {method:'cash',mode,tender,change,notes:denominations(tender,values),changeParts:denominations(change,changeValues)};
  }
  return {...paymentFor(price,mode),mode};
}
function itemQuantity(item){
  const quantity=item.quantity??1;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10**RECEIPT_CONFIG.columns.qty-1)throw Error('Invalid receipt quantity.');
  return quantity;
}
function itemUnitPrice(item){
  // Legacy one-unit fixtures specify only amount; authored SKUs specify both.
  const unitPrice=item.unitPrice??item.amount;
  if(!Number.isSafeInteger(unitPrice)||unitPrice<0)throw Error('Invalid receipt unit price.');
  return unitPrice;
}
function itemAmount(item){
  const amount=itemQuantity(item)*itemUnitPrice(item);
  if(!Number.isSafeInteger(amount)||(item.amount!==undefined&&item.amount!==amount))throw Error('Receipt line amount does not match quantity and unit price.');
  return amount;
}
function sku(id,unitPrice,quantity=1){
  const definition=SKU_DEFINITIONS[id];
  if(!definition)throw Error('Unknown receipt SKU.');
  const item={...definition,unitPrice,quantity,amount:unitPrice*quantity};
  itemAmount(item);
  return item;
}
function quotePoem(poem,translation='',font='bitmap',custom=false,translationLocale='en'){
  let characters=0,lines=0,stanzas=0;
  for(const text of [poem]){
    let inStanza=false;
    for(const line of text.normalize('NFC').replace(/\r\n?/g,'\n').split('\n')){
      const count=(line.match(/[\p{L}\p{N}]/gu)||[]).length;
      characters+=count;
      if(line.trim()){lines++;if(!inStanza)stanzas++;inStanza=true;}
      else inStanza=false;
    }
  }
  const base=lines?TARIFF.base:0;
  const weighted=base+characters*TARIFF.character+lines*TARIFF.line+stanzas*TARIFF.stanza;
  const edition=lines?Math.ceil((weighted-TARIFF.roundEnding)/TARIFF.roundUnit)*TARIFF.roundUnit+TARIFF.roundEnding:0;
  const items=lines?[sku('poem',edition)]:[];
  if(lines&&font==='site')items.push(sku('font',TARIFF.addOn));
  if(lines&&translation.trim()){
    if(!Object.hasOwn(TRANSLATION_RECEIPTS,translationLocale))throw Error('Unsupported translation language.');
    items.push({...sku('translation',TARIFF.addOn),label:translationLocale==='zh-Hans'?'附加簡體版':SKU_DEFINITIONS.translation.label,receipt:TRANSLATION_RECEIPTS[translationLocale]});
  }
  if(lines&&custom)items.push(sku('custom',TARIFF.addOn));
  const price=items.reduce((sum,item)=>sum+itemAmount(item),0);
  return {characters,lines,stanzas,base,weighted,edition,items,price,...cashPayment(price)};
}
// Tax codes are fictional POS display metadata attached explicitly to each SKU;
// they are not a statement about the real VAT treatment of these works/services.
function receiptTaxRate(item){
  if(!Number.isFinite(item.taxRate))throw Error('Receipt SKU missing tax rate.');
  return item.taxRate;
}
function receiptTaxCode(item){
  if(!TAX_CODES[item.taxCode]||TAX_CODES[item.taxCode].rate!==receiptTaxRate(item))throw Error('Receipt SKU has inconsistent tax metadata.');
  return item.taxCode;
}
function vatSummary(items){
  const groups=new Map();
  for(const item of items){
    const rate=receiptTaxRate(item),code=receiptTaxCode(item),key=code+':'+rate,group=groups.get(key)||{rate,code,gross:0};
    group.gross+=itemAmount(item);groups.set(key,group);
  }
  return [...groups.values()].sort((a,b)=>a.rate-b.rate).map(group=>{
    const net=group.rate===0?group.gross:Math.round(group.gross*100/(100+group.rate));
    return {...group,net,vat:group.gross-net};
  });
}
function referenceSeed(ref,salt=''){
  let hash=2166136261;
  for(const char of ref+salt){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0;}
  return hash;
}
function referenceToken(ref,salt,length=6){
  return referenceSeed(ref,salt).toString(36).toUpperCase().padStart(length,'0').slice(-length);
}
function receiptMeta(ref){
  const merchant=RECEIPT_CONFIG.merchant;
  const cardModulo=10**RECEIPT_CONFIG.cardEndingDigits,ending=referenceSeed(ref,'CARD')%cardModulo||1;
  return {
    store:merchant.store,
    till:merchant.till,
    operator:String(referenceSeed(ref,'OP')%RECEIPT_CONFIG.operatorCount+1).padStart(RECEIPT_CONFIG.operatorDigits,'0'),
    transaction:ref.slice(-RECEIPT_CONFIG.referenceDigits),
    terminal:merchant.terminal,
    paymentRef:RECEIPT_CONFIG.paymentRefPrefix+ref.slice(-RECEIPT_CONFIG.paymentRefDigits),
    cardEnding:String(ending).padStart(RECEIPT_CONFIG.cardEndingDigits,'0'),
    entry:RECEIPT_CONFIG.cardEntries[referenceSeed(ref,'ENTRY')%RECEIPT_CONFIG.cardEntries.length],
    auth:referenceToken(ref,'AUTH',RECEIPT_CONFIG.authLength)
  };
}
function wrapTillField(text,width){
  const words=String(text).trim().toUpperCase().split(/\s+/).filter(Boolean),lines=[];let line='';
  for(const word of words){
    if(word.length>width){
      if(line){lines.push(line);line='';}
      for(let i=0;i<word.length;i+=width)lines.push(word.slice(i,i+width));
      continue;
    }
    const next=line?line+' '+word:word;
    if(next.length<=width)line=next;
    else {if(line)lines.push(line);line=word;}
  }
  if(line||!lines.length)lines.push(line);
  return lines;
}
function receiptItemLine(qty='',description='',rsp='',amount=''){
  const c=RECEIPT_CONFIG.columns;
  const q=String(qty).toUpperCase().slice(0,c.qty).padEnd(c.qty);
  const d=String(description).toUpperCase().slice(0,c.description).padEnd(c.description);
  const r=String(rsp).toUpperCase().slice(-c.rsp).padStart(c.rsp);
  const a=String(amount).toUpperCase().slice(-c.amount).padStart(c.amount);
  return (q+' '+d+' '+r+' '+a).padEnd(RECEIPT_CONFIG.lineChars);
}
function receiptItemRows(item,code){
  const description=item.receipt+(item.id==='poem'?' '+code:'');
  const quantity=String(itemQuantity(item)),rsp=(itemUnitPrice(item)/100).toFixed(2),amount=(itemAmount(item)/100).toFixed(2)+receiptTaxCode(item);
  if(rsp.length>RECEIPT_CONFIG.columns.rsp||amount.length>RECEIPT_CONFIG.columns.amount)throw Error('Receipt line price exceeds column width.');
  const lines=wrapTillField(description,RECEIPT_CONFIG.columns.description);
  return lines.map((line,index)=>receiptItemLine(index===0?quantity:'',line,index===0?rsp:'',index===0?amount:''));
}
function wrapText(text,measure,width=PAPER_CONFIG.bodyWidthDots){
  const lines=[];let line='';
  for(const char of [...text]){
    if(measure(line+char)<=width||!line){line+=char;continue;}
    // Prefer a Chinese clause boundary to leaving one or two glyphs orphaned.
    const stops=[...line.matchAll(/[，。！？；：、]/g)];
    const stop=stops.length?stops.at(-1).index+1:0;
    if(stop&&stop<line.length&&measure(line.slice(0,stop))>=width*.35){
      lines.push(line.slice(0,stop));line=line.slice(stop)+char;
    }else if(char.charCodeAt(0)<256&&line.includes(' ')){
      const split=line.lastIndexOf(' ');lines.push(line.slice(0,split));line=line.slice(split+1)+char;
    }else if('，。！？；：、）》」』'.includes(char)&&[...line].length>1){
      const letters=[...line];lines.push(letters.slice(0,-1).join(''));line=letters.at(-1)+char;
    }else{lines.push(line);line=char;}
  }
  lines.push(line);return lines;
}
function typeSizes(font){return font==='site'?TYPE_CONFIG.siteSizes:TYPE_CONFIG.bitmapSizes;}
const bitmapFaces=Object.freeze({'zh-Hant':'FusionPixelZhHK','zh-Hans':'FusionPixelZhHans',ja:'FusionPixelJa',en:'FusionPixelLatin',de:'FusionPixelLatin',fr:'FusionPixelLatin',ru:'FusionPixelLatin'});
function bitmapFace(locale){return bitmapFaces[locale]||bitmapFaces.en;}
function bitmapFamily(locale){return `${bitmapFace(locale)}, sans-serif`;}
function isBitmapFamily(family){return family.startsWith('FusionPixel');}
function receiptReference(created,entropy){
  const parts=Object.fromEntries(new Intl.DateTimeFormat(RECEIPT_CONFIG.locale,{timeZone:RECEIPT_CONFIG.timeZone,year:'2-digit',month:'2-digit',day:'2-digit'}).formatToParts(created).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  let suffix=0;
  const modulo=10**RECEIPT_CONFIG.referenceDigits;
  for(const byte of entropy)suffix=(suffix*256+byte)%modulo;
  return parts.year+parts.month+parts.day+String(suffix).padStart(RECEIPT_CONFIG.referenceDigits,'0');
}
const $=id=>document.getElementById(id);
const serif='EB, ShipCommon, Ship, IMing, Noto, serif',mono='Courier, monospace';
const INPUT_LIMITS=Object.freeze({title:160,author:100,poem:1800});
let works=[],patterns,codes,stopCode,revision=0,objectURLs=[],messageKey='正在載入作品…',proofState=null;
let paymentRoll=null,cashRoll=0.5;
function message(key){messageKey=key;$('message').textContent=tr(key);}
function uiMoney(pence){
  return new Intl.NumberFormat(document.documentElement.lang,{style:'currency',currency:RECEIPT_CONFIG.currency,currencyDisplay:'narrowSymbol'}).format(pence/100);
}
function templateText(key,values){
  return tr(key).replace(/\{([A-Za-z0-9_]+)\}/g,(match,name)=>Object.hasOwn(values,name)?String(values[name]):match);
}
function updateConfigCopy(){
  const addOn=uiMoney(TARIFF.addOn);
  const sizes=values=>values.join(' / ');
  const currencySymbol=new Intl.NumberFormat('en-GB',{style:'currency',currency:RECEIPT_CONFIG.currency}).formatToParts(0).find(part=>part.type==='currency')?.value||RECEIPT_CONFIG.currency;
  const ending=currencySymbol+'x.'+String(TARIFF.roundEnding).padStart(2,'0');
  $('font').options[1].textContent=`${tr('網站字體')} · +${addOn}`;
  $('price-label').textContent=`${tr('標價')} / ${RECEIPT_CONFIG.currency}`;
  $('tender-label').textContent=`${tr('現金')} / ${RECEIPT_CONFIG.currency}`;
  $('paper-spec').textContent=`${PAPER_CONFIG.paperMm} mm / ${PAPER_CONFIG.printableDots} dots / 1 bit`;
  $('typeface-note').textContent=templateText('TYPEFACE_NOTE_TEMPLATE',{bitmapSizes:sizes(TYPE_CONFIG.bitmapSizes),siteSizes:sizes(TYPE_CONFIG.siteSizes),addOn});
  $('tariff-note').textContent=templateText('TARIFF_NOTE_TEMPLATE',{version:TARIFF.version,ending,addOn});
  $('payment-note').textContent=templateText('PAYMENT_NOTE_TEMPLATE',{coinLimit:uiMoney(UK_CASH.coinOnlyMax)});
}
function updateSource(){
  const w=currentWork();$('source-note').replaceChildren();
  if(w){const a=document.createElement('a'),source=new URL(w.source_url);
    const route={'en':'','zh-Hant':'zh/','zh-Hans':'zh-hans/','ja':'ja/','de':'de/','fr':'fr/','ru':'ru/'}[uiLocale];
    a.href='/'+route+source.pathname.split('/').pop()+source.hash;
    a.textContent=tr('原站作品')+' · '+w.source_id;$('source-note').append(a);}
  else $('source-note').textContent=tr('寫下自己的作品。署名留空也可以。');
}
function updateLocale(){
  const selected=$('work').value;
  if(works.length){
    $('work').replaceChildren();const custom=document.createElement('option');custom.value='custom';custom.textContent=tr('＋ 寫自己的詩');$('work').append(custom);
    for(const w of works){const option=document.createElement('option');option.value=w.id;
      // Work titles are authored content. Use an existing published title where available.
      const title=w.translations?.[uiLocale]?.title||w.title;
      option.textContent=`${w.source_id} / ${title}`;$('work').append(option);
    }$('work').value=selected;updateSource();
  }
  updateConfigCopy();
  message(messageKey);
  try{updatePrice();}catch(error){message(error.message);}
  if(proofState)$('proof-note').textContent=`${proofState.ref} / ${tr(proofState.original?'AUTHOR EDITION':'READER EDITION')} · ${tr('約')} ${new Intl.NumberFormat(document.documentElement.lang,{minimumFractionDigits:1,maximumFractionDigits:1}).format(proofState.mm)} mm · ${tr('DIGITAL PROOF')}`;
}
document.addEventListener('presslocalechange',updateLocale);
const fields=['title','author','poem','language','size','font'];
function syncTypeSize(){
  const sizes=typeSizes($('font').value),current=Number($('size').value);
  if([...$('size').options].map(o=>Number(o.value)).join()===sizes.join())return;
  $('size').replaceChildren(...sizes.map(size=>{const option=document.createElement('option');option.value=String(size);option.textContent=String(size);return option;}));
  $('size').value=String(sizes.includes(current)?current:TYPE_CONFIG.defaultSize);
}
function updatePrice(reroll=false){
  const w=currentWork(),selected=selectedTranslation(w);
  const quote=quotePoem($('poem').value,selected?.body||'',$('font').value,!unchanged(w),selected?.locale||'en');
  if(reroll){const bytes=new Uint32Array(2);crypto.getRandomValues(bytes);paymentRoll=bytes[0]/4294967296;cashRoll=bytes[1]/4294967296;}
  Object.assign(quote,automaticPayment(quote.price,paymentRoll??0,cashRoll));
  const modes={card:'刷卡 · 模擬交易',notes:'現金 · 自動紙幣',coins:'現金 · 硬幣支付',mixed:'現金 · 紙幣硬幣混合支付'};
  $('payment-summary').textContent=paymentRoll===null?tr('生成時自動抽取付款場景。'):tr(modes[quote.mode]);
  $('tender-group').hidden=quote.method==='card';
  $('price').value=priceText(quote.price);$('tender').value=priceText(quote.tender);
  const fmt=uiMoney;
  const number=n=>new Intl.NumberFormat(document.documentElement.lang).format(n);
  $('price-breakdown').replaceChildren();
  for(const item of quote.items){const row=document.createElement('div');row.textContent=`${tr(item.label)} × ${itemQuantity(item)} — ${fmt(itemAmount(item))}`;$('price-breakdown').append(row);}
  $('price-weights').textContent=[`${tr('基本費')} ${fmt(quote.base)}`,`${tr('字元')} ${number(quote.characters)} × ${fmt(TARIFF.character)}`,`${tr('非空行')} ${number(quote.lines)} × ${fmt(TARIFF.line)}`,`${tr('分節')} ${number(quote.stanzas)} × ${fmt(TARIFF.stanza)}`].join(' + ')+` = ${fmt(quote.weighted)}; ${fmt(quote.edition)}`;
  const parts=list=>list.map(part=>`${fmt(part.value)} × ${number(part.count)}`).join(' + ')||fmt(0);
  $('cash-notes').textContent=quote.method==='card'?tr('模擬刷卡，按總額支付；不收集卡號，不發起付款。'):`${tr('支付現金')}：${parts(quote.notes)}`;
  $('price-change').hidden=quote.method==='card';
  $('price-change').textContent=`${tr('找零')} ${fmt(quote.change)} = ${parts(quote.changeParts)}`;
  return quote;
}
function currentWork(){return works.find(w=>w.id===$('work').value);}
function unchanged(w){return w&&['title','author','poem'].every(k=>$(k).value===w[k]);}
function selectedTranslation(work){
  const locale=$('language').value;
  return unchanged(work)&&work.translations?.[locale]?{locale,...work.translations[locale]}:null;
}
function dirty(event){
  if(event?.target?.id==='font')syncTypeSize();
  revision++;
  document.querySelectorAll('.downloads a').forEach(a=>a.hidden=true);
  const selected=currentWork();
  if(selected&&['title','poem'].includes(event?.target?.id)&&$('author').value===selected.author&&!unchanged(selected)){
    $('author').value='';
  }
  const w=currentWork(),paired=unchanged(w);
  for(const option of $('language').options)if(option.value!=='receipt')option.disabled=!paired||!w.translations?.[option.value];
  if(!paired)$('language').value='receipt';
  try{updatePrice();}catch(error){message(error.message);return;}
  message('內容已改動；點「製作我的詩券」更新校樣。');
  document.querySelectorAll('.downloads a').forEach(a=>a.hidden=true);
}
function loadWork(){
  const w=currentWork();
  for(const key of ['title','author','poem'])$(key).value=w?w[key]:'';
  $('language').value='receipt';
  updateSource();
  dirty();
}
const priceText=p=>(p/100).toFixed(2);
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.fillStyle='#000';return c;}
class Paper{
  constructor(){this.c=canvas(PAPER_CONFIG.printableDots,PAPER_CONFIG.canvasMaxDots);this.x=this.c.getContext('2d');this.y=PAPER_CONFIG.receiptInsetDots;}
  space(n){this.y+=n;if(this.y>PAPER_CONFIG.contentMaxDots)throw Error('這份文字超過紙條長度上限，請縮短正文或減小字號。');}
  till(left='',right=null,center=false,tall=false){
    let line=left.toUpperCase();
    if(right!==null)line+=' '.repeat(Math.max(0,RECEIPT_CONFIG.lineChars-line.length-right.length))+right.toUpperCase();
    if(line.length>RECEIPT_CONFIG.lineChars)throw Error('小票欄位過長。');
    if(center)line=' '.repeat(Math.floor((RECEIPT_CONFIG.lineChars-line.length)/2))+line;
    const sy=tall?4:2;
    for(let i=0;i<line.length;i++){
      const glyph=patterns[line[i]];if(!glyph)throw Error('不支援的小票字元。');
      glyph.split(' ').forEach((row,y)=>[...row].forEach((bit,x)=>{if(bit==='1')this.x.fillRect(PAPER_CONFIG.receiptInsetDots+i*PAPER_CONFIG.receiptCellDots+x*2,this.y+(y+2)*sy,2,sy);}));
    }this.space(12*sy);
  }
  text(text,size=22,family=serif,center=false,leading=size+7,italic=false,weight=400){
    // The pixel face stays on its native grid. Never interpolate it or fake italics.
    if(isBitmapFamily(family)){size=size<TYPE_CONFIG.pixelSmallCutoff?TYPE_CONFIG.pixelGrid:Math.max(TYPE_CONFIG.pixelMinBody,Math.round(size/TYPE_CONFIG.pixelGrid)*TYPE_CONFIG.pixelGrid);leading=Math.max(leading,size+8);italic=false;}
    this.x.font=`${italic?'italic ':''}${weight} ${size}px ${family}`;this.x.textBaseline='alphabetic';
    const lines=wrapText(text,value=>this.x.measureText(value).width);
    for(const part of lines){
      this.space(0);const width=this.x.measureText(part).width;
      this.x.fillText(part,center?Math.round((PAPER_CONFIG.printableDots-width)/2):PAPER_CONFIG.bodyInsetDots,this.y+size);this.space(leading);
    }
  }
  finish(){
    const c=canvas(PAPER_CONFIG.printableDots,this.y+PAPER_CONFIG.receiptInsetDots),x=c.getContext('2d');x.drawImage(this.c,0,0);
    const pixels=x.getImageData(0,0,c.width,c.height);
    for(let i=0;i<pixels.data.length;i+=4){const v=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3<(this.threshold??TYPE_CONFIG.threshold.site)?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}
    x.putImageData(pixels,0,0);return c;
  }
}
function barcodeBits(ref){
  const values=[104,...[...ref].map(c=>c.charCodeAt(0)-32)];
  const check=values.reduce((sum,v,i)=>sum+v*(i||1),0)%103;
  return [...values,check].map(v=>codes[v]).join('')+stopCode+'11';
}
function render(spec){
  const p=new Paper(),ref=spec.ref,code=spec.original?spec.work.source_id:RECEIPT_CONFIG.customWorkCode,voucher=spec.voucherId||code+'-'+ref,contentLocale=spec.locale||(spec.original?'zh-Hant':'en');
  const bodyFont=spec.font==='site'?serif:bitmapFamily(contentLocale),translationFont=spec.font==='site'?serif:bitmapFamily(spec.translationLocale||'en');
  p.threshold=TYPE_CONFIG.threshold[spec.font];
  const items=spec.items||[sku('poem',spec.price)],meta=receiptMeta(ref),tax=vatSummary(items);
  if(items.reduce((sum,item)=>sum+itemAmount(item),0)!==spec.price)throw Error('Receipt total does not match item amounts.');
  const date=new Intl.DateTimeFormat(RECEIPT_CONFIG.locale,{timeZone:RECEIPT_CONFIG.timeZone,day:'2-digit',month:'2-digit',year:'numeric'}).format(spec.created);
  const time=new Intl.DateTimeFormat(RECEIPT_CONFIG.locale,{timeZone:RECEIPT_CONFIG.timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(spec.created);
  const merchant=RECEIPT_CONFIG.merchant,currency=RECEIPT_CONFIG.currency,separator='-'.repeat(RECEIPT_CONFIG.lineChars);
  p.till(merchant.name,null,true);p.till(merchant.project,null,true);p.till(merchant.city,null,true);p.till(merchant.site,null,true);p.space(10);
  p.till('CUSTOMER COPY',null,true);p.till('STORE '+meta.store,'TILL '+meta.till);p.till('OPERATOR '+meta.operator,'TRANS '+meta.transaction);
  p.till(date,time);p.till('RECEIPT',ref);p.till('VOUCHER',voucher);p.space(6);
  p.till(separator);p.till(receiptItemLine('QTY','DESCRIPTION','RSP(£)','AMT(£)'));p.till(separator);
  for(const item of items)for(const line of receiptItemRows(item,code))p.till(line);
  p.till(separator);p.till('RSP/AMT INCLUDE VAT',null,true);
  p.till('SUBTOTAL',currency+' '+priceText(spec.price));
  p.till('TOTAL TO PAY',currency+' '+priceText(spec.price),false,true);
  if(spec.method==='card')p.till('RECEIVED','CARD');
  else {p.till('RECEIVED',currency+' '+priceText(spec.tender));p.till('CHANGE',currency+' '+priceText(spec.tender-spec.price));}
  p.till('NUMBER OF ITEMS',String(items.reduce((sum,item)=>sum+itemQuantity(item),0)));
  p.space(10);p.till('VAT SUMMARY',null,true);p.till('RATE','NET VAT GROSS');
  for(const row of tax)p.till(row.code+' '+row.rate+'%',[row.net,row.vat,row.gross].map(priceText).join(' '));
  p.till('VAT TOTAL',currency+' '+priceText(tax.reduce((sum,row)=>sum+row.vat,0)));p.till('NOT A VAT INVOICE',null,true);p.space(10);
  p.till('THANK YOU',null,true);p.space(6);
  const bits=barcodeBits(ref),available=PAPER_CONFIG.printableDots-PAPER_CONFIG.receiptInsetDots*2,module=(bits.length+20)*2<=available?2:1;let x=(PAPER_CONFIG.printableDots-bits.length*module)/2;
  for(const bit of bits){if(bit==='1')p.x.fillRect(Math.floor(x),p.y,module,PAPER_CONFIG.barcodeHeightDots);x+=module;}p.space(PAPER_CONFIG.barcodeHeightDots+6);
  p.till(ref,null,true);p.space(8);
  if(spec.method==='card'){
    p.till('PAYMENT SALE');p.till('TERMINAL',meta.terminal);p.till('PAYMENT REF',meta.paymentRef);
    p.till('CARD ENDING',meta.cardEnding);p.till('ENTRY',meta.entry);
    p.till('AMOUNT',currency+' '+priceText(spec.price));p.till('AUTH CODE',meta.auth);p.till('TOTAL',currency+' '+priceText(spec.price));
  }else{
    p.till('CASH SALE');p.till('PAYMENT REF',meta.paymentRef);p.till('AMOUNT',currency+' '+priceText(spec.price));
    p.till('TENDERED',currency+' '+priceText(spec.tender));p.till('CHANGE',currency+' '+priceText(spec.tender-spec.price));
  }
  p.till('PLEASE KEEP FOR YOUR RECORDS',null,true);p.space(8);
  p.till('FICTIONAL TRANSACTION',null,true);p.till('NO PAYMENT PROCESSED',null,true);p.till('NOT PROOF OF PURCHASE',null,true);
  const receiptEnd=p.y+PAPER_CONFIG.receiptInsetDots;p.space(34);p.till('-------- CUT HERE --------',null,true);p.space(34);const voucherStart=p.y;
  renderVoucherBody(p,spec,voucher,bodyFont,translationFont);
  const full=p.finish();
  const crop=(start,end)=>{const c=canvas(PAPER_CONFIG.printableDots,end-start);c.getContext('2d').drawImage(full,0,start,PAPER_CONFIG.printableDots,end-start,0,0,PAPER_CONFIG.printableDots,end-start);return c;};
  return {full,receipt:crop(0,receiptEnd),voucher:crop(voucherStart,full.height)};
}
function renderVoucherBody(p,spec,voucher,bodyFont,translationFont){
  if(spec.original){p.text('Hanpu Li',TYPE_CONFIG.authorLatin,bodyFont,true,56);p.space(TYPE_CONFIG.authorNameGapDots);p.text('李函璞',TYPE_CONFIG.authorCjk,bodyFont,true,29);p.space(10);}
  // Every voucher element follows the purchased typeface. Metadata gets its own optical size.
  const pixel=isBitmapFamily(bodyFont),labelFont=pixel?bitmapFamily('en'):serif;
  const label=(text,center=true,family=labelFont)=>p.text(text,24,family,center,32,false,pixel?400:600);
  label('POETRY VOUCHER');label('NO. '+voucher);
  p.space(8);p.x.fillRect(PAPER_CONFIG.bodyInsetDots,p.y,PAPER_CONFIG.bodyWidthDots,2);p.space(16);p.text(spec.title,22,bodyFont,false,29);
  if(!spec.original&&spec.author)p.text(spec.author,14,bodyFont,false,20);
  if(!spec.original){p.space(4);label('READER EDITION',false);}p.space(16);
  for(const line of spec.poem.split('\n')){if(line)p.text(line,spec.size,bodyFont);else p.space(18);}
  if(spec.translation){p.space(14);p.text(spec.translationTitle||spec.work?.translations?.[spec.translationLocale||'en']?.title||'',TYPE_CONFIG.translation,translationFont,false,24,true);p.space(6);for(const line of spec.translation.split('\n')){if(line)p.text(line,TYPE_CONFIG.translation,translationFont,false,24);else p.space(10);}}
  p.space(14);
  if(spec.original){if(spec.work.edition)label(spec.work.edition,true,bodyFont);label(spec.work.source_url.replace('https://',''));}
  p.space(12);label('ART EDITION');label('NO CASH VALUE');
}
function pdf(c){
  // Lossless 1-bit PDF. The 384-dot image sits on a 58mm / 8-dots-per-mm paper model.
  const w=PAPER_CONFIG.paperMm*PAPER_CONFIG.dotsPerMm,h=c.height+PAPER_CONFIG.pdfVerticalMarginDots*2,stride=Math.ceil(w/8),pixels=c.getContext('2d').getImageData(0,0,PAPER_CONFIG.printableDots,c.height).data;
  const data=new Uint8Array(stride*h).fill(255);
  for(let y=0;y<c.height;y++)for(let x=0;x<PAPER_CONFIG.printableDots;x++)if(pixels[(y*PAPER_CONFIG.printableDots+x)*4]===0)data[(y+PAPER_CONFIG.pdfVerticalMarginDots)*stride+Math.floor((x+PAPER_CONFIG.pdfSideMarginDots)/8)]&=~(128>>((x+PAPER_CONFIG.pdfSideMarginDots)%8));
  const width=(PAPER_CONFIG.paperMm*72/25.4).toFixed(6),height=(h/PAPER_CONFIG.dotsPerMm*72/25.4).toFixed(6),encoder=new TextEncoder();
  const stream=`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  const objects=[['<< /Type /Catalog /Pages 2 0 R >>'],['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`],
    [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 1 /Interpolate false /Length ${data.length} >>\nstream\n`,data,'\nendstream'],
    [`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]];
  const chunks=[],offsets=[0];let length=0;
  const add=part=>{const bytes=typeof part==='string'?encoder.encode(part):part;chunks.push(bytes);length+=bytes.length;};
  add('%PDF-1.4\n');objects.forEach((parts,i)=>{offsets.push(length);add(`${i+1} 0 obj\n`);parts.forEach(add);add('\nendobj\n');});
  const start=length;add('xref\n0 6\n0000000000 65535 f \n');offsets.slice(1).forEach(o=>add(String(o).padStart(10,'0')+' 00000 n \n'));
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}
function blobURL(blob){const url=URL.createObjectURL(blob);objectURLs.push(url);return url;}
async function generate(event){
  $('generate').disabled=true;
  const currentRevision=revision;
  try{
    message('在此裝置排版中…');
    const work=currentWork(),original=unchanged(work),size=Number($('size').value),selected=selectedTranslation(work);
    const quote=updatePrice(true);
    const spec={title:$('title').value.trim(),author:$('author').value,poem:$('poem').value.replace(/\r\n?/g,'\n'),size,work,original,locale:original?'zh-Hant':uiLocale,
      price:quote.price,tender:quote.tender,method:quote.method,items:quote.items,font:$('font').value,created:new Date(),translation:selected?.body||'',translationTitle:selected?.title||'',translationLocale:selected?.locale||''};
    if(!spec.title||!spec.poem.trim())throw Error('請填寫題名和正文。');
    if(spec.title.length>INPUT_LIMITS.title||spec.author.length>INPUT_LIMITS.author||spec.poem.length>INPUT_LIMITS.poem)throw Error('文字超出長度上限。');
    if(/[\u0000-\u0008\u000b-\u001f\u007f]/.test(spec.title+spec.author+spec.poem))throw Error('文字包含不支援的控制字元。');
    if(spec.title.includes('\n')||spec.author.includes('\n'))throw Error('題名與署名請使用單行。');
    if(spec.tender<spec.price)throw Error('現金不能低於標價。');
    if(!['bitmap','site'].includes(spec.font)||!typeSizes(spec.font).includes(size))throw Error('不支援的字號。');
    const random=new Uint8Array(4);crypto.getRandomValues(random);spec.ref=receiptReference(spec.created,random);
    const fontSample=spec.poem+spec.title+spec.author+(work?.edition||'')+spec.translationTitle+spec.translation+'李函璞';
    const pixelLoads=new Set();
    if(spec.font==='bitmap')pixelLoads.add(bitmapFace(spec.locale));
    if(spec.font==='bitmap'&&spec.translation)pixelLoads.add(bitmapFace(spec.translationLocale));
    if(spec.original)pixelLoads.add(bitmapFace('zh-Hant'));
    await Promise.all([
      ...['EB','Courier','ShipCommon','Ship','IMing','Noto','FusionPixelLatin'].map(f=>document.fonts.load(`${TYPE_CONFIG.defaultSize}px ${f}`,fontSample)),
      ...[...pixelLoads].map(f=>document.fonts.load(`${TYPE_CONFIG.defaultSize}px ${f}`,fontSample))
    ]);
    await document.fonts.load(`italic ${TYPE_CONFIG.translation}px EB`);
    const result=render(spec),png=await new Promise(resolve=>result.full.toBlob(resolve,'image/png'));
    if(revision!==currentRevision){message('排版時內容已改動，請再製作一次。');return;}
    objectURLs.forEach(URL.revokeObjectURL);objectURLs=[];
    for(const kind of ['receipt','voucher','full']){$(kind+'-image').src=result[kind].toDataURL('image/png');$(kind+'-image').hidden=false;$(kind+'-pdf').href=blobURL(pdf(result[kind]));$(kind+'-pdf').hidden=false;}
    $('full-png').href=blobURL(png);$('full-png').hidden=false;
    $('reading-title').textContent=spec.title;$('reading-author').textContent=spec.author;$('reading-poem').textContent=spec.poem;
    $('translation-section').hidden=!spec.translation;$('translation-section').lang=spec.translationLocale||'en';$('translation-title').textContent=spec.translationTitle;$('translation').textContent=spec.translation;
    proofState={ref:spec.ref,original,mm:(result.full.height+PAPER_CONFIG.pdfVerticalMarginDots*2)/PAPER_CONFIG.dotsPerMm};updateLocale();
    message('詩券已生成，可下載。沒有上傳文字，也沒有發出打印任務。');
    if(event?.type==='click'&&matchMedia('(max-width:680px)').matches){
      const proof=document.querySelector('.proof-area');
      proof.focus({preventScroll:true});
      proof.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
    }
  }catch(error){message(error.message);document.querySelectorAll('.downloads a').forEach(a=>a.hidden=true);}
  finally{$('generate').disabled=false;}
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
  for(const name of ['pair','full','text'])$(name+'-view').hidden=name!==b.dataset.view;
  document.querySelectorAll('[data-view]').forEach(other=>other.setAttribute('aria-pressed',String(other===b)));
}));
fields.forEach(id=>$(id).addEventListener('input',dirty));$('work').addEventListener('change',loadWork);$('generate').addEventListener('click',generate);
(async()=>{try{
  const r=await fetch('editions.json');if(!r.ok)throw Error('作品目錄暫時無法載入，請重新整理。');
  const data=await r.json();works=data.works;patterns=data.patterns;codes=data.code128;stopCode=data.code128_stop;
  for(const [id,maxLength] of Object.entries(INPUT_LIMITS))$(id).maxLength=maxLength;
  syncTypeSize();updateLocale();
  const requested=new URL(location.href).searchParams.get('work');
  $('work').value=works.some(w=>w.id===requested)?requested:requested==='custom'?'custom':RECEIPT_CONFIG.defaultWork;$('work').disabled=false;loadWork();if(document.body.classList.contains('shop-page'))document.dispatchEvent(new Event('catalogueready'));else if(currentWork())await generate();
}catch(error){message(error.message);document.dispatchEvent(new CustomEvent('catalogueerror',{detail:error.message}));}})();
