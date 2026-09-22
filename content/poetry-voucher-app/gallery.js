'use strict';
// England/London specimen: Bank of England notes, ordinary circulating UK coins.
const noteValues=[5000,2000,1000,500],changeValues=[...noteValues,200,100,50,20,10,5,2,1];
function denominations(amount,values){
  const parts=[];
  for(const value of values){const count=Math.floor(amount/value);if(count)parts.push({value,count});amount%=value;}
  return parts;
}
function cashPayment(price){
  if(!price)return {tender:0,change:0,notes:[],changeParts:[]};
  // Prefer the smallest single sufficient note; above £50 use a notes-only combination.
  const tender=[...noteValues].reverse().find(value=>value>=price)||Math.ceil(price/500)*500;
  return {tender,change:tender-price,notes:denominations(tender,noteValues),changeParts:denominations(tender-price,changeValues)};
}
// Fictional tariff PV3. Each chargeable SKU ends in .99; totals are exact sums.
function paymentFor(price,mode,counts=[]){
  if(mode==='card')return {method:'card',tender:price,change:0,notes:[],changeParts:[],shortfall:0};
  if(mode==='notes')return {method:'cash',...cashPayment(price),shortfall:0};
  const values=mode==='coins'?changeValues.filter(v=>v<500):changeValues;
  const notes=mode==='manual'?changeValues.map((value,i)=>({value,count:Number(counts[i]||0)})):denominations(price,values);
  if(notes.some(p=>!Number.isInteger(p.count)||p.count<0||p.count>100))throw Error('面額數量須為 0–100 的整數。');
  const tender=notes.reduce((sum,p)=>sum+p.value*p.count,0),change=Math.max(0,tender-price);
  return {method:'cash',tender,change,notes:notes.filter(p=>p.count),changeParts:denominations(change,changeValues),shortfall:Math.max(0,price-tender)};
}
// Artistic scene weights, not a claim about real retail payment statistics.
function automaticPayment(price,roll,cashRoll=0.5){
  const mode=roll<0.5?'card':roll<0.75?'notes':roll<0.9?'mixed':price<=1000?'coins':'mixed';
  if(price>0&&(mode==='coins'||mode==='mixed')){
    // Occasionally exact; usually round up like a handful of change, not a solver.
    const step=cashRoll<0.1?1:cashRoll<0.55?100:cashRoll<0.85?200:50;
    const tender=Math.ceil(price/step)*step,change=tender-price;
    const values=mode==='coins'?changeValues.filter(v=>v<500):changeValues;
    return {method:'cash',mode,tender,change,notes:denominations(tender,values),changeParts:denominations(change,changeValues),shortfall:0};
  }
  return {...paymentFor(price,mode),mode};
}
function quotePoem(poem,translation='',font='bitmap',custom=false){
  let characters=0,lines=0,stanzas=0;
  for(const text of [poem]){
    let inStanza=false;
    for(const line of text.normalize('NFC').replace(/\r\n?/g,'\n').split('\n')){
      const count=(line.match(/[\p{L}\p{N}]/gu)||[]).length;
      characters+=count;
      if(line.trim()) {lines++;if(!inStanza)stanzas++;inStanza=true;}
      else inStanza=false;
    }
  }
  const base=lines?100:0,weighted=base+characters*2+lines*5+stanzas*10;
  const edition=lines?Math.ceil((weighted-99)/100)*100+99:0;
  const items=lines?[{id:'poem',label:'詩券',receipt:'POETRY VOUCHER',amount:edition}]:[];
  if(lines&&font==='site')items.push({id:'font',label:'網站字體版本',receipt:'WEBSITE TYPEFACES',amount:199});
  if(lines&&translation.trim())items.push({id:'translation',label:'附加英譯',receipt:'ENGLISH TRANSLATION',amount:199});
  if(lines&&custom)items.push({id:'custom',label:'自選內容',receipt:'CUSTOM TEXT',amount:199});
  const price=items.reduce((sum,item)=>sum+item.amount,0);
  return {characters,lines,stanzas,base,weighted,edition,items,price,...cashPayment(price)};
}
function wrapText(text,measure,width=352){
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
function typeSizes(font){return font==='site'?[22,24,26]:[24,36];}
const $=id=>document.getElementById(id);
const serif='EB, ShipCommon, Ship, IMing, Noto, serif',mono='Courier, monospace';
const bitmap='FusionPixel, sans-serif';
let works=[],patterns,codes,stopCode,revision=0,objectURLs=[],messageKey='正在載入作品…',proofState=null;
let paymentRoll=null,cashRoll=0.5;
function message(key){messageKey=key;$('message').textContent=tr(key);}
function updateSource(){
  const w=currentWork();$('source-note').replaceChildren();
  if(w){const a=document.createElement('a'),source=new URL(w.source_url);
    const route={'en':'','zh-Hant':'zh/','zh-Hans':'zh-hans/','ja':'ja/','de':'de/','fr':'fr/','ru':'ru/'}[uiLocale];
    a.href='/'+route+source.pathname.split('/').pop()+source.hash;
    a.textContent=tr('原站作品 ↗')+' · '+w.source_id;$('source-note').append(a);}
  else $('source-note').textContent=tr('寫下自己的作品。署名留空也可以。');
}
function updateLocale(){
  const selected=$('work').value;
  if(works.length){
    $('work').replaceChildren();const custom=document.createElement('option');custom.value='custom';custom.textContent=tr('＋ 寫自己的詩');$('work').append(custom);
    for(const w of works){const option=document.createElement('option');option.value=w.id;
      // Work titles are authored content. Use only an existing published English title.
      const title=uiLocale==='en'&&w.translation_title?w.translation_title:w.title;
      option.textContent=`${w.source_id} / ${title}`;$('work').append(option);
    }$('work').value=selected;updateSource();
  }
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
  $('size').value=String(sizes.includes(current)?current:24);
}
function updatePrice(reroll=false){
  const w=currentWork(),translation=unchanged(w)&&$('language').value==='bilingual'?w.translation:'';
  const quote=quotePoem($('poem').value,translation,$('font').value,!unchanged(w));
  if(reroll){const bytes=new Uint32Array(2);crypto.getRandomValues(bytes);paymentRoll=bytes[0]/4294967296;cashRoll=bytes[1]/4294967296;}
  Object.assign(quote,automaticPayment(quote.price,paymentRoll??0,cashRoll));
  const modes={card:'刷卡 · 模擬交易',notes:'現金 · 自動紙幣',coins:'現金 · 硬幣支付',mixed:'現金 · 紙幣硬幣混合支付'};
  $('payment-summary').textContent=paymentRoll===null?tr('生成時自動抽取付款場景。'):tr(modes[quote.mode]);
  $('tender-group').hidden=quote.method==='card';
  $('price').value=priceText(quote.price);$('tender').value=priceText(quote.tender);
  const fmt=p=>new Intl.NumberFormat(document.documentElement.lang,{style:'currency',currency:'GBP'}).format(p/100);
  const number=n=>new Intl.NumberFormat(document.documentElement.lang).format(n);
  $('price-breakdown').replaceChildren();
  for(const item of quote.items){const row=document.createElement('div');row.textContent=`${tr(item.label)} × 1 — ${fmt(item.amount)}`;$('price-breakdown').append(row);}
  $('price-weights').textContent=[`${tr('基本費')} ${fmt(quote.base)}`,`${tr('字元')} ${number(quote.characters)} × ${fmt(2)}`,`${tr('非空行')} ${number(quote.lines)} × ${fmt(5)}`,`${tr('分節')} ${number(quote.stanzas)} × ${fmt(10)}`].join(' + ')+` = ${fmt(quote.weighted)} → ${fmt(quote.edition)}`;
  const parts=list=>list.map(part=>`${fmt(part.value)} × ${number(part.count)}`).join(' + ')||fmt(0);
  $('cash-notes').textContent=quote.method==='card'?tr('模擬刷卡，按總額支付；不收集卡號，不發起付款。'):`${tr('支付現金')}：${parts(quote.notes)}`;
  $('price-change').hidden=quote.method==='card';
  $('price-change').textContent=quote.shortfall?`${tr('尚欠')} ${fmt(quote.shortfall)}`:`${tr('找零')} ${fmt(quote.change)} = ${parts(quote.changeParts)}`;
  return quote;
}
function currentWork(){return works.find(w=>w.id===$('work').value);}
function unchanged(w){return w&&['title','author','poem'].every(k=>$(k).value===w[k]);}
function dirty(event){
  if(event?.target?.id==='font')syncTypeSize();
  revision++;
  document.querySelectorAll('.downloads a').forEach(a=>a.hidden=true);
  const selected=currentWork();
  if(selected&&['title','poem'].includes(event?.target?.id)&&$('author').value===selected.author&&!unchanged(selected)){
    $('author').value='';
  }
  const w=currentWork(),paired=unchanged(w)&&Boolean(w.translation);
  $('language').options[1].disabled=!paired;
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
  constructor(){this.c=canvas(384,5960);this.x=this.c.getContext('2d');this.y=12;}
  space(n){this.y+=n;if(this.y>5900)throw Error('這份文字超過紙條長度上限，請縮短正文或減小字號。');}
  till(left='',right=null,center=false,tall=false){
    let line=left.toUpperCase();
    if(right!==null)line+=' '.repeat(Math.max(0,30-line.length-right.length))+right.toUpperCase();
    if(line.length>30)throw Error('小票欄位過長。');
    if(center)line=' '.repeat(Math.floor((30-line.length)/2))+line;
    const sy=tall?4:2;
    for(let i=0;i<line.length;i++){
      const glyph=patterns[line[i]];if(!glyph)throw Error('不支援的小票字元。');
      glyph.split(' ').forEach((row,y)=>[...row].forEach((bit,x)=>{if(bit==='1')this.x.fillRect(12+i*12+x*2,this.y+(y+2)*sy,2,sy);}));
    }this.space(12*sy);
  }
  text(text,size=22,family=serif,center=false,leading=size+7,italic=false){
    // The pixel face was drawn at12 dots. Never interpolate its grid or fake italics.
    if(family===bitmap){size=size<16?12:Math.max(24,Math.round(size/12)*12);leading=Math.max(leading,size+8);italic=false;}
    this.x.font=`${italic?'italic ':''}${size}px ${family}`;this.x.textBaseline='alphabetic';
    const lines=wrapText(text,value=>this.x.measureText(value).width);
    for(const part of lines){
      this.space(0);const width=this.x.measureText(part).width;
      this.x.fillText(part,center?Math.round((384-width)/2):16,this.y+size);this.space(leading);
    }
  }
  finish(){
    const c=canvas(384,this.y+12),x=c.getContext('2d');x.drawImage(this.c,0,0);
    const pixels=x.getImageData(0,0,c.width,c.height);
    for(let i=0;i<pixels.data.length;i+=4){const v=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3<(this.threshold??184)?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}
    x.putImageData(pixels,0,0);return c;
  }
}
function barcodeBits(ref){
  const values=[104,...[...ref].map(c=>c.charCodeAt(0)-32)];
  const check=values.reduce((sum,v,i)=>sum+v*(i||1),0)%103;
  return [...values,check].map(v=>codes[v]).join('')+stopCode+'11';
}
function render(spec){
  const p=new Paper(),ref=spec.ref,code=spec.original?spec.work.source_id:'MS',voucher=code+'-'+ref.slice(-6);
  const bodyFont=spec.font==='site'?serif:bitmap;
  p.threshold=spec.font==='site'?184:128;
  const items=spec.items||[{id:'poem',receipt:'POETRY VOUCHER',amount:spec.price}];
  p.till('HANPU LI',null,true);p.till('LONDON',null,true);p.till('HANPULI.GITHUB.IO',null,true);p.space(12);
  p.till('CUSTOMER COPY',null,true);p.space(12);
  for(const item of items){p.till(item.receipt+(item.id==='poem'?' '+code:''),priceText(item.amount));p.till('  1 @ '+priceText(item.amount));}p.space(12);
  p.till('TOTAL','GBP '+priceText(spec.price),false,true);
  if(spec.method==='card'){p.till('CARD',priceText(spec.price));p.till('SIMULATED - NO PAYMENT',null,true);}
  else {p.till('CASH',priceText(spec.tender));p.till('CHANGE',priceText(spec.tender-spec.price));}p.space(12);
  p.till('ITEMS '+items.length);p.space(8);p.till('TILL 001','PRN 01');p.till('PRINTER','INNERPRINTER');p.till('PORT TTYS1','BAUD 460800');
  const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric'}).format(spec.created);
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(spec.created);
  p.till(date,time);p.till('RECEIPT',ref);p.till('VOUCHER',voucher);p.space(10);
  const bits=barcodeBits(ref),module=(bits.length+20)*2<=360?2:1;let x=(384-bits.length*module)/2;
  for(const bit of bits){if(bit==='1')p.x.fillRect(Math.floor(x),p.y,module,38);x+=module;}p.space(50);
  p.text('SPECIMEN / NOT PROOF OF PURCHASE',12,mono,true,18);
  const receiptEnd=p.y+12;p.space(34);p.till('-------- CUT HERE --------',null,true);p.space(34);const voucherStart=p.y;
  if(spec.original){p.text('Hanpu Li',42,serif,true,48);p.text('李函璞',20,bodyFont,true,29);p.space(10);}
  p.text('POETRY VOUCHER',16,mono,true,24);p.text('NO. '+voucher,14,mono,true,21);
  p.space(8);p.x.fillRect(16,p.y,352,1);p.space(16);p.text(spec.title,22,bodyFont,false,29);
  if(!spec.original&&spec.author)p.text(spec.author,14,bodyFont,false,20);
  if(!spec.original){p.space(4);p.text('READER EDITION',12,mono,false,18);}p.space(16);
  for(const line of spec.poem.split('\n')){if(line)p.text(line,spec.size,bodyFont);else p.space(18);}
  if(spec.translation){p.space(14);p.text(spec.work.translation_title,19,bodyFont,false,24,true);p.space(6);for(const line of spec.translation.split('\n')){if(line)p.text(line,19,bodyFont,false,24);else p.space(10);}}
  p.space(14);
  if(spec.original){if(spec.work.edition)p.text(spec.work.edition,12,bitmap,true,20);p.text(spec.work.source_url.replace('https://',''),12,mono,true,18);}
  p.space(12);p.text('ART EDITION / NO CASH VALUE',12,mono,true,18);
  const full=p.finish();
  const crop=(start,end)=>{const c=canvas(384,end-start);c.getContext('2d').drawImage(full,0,start,384,end-start,0,0,384,end-start);return c;};
  return {full,receipt:crop(0,receiptEnd),voucher:crop(voucherStart,full.height)};
}
function pdf(c){
  // Lossless 1-bit PDF. White=1, 58mm paper with 5mm side margins at 8 dots/mm.
  const w=464,h=c.height+40,stride=58,pixels=c.getContext('2d').getImageData(0,0,384,c.height).data;
  const data=new Uint8Array(stride*h).fill(255);
  for(let y=0;y<c.height;y++)for(let x=0;x<384;x++)if(pixels[(y*384+x)*4]===0)data[(y+20)*stride+Math.floor((x+40)/8)]&=~(128>>((x+40)%8));
  const width=(58*72/25.4).toFixed(6),height=(h/8*72/25.4).toFixed(6),encoder=new TextEncoder();
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
    const work=currentWork(),original=unchanged(work),size=Number($('size').value);
    const quote=updatePrice(true);
    if(quote.shortfall)throw Error('現金不足，請增加面額數量或更換付款方式。');
    const spec={title:$('title').value.trim(),author:$('author').value,poem:$('poem').value.replace(/\r\n?/g,'\n'),size,work,original,
      price:quote.price,tender:quote.tender,method:quote.method,items:quote.items,font:$('font').value,created:new Date(),translation:original&&$('language').value==='bilingual'?work.translation:''};
    if(!spec.title||!spec.poem.trim())throw Error('請填寫題名和正文。');
    if(spec.title.length>160||spec.author.length>100||spec.poem.length>1800)throw Error('文字超出長度上限。');
    if(/[\u0000-\u0008\u000b-\u001f\u007f]/.test(spec.title+spec.author+spec.poem))throw Error('文字包含不支援的控制字元。');
    if(spec.title.includes('\n')||spec.author.includes('\n'))throw Error('題名與署名請使用單行。');
    if(spec.tender<spec.price)throw Error('現金不能低於標價。');
    if(!['bitmap','site'].includes(spec.font)||!typeSizes(spec.font).includes(size))throw Error('不支援的字號。');
    const random=new Uint8Array(6);crypto.getRandomValues(random);spec.ref=Array.from(random,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    await Promise.all(['EB','Courier','ShipCommon','Ship','IMing','Noto','FusionPixel'].map(f=>document.fonts.load(`24px ${f}`,spec.poem+spec.title+spec.author+(work?.edition||'')+'李函璞')));
    await document.fonts.load('italic 19px EB');
    const result=render(spec),png=await new Promise(resolve=>result.full.toBlob(resolve,'image/png'));
    if(revision!==currentRevision){message('排版時內容已改動，請再製作一次。');return;}
    objectURLs.forEach(URL.revokeObjectURL);objectURLs=[];
    for(const kind of ['receipt','voucher','full']){$(kind+'-image').src=result[kind].toDataURL('image/png');$(kind+'-image').hidden=false;$(kind+'-pdf').href=blobURL(pdf(result[kind]));$(kind+'-pdf').hidden=false;}
    $('full-png').href=blobURL(png);$('full-png').hidden=false;
    $('reading-title').textContent=spec.title;$('reading-author').textContent=spec.author;$('reading-poem').textContent=spec.poem;
    $('translation-section').hidden=!spec.translation;$('translation-title').textContent=spec.translation?work.translation_title:'';$('translation').textContent=spec.translation;
    proofState={ref:spec.ref,original,mm:(result.full.height+40)/8};updateLocale();
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
  syncTypeSize();updateLocale();
  const requested=new URL(location.href).searchParams.get('work');
  $('work').value=works.some(w=>w.id===requested)?requested:requested==='custom'?'custom':'ci-b3';$('work').disabled=false;loadWork();if(currentWork())await generate();
}catch(error){message(error.message);}})();
