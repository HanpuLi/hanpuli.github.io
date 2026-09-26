'use strict';
(() => {
  const TERMINAL_ORIGIN='http://127.0.0.1:18859';
  const CHANNEL='poetry-voucher-h10s';
  let bridge=null;
  const attached=new Set();
  const statusCopy={
    sending:['正在傳送小票至已配對的 H10S…','Sending this receipt to the paired H10S…','正在发送小票至已配对的 H10S…','ペアリング済み H10S にレシートを送信中…','Beleg wird an den gekoppelten H10S gesendet…','Envoi du reçu au H10S associé…','Отправка чека на сопряжённый H10S…'],
    accepted:['已交給 H10S 本機服務；請查看狀態並檢查小票。','Handed to the local H10S service. Check its status and the receipt.','已交给 H10S 本地服务；请查看状态并检查小票。','H10S のローカルサービスに登録しました。状態とレシートを確認してください。','Beim lokalen H10S-Dienst eingereiht. Status und Beleg prüfen.','Transmis au service local H10S. Vérifiez son état et le reçu.','Передано локальной службе H10S. Проверьте состояние и чек.'],
    recorded:['這張小票已登記，沒有再次打印。','This receipt is already recorded and was not sent again.','这张小票已登记，没有再次打印。','このレシートは記録済みで、再送していません。','Dieser Beleg ist bereits erfasst und wurde nicht erneut gesendet.','Ce reçu est déjà enregistré et n’a pas été renvoyé.','Этот чек уже записан и не отправлялся повторно.'],
    interrupted:['連線中斷。再次操作前請先查看 H10S 訂單列表。','Connection interrupted. Check the H10S order list before trying again.','连接中断。再次操作前请先查看 H10S 订单列表。','接続が中断しました。再操作の前に H10S の注文一覧を確認してください。','Verbindung unterbrochen. Vor erneutem Versuch die H10S-Auftragsliste prüfen.','Connexion interrompue. Vérifiez la liste des commandes H10S avant de réessayer.','Связь прервана. Перед повторной попыткой проверьте список заказов H10S.']
  };
  function languageIndex(){
    const language=document.documentElement.dataset.uiLocale||'en';
    return Math.max(0,['zh-Hant','en','zh-Hans','ja','de','fr','ru'].indexOf(language));
  }
  function encode(canvas){
    if(!canvas||canvas.width!==384||canvas.height<1||canvas.height>6000)throw Error('invalid receipt dimensions');
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    const bits=new Uint8Array(canvas.height*48);
    for(let i=0;i<canvas.width*canvas.height;i++){
      const p=i*4,value=pixels[p];
      if(pixels[p+3]!==255||![0,255].includes(value)||pixels[p+1]!==value||pixels[p+2]!==value)throw Error('receipt is not opaque one-bit artwork');
      if(value===0)bits[i>>3]|=128>>(i&7);
    }
    let binary='';
    for(let i=0;i<bits.length;i+=8192)binary+=String.fromCharCode(...bits.subarray(i,i+8192));
    return {height:canvas.height,bits:btoa(binary)};
  }
  function update(button,key){
    button.disabled=['sending','accepted','recorded'].includes(key);
    button.dataset.printStatus=key||'';
    if(key)button.textContent=statusCopy[key][languageIndex()];
    const status=button.nextElementSibling;
    if(status?.classList.contains('h10-print-status'))status.textContent=key?statusCopy[key][languageIndex()]:'';
  }
  function onMessage(event){
    const data=event.data;
    if(event.origin!==TERMINAL_ORIGIN||event.source!==window.parent||!data||data.channel!==CHANNEL)return;
    if(data.type==='ready'&&typeof data.nonce==='string'&&/^[0-9a-f-]{36}$/.test(data.nonce)){
      bridge={nonce:data.nonce,origin:event.origin};
      for(const button of attached)button.hidden=false;
      return;
    }
    if(data.type==='print-result'&&bridge&&data.nonce===bridge.nonce&&/^[0-9]{12}$/.test(data.reference)){
      for(const button of attached){
        if(button.dataset.reference!==data.reference)continue;
        update(button,data.accepted?(data.fresh?'accepted':'recorded'):'interrupted');
      }
    }
  }
  window.addEventListener('message',onMessage);
  document.addEventListener('presslocalechange',()=>queueMicrotask(()=>{
    for(const button of attached)if(button.dataset.printStatus)update(button,button.dataset.printStatus);
  }));
  window.h10ReceiptPrinter={
    add(button,order,pages){
      button.className='download-link h10-print-receipt';
      button.type='button';
      button.dataset.shop='Print receipt on H10S';
      button.dataset.reference=order.ref;
      button.hidden=!bridge;
      update(button,'');
      button.addEventListener('click',()=>{
        if(!bridge||window.parent===window)return;
        try{
          const h10Receipt=window.poetryShop?.receiptPagesForH10?.(order.ref)||pages;
          const packed=h10Receipt.map(encode);
          if(packed.reduce((total,page)=>total+page.height,0)>120000)throw Error('receipt too long');
          update(button,'sending');
          window.parent.postMessage({channel:CHANNEL,type:'print-receipt',nonce:bridge.nonce,reference:order.ref,pages:packed},bridge.origin);
        }catch{
          update(button,'interrupted');
        }
      });
      attached.add(button);
    }
  };
})();
