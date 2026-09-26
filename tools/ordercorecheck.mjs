import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({Date,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64')});
vm.runInContext(readFileSync(new URL('../content/poetry-voucher-app/order-core.js',import.meta.url),'utf8'),context);
const core=vm.runInContext('PoetryOrder',context);
const item={id:'poem',receipt:'POETRY VOUCHER',taxCode:'A',taxRate:20,quantity:1,unitPrice:299,amount:299};
const valid={schema:2,id:'00000000-0000-4000-8000-000000000001',ref:'260926123456',created:'2026-09-26T23:30:00+01:00',units:1,total:299,items:[item],payment:{method:'cash',tender:500,change:201},lines:[{workId:null,work:null,title:'Historical text',author:'A',poem:'A\nB',locale:'en',translations:[],font:'bitmap',size:24,quantity:1,unitPrice:299,items:[item]}]};
assert.equal(core.restore(JSON.stringify(valid)).created.toISOString(),'2026-09-26T22:30:00.000Z');
for(const modify of [o=>o.lines[0].quantity=25,o=>o.lines[0].quantity=0,o=>o.lines[0].quantity=-1,o=>o.lines[0].quantity=1.5,o=>o.lines[0].quantity=1e9,o=>o.units=2,o=>o.total=300,o=>o.lines[0].items[0].amount=1,o=>o.created='invalid',o=>o.lines[0].translations=['en'],o=>o.lines[0].poem='x'.repeat(1801),o=>o.lines[0].font='unknown',o=>o.payment.change=200,o=>o.id='260926123456',o=>o.receiptMetadata={transaction:'999999',paymentRef:'PV99999999'}]){
 const bad=structuredClone(valid);modify(bad);assert.throws(()=>core.restore(JSON.stringify(bad)));
}
const legacy=structuredClone(valid);delete legacy.schema;delete legacy.id;assert.equal(core.printIdentity(core.restore(JSON.stringify(legacy))),'web-260926123456');
const other=structuredClone(valid);other.id='00000000-0000-4000-8000-000000000002';assert.notEqual(core.identity(valid),core.identity(other));
const pixels=new Uint8ClampedArray(384*2*4).fill(255),canvas={width:384,height:2,getContext:()=>({getImageData:()=>({data:pixels})})};
for(const i of [0,7,8,383,384,767])pixels.fill(0,i*4,i*4+3);
const bits=Buffer.from(core.encode(canvas).bits,'base64');assert.deepEqual([bits[0],bits[1],bits[47],bits[48],bits[95]],[129,128,1,128,1]);
pixels[3]=0;assert.throws(()=>core.encode(canvas));pixels[3]=255;pixels[0]=100;assert.throws(()=>core.encode(canvas));
assert.throws(()=>core.pack([]));assert.throws(()=>core.pack(Array(129).fill(canvas)));assert.throws(()=>core.encode({...canvas,width:385}));assert.throws(()=>core.encode({...canvas,height:6001}));
console.log('ordercorecheck: frozen schema, quantities/totals/payment/text limits, legacy identity, UUID collision isolation, exact 1-bit encoding and page bounds OK');
