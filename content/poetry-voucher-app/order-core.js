'use strict';
// Shared frozen-order validation and exact bitmap transport. No device credentials or API.
const PoetryOrder = (() => {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const locales=['en','zh-Hant','zh-Hans','ja','de','fr','ru'];
  const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v);
  function validate(order){
    if(!order||typeof order!=='object'||!/^\d{12}(?:\d{2})?$/.test(order.ref))throw Error('Invalid saved order identity.');
    if(order.id!==undefined&&!uuid.test(order.id))throw Error('Invalid saved order UUID.');
    if(order.schema!==undefined&&order.schema!==2)throw Error('Unsupported saved order.');
    if(order.schema===2&&!uuid.test(order.id))throw Error('Missing order UUID.');
    if(order.terminalId!==undefined&&!uuid.test(order.terminalId))throw Error('Invalid terminal identity.');
    if(!(typeof order.created==='string'||order.created instanceof Date)||!Number.isFinite(new Date(order.created).getTime()))throw Error('Invalid order date.');
    if(!Array.isArray(order.lines)||!order.lines.length||order.lines.length>24)throw Error('Invalid order lines.');
    let units=0,total=0;const items=[];
    for(const line of order.lines){
      if(!line||!integer(line.quantity,1,24)||(units+=line.quantity)>24)throw Error('Order quantity exceeds 24.');
      if(!locales.includes(line.locale)||!['bitmap','site'].includes(line.font)||!(line.font==='bitmap'?[24,36]:[22,24,26]).includes(line.size))throw Error('Invalid edition settings.');
      if(!text(line.title,160)||!line.title.trim()||!text(line.author,100)||/[\r\n]/.test(line.title+line.author)||!text(line.poem,1800)||!line.poem.trim())throw Error('Invalid saved text.');
      if(!Array.isArray(line.translations)||line.translations.length>5||new Set(line.translations).size!==line.translations.length)throw Error('Invalid translations.');
      if(line.work&&!text(line.work.source_id,80))throw Error('Invalid edition identity.');
      for(const locale of line.translations){
        const translation=line.work?.translations?.[locale];
        if(!['en','ja','de','fr','ru'].includes(locale)||!translation||!text(translation.body,12000)||!translation.body.trim()||!text(translation.title,500))throw Error('Missing frozen translation.');
      }
      if(!Array.isArray(line.items)||!line.items.length||line.items.length>8||!integer(line.unitPrice,0,1000000))throw Error('Invalid frozen prices.');
      let lineTotal=0;
      for(const item of line.items){
        const quantity=item?.quantity??1,unit=item?.unitPrice??item?.amount;
        if(quantity!==line.quantity||!integer(unit,0,1000000)||!integer(item.amount,0,24000000)||item.amount!==quantity*unit||!text(item.receipt,100)||!text(item.id,40)||!text(item.taxCode,8)||!integer(item.taxRate,0,100))throw Error('Inconsistent receipt item.');
        lineTotal+=item.amount;items.push(item);
      }
      if(lineTotal!==line.unitPrice*line.quantity)throw Error('Inconsistent line total.');total+=lineTotal;
    }
    // Compare saved amounts, never reprice historical editions using today's catalogue.
    if(order.units!==units||order.total!==total||JSON.stringify(order.items)!==JSON.stringify(items))throw Error('Inconsistent frozen order totals.');
    const pay=order.payment;
    if(!pay||!['cash','card'].includes(pay.method)||!integer(pay.tender,total,24000000)||!integer(pay.change,0,24000000)||pay.tender-pay.change!==total||(pay.method==='card'&&(pay.tender!==total||pay.change!==0)))throw Error('Invalid payment scene.');
    if(order.receiptMetadata){for(const [key,value] of Object.entries(order.receiptMetadata))if(!text(key,40)||!text(value,100))throw Error('Invalid receipt metadata.');}
    if(order.schema===2&&order.receiptMetadata&&(order.receiptMetadata.transaction!==order.ref.slice(-6)||order.receiptMetadata.paymentRef!=='PV'+order.ref.slice(-8)))throw Error('Receipt metadata belongs to another order.');
    return order;
  }
  function restore(raw){
    if(typeof raw!=='string'||raw.length>2000000)throw Error('Saved order is too large.');
    const order=JSON.parse(raw);
    if(Array.isArray(order?.lines))for(const line of order.lines)if(!Array.isArray(line.translations))line.translations=line.language&&line.language!=='receipt'?[line.language]:[];
    validate(order);order.created=new Date(order.created);return order;
  }
  function encode(canvas){
    if(!canvas||canvas.width!==384||!integer(canvas.height,1,6000))throw Error('Invalid print dimensions.');
    const pixels=canvas.getContext('2d').getImageData(0,0,384,canvas.height).data,bits=new Uint8Array(canvas.height*48);
    for(let i=0;i<384*canvas.height;i++){
      const p=i*4,v=pixels[p];
      if(pixels[p+3]!==255||![0,255].includes(v)||pixels[p+1]!==v||pixels[p+2]!==v)throw Error('Print must be opaque one bit.');
      if(v===0)bits[i>>3]|=128>>(i&7);
    }
    let binary='';for(let i=0;i<bits.length;i+=8192)binary+=String.fromCharCode(...bits.subarray(i,i+8192));
    return {height:canvas.height,bits:btoa(binary)};
  }
  function pack(pages){
    if(!Array.isArray(pages)||!pages.length||pages.length>128||pages.reduce((n,c)=>n+c.height,0)>120000)throw Error('Order exceeds printer limits.');
    return pages.map(encode);
  }
  const identity=order=>order.id||order.ref;
  const printIdentity=order=>'web-'+identity(order);
  return Object.freeze({validate,restore,encode,pack,identity,printIdentity,isUUID:value=>typeof value==='string'&&uuid.test(value)});
})();
