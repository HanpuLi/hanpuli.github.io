'use strict';
(() => {
  const TERMINAL_ORIGIN='http://127.0.0.1:18859';
  const CHANNEL='poetry-voucher-h10s';
  let bridge=null;
  const attached=new Set();
  const statusCopy={
    sending:['正在傳送小票和全部詩券至已配對的 H10S…','Sending the receipt and all poem vouchers to the paired H10S…','正在发送小票和全部诗券至已配对的 H10S…','ペアリング済み H10S にレシートと全詩券を送信中…','Beleg und alle Gedichtbons werden an den gekoppelten H10S gesendet…','Envoi du reçu et de tous les bons-poèmes au H10S associé…','Отправка чека и всех поэтических талонов на сопряжённый H10S…'],
    accepted:['小票和全部詩券已交給 H10S 本機服務；請查看狀態並檢查紙條。','The receipt and all poem vouchers were handed to the local H10S service. Check its status and the printout.','小票和全部诗券已交给 H10S 本地服务；请查看状态并检查纸条。','レシートと全詩券を H10S のローカルサービスに登録しました。状態と印字を確認してください。','Beleg und alle Gedichtbons wurden beim lokalen H10S-Dienst eingereiht. Status und Ausdruck prüfen.','Le reçu et tous les bons-poèmes ont été transmis au service local H10S. Vérifiez son état et l’impression.','Чек и все поэтические талоны переданы локальной службе H10S. Проверьте состояние и распечатку.'],
    recorded:['這份小票和詩券已登記，沒有再次打印。','This receipt and its poem vouchers are already recorded and were not sent again.','这份小票和诗券已登记，没有再次打印。','このレシートと詩券は記録済みで、再送していません。','Dieser Beleg und seine Gedichtbons sind bereits erfasst und wurden nicht erneut gesendet.','Ce reçu et ses bons-poèmes sont déjà enregistrés et n’ont pas été renvoyés.','Этот чек и его поэтические талоны уже записаны и не отправлялись повторно.'],
    interrupted:['連線中斷。再次操作前請先查看 H10S 訂單列表。','Connection interrupted. Check the H10S order list before trying again.','连接中断。再次操作前请先查看 H10S 订单列表。','接続が中断しました。再操作の前に H10S の注文一覧を確認してください。','Verbindung unterbrochen. Vor erneutem Versuch die H10S-Auftragsliste prüfen.','Connexion interrompue. Vérifiez la liste des commandes H10S avant de réessayer.','Связь прервана. Перед повторной попыткой проверьте список заказов H10S.'],
    preparationFailed:['無法準備打印圖像，沒有送往 H10S。請重試。','Print artwork could not be prepared. Nothing was sent to H10S. Try again.','无法准备打印图像，未发送到 H10S。请重试。','印刷データを準備できませんでした。H10S には送信していません。再試行してください。','Druckdaten konnten nicht vorbereitet werden. Nichts an H10S gesendet. Bitte erneut versuchen.','Impossible de préparer les images d’impression. Rien n’a été envoyé au H10S. Réessayez.','Не удалось подготовить печать. На H10S ничего не отправлено. Повторите попытку.']
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
  window.h10OrderPrinter={
    add(button,order,result){
      button.className='download-link h10-print-order';
      button.type='button';
      button.dataset.shop='Print receipt and vouchers on H10S';
      button.dataset.reference=order.ref;
      button.hidden=!bridge;
      update(button,'');
      button.addEventListener('click',()=>{
        if(!bridge||window.parent===window)return;
        try{
          const orderPages=window.poetryShop?.pagesForH10?.(order.ref,result);
          if(!Array.isArray(orderPages)||orderPages.length<2)throw Error('order pages unavailable');
          const packed=orderPages.map(encode);
          if(packed.reduce((total,page)=>total+page.height,0)>120000)throw Error('order too long');
          update(button,'sending');
          window.parent.postMessage({channel:CHANNEL,type:'print-order',nonce:bridge.nonce,reference:order.ref,pages:packed},bridge.origin);
        }catch(error){
          console.error('H10S print preparation failed',error);
          update(button,'preparationFailed');
        }
      });
      attached.add(button);
    }
  };
})();
