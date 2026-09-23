'use strict';
// Every row is complete: Traditional Chinese, English, Simplified Chinese,
// Japanese, German, French, Russian. Original poems are never translated here.
const localeNames=['zh-Hant','en','zh-Hans','ja','de','fr','ru'];
const localeRows=[
['詩券商店','Poetry shop','诗券商店','詩のショップ','Gedichtshop','Boutique de poésie','Магазин стихов'],
['點陣體 · 預設，已包含','Pixel typeface · default, included','点阵体 · 默认，已包含','ドット書体 · 標準、追加料金なし','Pixelschrift · Standard, inklusive','Police matricielle · par défaut, incluse','Пиксельный шрифт · по умолчанию, включён'],
['網站字體','Website typefaces','网站字体','サイトの書体','Website-Schriften','Polices du site','Шрифты сайта'],
['TYPEFACE_NOTE_TEMPLATE','Language-specific pixel typefaces are included by default at {bitmapSizes} dots. Website typefaces +{addOn} include EB Garamond and the site’s Chinese/Japanese fonts at {siteSizes} dots. A published translation or Simplified Chinese script edition adds {addOn} when available for the selected work.','各语言的点阵字体均默认包含，使用 {bitmapSizes} 点整倍字形。网站字体 +{addOn}，包含 EB Garamond 与网站的中日文字体，提供 {siteSizes} 点。附加已发布译文或简体字版本 +{addOn}，仅提供已有对应版本的作品。','言語別のドット書体は標準で含まれ、{bitmapSizes} ドットで使用します。サイトの書体は +{addOn} で、EB Garamond とサイトの中国語・日本語書体を {siteSizes} ドットで使用します。公開済みの翻訳または簡体字版は +{addOn} で、該当版のある作品のみ利用できます。','Sprachspezifische Pixelschriften sind standardmäßig enthalten und werden mit {bitmapSizes} Punkten verwendet. Website-Schriften kosten +{addOn} und umfassen EB Garamond sowie die chinesischen/japanischen Schriften der Website in {siteSizes} Punkten. Eine veröffentlichte Übersetzung oder die Ausgabe in vereinfachten Schriftzeichen kostet +{addOn}, sofern sie für das Werk vorliegt.','Les polices matricielles propres à chaque langue sont incluses par défaut en {bitmapSizes} points. Les polices du site ajoutent +{addOn} et comprennent EB Garamond ainsi que les polices chinoises/japonaises du site en {siteSizes} points. Une traduction publiée ou la version en caractères chinois simplifiés ajoute +{addOn}, si elle est disponible pour l’œuvre.','Языковые пиксельные шрифты включены по умолчанию и используются в размере {bitmapSizes} точек. Шрифты сайта стоят +{addOn} и включают EB Garamond, а также китайские/японские шрифты сайта в размере {siteSizes} точек. Опубликованный перевод или версия на упрощённом китайском стоит +{addOn}, если она доступна для произведения.'],
['網站字體版本','Website typeface edition','网站字体版本','サイト書体版','Website-Schriftenausgabe','Édition avec les polices du site','Версия со шрифтами сайта'],
['作品介紹','Project overview','作品介绍','作品について','Projektübersicht','Présentation','О проекте'],
['製作室','Studio','制作室','制作室','Gestaltungsraum','Atelier','Мастерская'],
['POETRY VOUCHER / STUDIO','POETRY VOUCHER / STUDIO','诗券 / 制作室','詩の券 / 制作室','POETRY VOUCHER / GESTALTUNG','POETRY VOUCHER / ATELIER','POETRY VOUCHER / МАСТЕРСКАЯ'],
['製作一張詩券','Make a poetry voucher','制作一张诗券','詩の券を作る','Einen Gedichtbon gestalten','Créer un bon poétique','Создать поэтический талон'],
['選詩、排版，帶走一份數位作品。','Choose a poem. Set the type. Take it with you.','选诗、排版，带走一份数字作品。','詩を選び、組んで、持ち帰る。','Gedicht wählen, gestalten, mitnehmen.','Choisir un poème, le composer, l’emporter.','Выберите стихотворение, оформите и сохраните.'],
['內容','Content','内容','内容','Inhalt','Texte','Текст'],
['排版','Typography','排版','組版','Typografie','Typographie','Типографика'],
['校樣','Proof','校样','校正','Vorschau','Épreuve','Проба'],
['帶走作品','Take it with you','带走作品','作品を持ち帰る','Werk mitnehmen','Emporter l’œuvre','Сохранить работу'],
['小票明細與虛構計價','Receipt details & fictional pricing','小票明细与虚构计价','レシート明細と架空の価格','Belegdetails und fiktive Preise','Détail du ticket et prix fictifs','Детали чека и вымышленные цены'],
['現金 · 硬幣支付','Cash · coins','现金 · 硬币支付','現金 · 硬貨払い','Bargeld · Münzen','Espèces · pièces','Наличные · монеты'],
['現金 · 紙幣硬幣混合支付','Cash · notes and coins','现金 · 纸币硬币混合支付','現金 · 紙幣と硬貨','Bargeld · Banknoten und Münzen','Espèces · billets et pièces','Наличные · банкноты и монеты'],
['生成時自動抽取付款場景。','A payment scene is drawn automatically when you generate.','生成时自动抽取付款场景。','生成時に支払い場面を自動抽選します。','Beim Erstellen wird automatisch eine Zahlungsszene ausgelost.','Un scénario de paiement est tiré au sort à la génération.','При создании автоматически выбирается сценарий оплаты.'],
['PAYMENT_NOTE_TEMPLATE','Each generation randomly assigns card, notes, coins or mixed cash; no coins-only scenes above {coinLimit}. Cash always covers the total, with change in circulating denominations. Language changes do not redraw. All transactions are fictional.','每次生成随机安排刷卡、纸币、硬币或混合现金；超过 {coinLimit} 不安排纯硬币。现金足额，找零使用流通面额。切换语言不重抽；全部为虚构交易。','生成ごとにカード・紙幣・硬貨・混合現金を抽選します。{coinLimit} 超は硬貨のみを選びません。現金は足額で、お釣りは流通金種を使います。言語変更では再抽選しません。すべて架空取引です。','Jede Erstellung lost Karte, Banknoten, Münzen oder gemischtes Bargeld aus. Über {coinLimit} gibt es keine reine Münzzahlung. Bargeld reicht immer; Wechselgeld nutzt umlaufende Stückelungen. Sprachwechsel lost nicht neu aus. Alle Zahlungen sind fiktiv.','Chaque génération tire au sort carte, billets, pièces ou espèces mixtes. Pas de pièces seules au-delà de {coinLimit}. Les espèces couvrent le total, avec monnaie courante. Changer de langue ne relance pas le tirage. Toutes les transactions sont fictives.','При каждом создании выбираются карта, банкноты, монеты или смешанные наличные. Свыше {coinLimit} режим только с монетами не используется. Наличных всегда достаточно, сдача — обращающимися номиналами. Смена языка не меняет выбор. Все сделки вымышлены.'],
['虛構交易小票，並非購物憑證','Fictional transaction receipt, not proof of purchase','虚构交易小票，并非购物凭证','架空取引のレシート、購入証明ではありません','Fiktiver Beleg, kein Kaufnachweis','Reçu fictif, sans valeur de preuve d’achat','Вымышленный чек, не подтверждение покупки'],
['現金 · 自動紙幣','Cash · automatic banknotes','现金 · 自动纸币','現金 · 紙幣自動選択','Bargeld · automatische Banknoten','Espèces · billets automatiques','Наличные · автоматический выбор банкнот'],
['刷卡 · 模擬交易','Card · simulated transaction','刷卡 · 模拟交易','カード · 模擬取引','Karte · simulierte Zahlung','Carte · transaction simulée','Карта · имитация оплаты'],
['支付現金','Cash tendered','支付现金','支払い現金','Gezahltes Bargeld','Espèces remises','Внесённые наличные'],
['模擬刷卡，按總額支付；不收集卡號，不發起付款。','Simulated card payment for the exact total. No card details collected and no payment initiated.','模拟刷卡，按总额支付；不收集卡号，不发起付款。','合計額の模擬カード払いです。カード情報の収集や決済は行いません。','Simulierte Kartenzahlung des Gesamtbetrags. Keine Kartendaten und keine echte Zahlung.','Paiement par carte simulé du montant exact. Aucune donnée bancaire collectée ni aucun paiement lancé.','Имитация оплаты картой на точную сумму. Данные карты не собираются, платёж не выполняется.'],
['自選內容','Custom text','自选内容','カスタム本文','Eigener Text','Texte personnalisé','Собственный текст'],
['TARIFF_NOTE_TEMPLATE','{version}: the poem is weighted by characters, non-empty lines and stanzas, then rounded up to the next price ending in {ending}. Punctuation, spaces, title and byline are excluded from character counts. Website typefaces, a published translation or Simplified Chinese script edition, and custom text each add {addOn}. Writing your own or editing an original counts as custom text. The added version has no extra character charge; items sum to the total.','{version}：原文按字数、非空行和分节加权，向上调至最近的 {ending} 结尾价格。标点、空格、题名及署名不计字数。网站字体、已发布译文或简体字版本及自选内容各加 {addOn}；自写或修改原作即属自选内容。附加版本不重复计字费，各商品相加为总价。','{version}：文字数、空白でない行、連で加重計算し、{ending} で終わる次の価格に切り上げます。句読点、空白、題名、署名は文字数に含めません。サイト書体・公開済みの翻訳または簡体字版・カスタム本文は各 +{addOn}。自作や原作の編集はカスタム本文です。追加版の文字料金は重複せず、各商品の和が合計です。','{version}: Zeichen, nicht leere Zeilen und Strophen bestimmen den Preis; aufgerundet wird auf den nächsten Preis mit der Endung {ending}. Satzzeichen, Leerzeichen, Titel und Name zählen nicht als Zeichen. Website-Schriften, Übersetzung oder vereinfachte Schriftzeichen und eigener Text kosten jeweils +{addOn}. Eigene oder bearbeitete Texte gelten als eigener Text. Keine weitere Zeichengebühr für die zusätzliche Fassung; der Gesamtpreis ist die Artikelsumme.','{version} : le prix est pondéré par caractères, lignes non vides et strophes, puis arrondi au prix supérieur se terminant par {ending}. Ponctuation, espaces, titre et signature sont exclus du nombre de caractères. Polices du site, traduction publiée ou version en caractères simplifiés et texte personnalisé ajoutent chacun +{addOn}. Écrire ou modifier une œuvre compte comme texte personnalisé. Aucun second calcul par caractère pour la version ajoutée ; le total est la somme des articles.','{version}: цена зависит от числа символов, непустых строк и строф и округляется вверх до следующей цены с окончанием {ending}. Пунктуация, пробелы, название и подпись не входят в число символов. Шрифты сайта, опубликованный перевод или версия на упрощённом китайском и собственный текст добавляют по +{addOn}. Новый или изменённый текст считается собственным. Дополнительная версия не оплачивается посимвольно повторно; итог — сумма позиций.'],
['詩券字體','Voucher typeface','诗券字体','詩券の書体','Schrift der Lyrikkarte','Police du bon poétique','Шрифт поэтического талона'],
['附加翻譯','Translation add-on','附加翻译','翻訳の追加','Übersetzung','Traduction','Перевод'],
['附加簡體版','Simplified Chinese edition','附加简体版','簡体字版の追加','Ausgabe in vereinfachtem Chinesisch','Version en chinois simplifié','Версия на упрощённом китайском'],
['基本費','Base','基础费','基本料金','Grundpreis','Base','Базовая цена'],
['字元','Characters','字符','文字数','Zeichen','Caractères','Символы'],
['非空行','Non-empty lines','非空行','空白でない行','Nicht leere Zeilen','Lignes non vides','Непустые строки'],
['分節','Stanzas','分节','連','Strophen','Strophes','Строфы'],
['找零','Change','找零','お釣り','Wechselgeld','Monnaie rendue','Сдача'],
['Language','Language','语言','言語','Sprache','Langue','Язык'],
['跳至作品','Skip to the work','跳至作品','作品へ','Zum Werk','Aller à l’œuvre','Перейти к работе'],
['頁面導航','Navigation','页面导航','ナビゲーション','Navigation','Navigation','Навигация'],
['詩券','Poetry slip','诗券','詩の券','Gedichtbon','Bon poétique','Поэтический талон'],
['製作詩券','Poetry voucher','制作诗券','詩券を作る','Gedichtbon','Bon poétique','Поэтический талон'],
['作品編輯器','Poem editor','作品编辑器','詩の編集','Gedichteditor','Éditeur de poème','Редактор стихотворения'],
['從作品開始','Start with a work','从作品开始','作品から始める','Mit einem Werk beginnen','Partir d’une œuvre','Выберите произведение'],
['載入作品…','Loading works…','载入作品…','作品を読み込み中…','Werke werden geladen…','Chargement des œuvres…','Загрузка произведений…'],
['版本','Poem version','版本','詩の版','Gedichtfassung','Version du poème','Версия стихотворения'],
['原文','Original text','原文','原文','Originaltext','Texte original','Оригинал'],
['原文與簡體版','Original + Simplified Chinese edition','原文与简体版','原文＋簡体字版','Original + vereinfachtes Chinesisch','Original + version en chinois simplifié','Оригинал + упрощённый китайский'],
['原文與英譯','Original + English translation','原文与英译','原文＋英訳','Original + englische Übersetzung','Original + traduction anglaise','Оригинал + английский перевод'],
['原文與日譯','Original + Japanese translation','原文与日译','原文＋日本語訳','Original + japanische Übersetzung','Original + traduction japonaise','Оригинал + японский перевод'],
['原文與德譯','Original + German translation','原文与德译','原文＋ドイツ語訳','Original + deutsche Übersetzung','Original + traduction allemande','Оригинал + немецкий перевод'],
['原文與法譯','Original + French translation','原文与法译','原文＋フランス語訳','Original + französische Übersetzung','Original + traduction française','Оригинал + французский перевод'],
['原文與俄譯','Original + Russian translation','原文与俄译','原文＋ロシア語訳','Original + russische Übersetzung','Original + traduction russe','Оригинал + русский перевод'],
['字號 / dots','Type size / dots','字号 / 点','文字サイズ / ドット','Schriftgröße / Punkte','Corps / points','Размер шрифта / точки'],
['題名','Title','题名','題名','Titel','Titre','Название'],
['署名','Byline','署名','署名','Verfasserangabe','Signature','Подпись автора'],
['正文 / 保留分行與分節','Poem / keep line and stanza breaks','正文 / 保留分行与分节','本文 / 改行と連を保持','Gedicht / Zeilen und Strophen beibehalten','Poème / conserver les vers et les strophes','Текст / сохраняйте строки и строфы'],
['標價','Price','标价','価格','Preis','Prix','Цена'],
['現金','Cash tendered','现金','預かり現金','Barzahlung','Espèces remises','Внесено наличными'],
['製作我的詩券','Make my poetry voucher','制作我的诗券','詩券を作る','Meinen Gedichtbon erstellen','Créer mon bon poétique','Создать мой талон'],
['正在載入作品…','Loading works…','正在载入作品…','作品を読み込み中…','Werke werden geladen…','Chargement des œuvres…','Загрузка произведений…'],
['文字只在這個瀏覽器頁面中處理，不上傳、不自動儲存。下載不會讓 H10S 出紙；離開前請保存作品。','Text is processed only in this browser page. It is not uploaded or saved automatically. Downloads do not print on the H10S. Save your work before leaving.','文字只在这个浏览器页面中处理，不上传、不自动保存。下载不会让 H10S 出纸；离开前请保存作品。','文字はこのブラウザー内だけで処理され、送信・自動保存されません。ダウンロードしても H10S は印刷しません。ページを離れる前に保存してください。','Der Text bleibt in dieser Browserseite und wird weder hochgeladen noch automatisch gespeichert. Downloads lösen keinen H10S-Druck aus. Vor dem Verlassen bitte speichern.','Le texte reste dans cette page, sans envoi ni sauvegarde automatique. Le téléchargement ne déclenche pas l’imprimante H10S. Enregistrez avant de quitter.','Текст обрабатывается только на этой странице, без отправки и автосохранения. Скачивание не запускает H10S. Сохраните работу перед уходом.'],
['數位校樣','Digital proof','数字校样','デジタル校正','Digitale Druckvorschau','Épreuve numérique','Цифровая проба'],
['預覽方式','Preview mode','预览方式','プレビュー表示','Vorschaumodus','Mode d’aperçu','Режим просмотра'],
['分開看','Separate pieces','分开看','別々に見る','Getrennt','Séparément','Раздельно'],
['完整紙條','Full strip','完整纸条','紙全体','Gesamter Streifen','Bande entière','Полная лента'],
['讀原文','Read the text','读原文','本文を読む','Text lesen','Lire le texte','Читать текст'],
['01 — RECEIPT / 小票','01 — RECEIPT','01 — 小票','01 — レシート','01 — KASSENBON','01 — TICKET','01 — ЧЕК'],
['02 — VOUCHER / 詩券','02 — POETRY VOUCHER','02 — 诗券','02 — 詩券','02 — GEDICHTBON','02 — BON POÉTIQUE','02 — ПОЭТИЧЕСКИЙ ТАЛОН'],
['RECEIPT + VOUCHER / 連續紙條','RECEIPT + VOUCHER / FULL STRIP','小票 + 诗券 / 连续纸条','レシート + 詩券 / 紙全体','KASSENBON + GEDICHT / GESAMTER STREIFEN','TICKET + BON / BANDE ENTIÈRE','ЧЕК + ТАЛОН / ПОЛНАЯ ЛЕНТА'],
['詩券排版；可切換讀原文取得文字版','Poetry voucher; choose Read the text for an accessible version','诗券排版；可切换读原文查看文字版','詩券のレイアウト。本文表示で文字を読めます','Gedichtbon; Textansicht für barrierefreies Lesen','Bon poétique ; choisir la vue texte pour une lecture accessible','Вёрстка талона; текст доступен в режиме чтения'],
['小票、CUT HERE 分隔及完整詩券','Receipt, CUT HERE separator and complete poetry voucher','小票、CUT HERE 分隔及完整诗券','レシート、切り取り線、詩券全体','Kassenbon, Schnittlinie und vollständiger Gedichtbon','Ticket, ligne de découpe et bon poétique complet','Чек, линия отреза и полный поэтический талон'],
['下載數位作品','Download your edition','下载数字作品','作品をダウンロード','Ausgabe herunterladen','Télécharger l’édition','Скачать экземпляр'],
['詩券 PDF','Voucher PDF','诗券 PDF','詩券 PDF','Gedicht-PDF','Bon PDF','Талон PDF'],
['小票 PDF','Receipt PDF','小票 PDF','レシート PDF','Kassenbon-PDF','Ticket PDF','Чек PDF'],
['完整 PDF','Full PDF','完整 PDF','全体 PDF','Gesamt-PDF','PDF complet','Полный PDF'],
['Back to portfolio','Back to portfolio','返回作品集','ポートフォリオに戻る','Zurück zum Portfolio','Retour au portfolio','Вернуться к портфолио'],
['＋ 寫自己的詩','＋ Write your own','＋ 写自己的诗','＋ 自分の詩を書く','＋ Eigenes Gedicht schreiben','＋ Écrire votre poème','＋ Написать своё'],
['寫下自己的作品。署名留空也可以。','Write your own work. The byline is optional.','写下自己的作品。署名也可留空。','自分の作品を書いてください。署名は空欄でも構いません。','Schreiben Sie Ihr eigenes Werk. Die Verfasserangabe ist optional.','Écrivez votre œuvre. La signature est facultative.','Напишите своё произведение. Подпись необязательна.'],
['內容已改動；點「製作我的詩券」更新校樣。','Edits not yet rendered. Make your voucher to update the proof.','内容已改动；请重新制作以更新校样。','変更は未反映です。詩券を作成して校正を更新してください。','Änderungen noch nicht gesetzt. Erstellen Sie den Bon neu.','Modifications non composées. Créez le bon pour actualiser l’épreuve.','Изменения ещё не свёрстаны. Создайте талон заново.'],
['這份文字超過紙條長度上限，請縮短正文或減小字號。','The strip is too long. Shorten the text or reduce the type size.','文字超过纸条长度上限，请缩短正文或减小字号。','紙の長さの上限を超えました。本文を短くするか文字を小さくしてください。','Der Streifen ist zu lang. Text kürzen oder Schrift verkleinern.','La bande est trop longue. Raccourcissez le texte ou réduisez le corps.','Лента слишком длинная. Сократите текст или уменьшите шрифт.'],
['小票欄位過長。','Receipt field too long.','小票字段过长。','レシートの項目が長すぎます。','Kassenbonfeld zu lang.','Champ du ticket trop long.','Слишком длинное поле чека.'],
['不支援的小票字元。','Unsupported receipt character.','不支持的小票字符。','対応していないレシート文字です。','Nicht unterstütztes Zeichen im Bon.','Caractère non pris en charge sur le ticket.','Неподдерживаемый символ чека.'],
['在此裝置排版中…','Typesetting on this device…','正在此设备排版…','この端末で組版中…','Satz auf diesem Gerät…','Composition sur cet appareil…','Вёрстка на этом устройстве…'],
['請填寫題名和正文。','Please enter a title and poem.','请填写题名和正文。','題名と本文を入力してください。','Bitte Titel und Gedicht eingeben.','Saisissez un titre et un poème.','Введите название и текст.'],
['文字超出長度上限。','Text exceeds the length limit.','文字超出长度上限。','文字数の上限を超えています。','Text überschreitet die Längenbegrenzung.','Le texte dépasse la longueur autorisée.','Текст превышает допустимую длину.'],
['文字包含不支援的控制字元。','Text contains unsupported control characters.','文字包含不支持的控制字符。','未対応の制御文字が含まれています。','Text enthält nicht unterstützte Steuerzeichen.','Le texte contient des caractères de contrôle non pris en charge.','Текст содержит неподдерживаемые управляющие символы.'],
['題名與署名請使用單行。','Keep the title and byline on one line each.','题名与署名请使用单行。','題名と署名は各一行にしてください。','Titel und Verfasserangabe müssen jeweils einzeilig sein.','Le titre et la signature doivent chacun tenir sur une ligne.','Название и подпись должны быть однострочными.'],
['現金不能低於標價。','Cash tendered cannot be less than the price.','现金不能低于标价。','預かり金は価格以上にしてください。','Die Barzahlung darf nicht unter dem Preis liegen.','Les espèces remises ne peuvent être inférieures au prix.','Внесённая сумма не может быть ниже цены.'],
['不支援的字號。','Unsupported type size.','不支持的字号。','対応していない文字サイズです。','Nicht unterstützte Schriftgröße.','Corps non pris en charge.','Неподдерживаемый размер шрифта.'],
['排版時內容已改動，請再製作一次。','The text changed during typesetting. Please generate again.','排版时内容已改动，请重新制作。','組版中に内容が変更されました。もう一度作成してください。','Text während des Satzes geändert. Bitte erneut erstellen.','Le texte a changé pendant la composition. Recommencez.','Текст изменился во время вёрстки. Создайте заново.'],
['詩券已生成，可下載。沒有上傳文字，也沒有發出打印任務。','Your voucher is ready. No text was uploaded and no print job was sent.','诗券已生成，可下载。没有上传文字，也没有发出打印任务。','詩券ができました。文字の送信や印刷指示は行っていません。','Ihr Bon ist fertig. Kein Text wurde hochgeladen, kein Druckauftrag gesendet.','Votre bon est prêt. Aucun texte envoyé, aucune impression lancée.','Талон готов. Текст не отправлялся, задание печати не создавалось.'],
['作品目錄暫時無法載入，請重新整理。','The catalogue could not be loaded. Please reload.','作品目录暂时无法载入，请刷新。','作品一覧を読み込めません。再読み込みしてください。','Katalog konnte nicht geladen werden. Bitte neu laden.','Impossible de charger le catalogue. Actualisez la page.','Не удалось загрузить каталог. Обновите страницу.'],
['AUTHOR EDITION','AUTHOR EDITION','作者版本','作者版','AUTORENAUSGABE','ÉDITION DE L’AUTEUR','АВТОРСКАЯ ВЕРСИЯ'],
['READER EDITION','READER EDITION','访客版本','読者版','LESERAUSGABE','ÉDITION DU LECTEUR','ЧИТАТЕЛЬСКАЯ ВЕРСИЯ'],
['DIGITAL PROOF','DIGITAL PROOF','数字校样','デジタル校正','DIGITALE DRUCKVORSCHAU','ÉPREUVE NUMÉRIQUE','ЦИФРОВАЯ ПРОБА'],
['約','Approx.','约','約','Ca.','Env.','Около'],
['原站作品','Original publication','原站作品','原掲載ページ','Originalveröffentlichung','Publication originale','Оригинальная публикация'],
['MADE IN YOUR BROWSER · NO REMOTE PRINTING','MADE IN YOUR BROWSER · NO REMOTE PRINTING','浏览器本地生成 · 不远程打印','ブラウザー内で作成 · 遠隔印刷なし','LOKAL IM BROWSER · KEIN FERNDRUCK','CRÉATION LOCALE · AUCUNE IMPRESSION À DISTANCE','СОЗДАНИЕ В БРАУЗЕРЕ · БЕЗ УДАЛЁННОЙ ПЕЧАТИ'],
["閱讀選項","Reading options","阅读选项","読みやすさ","Lesen","Lecture","Чтение"],
["閱讀偏好","Reading preferences","阅读偏好","読みやすさの設定","Leseeinstellungen","Préférences de lecture","Настройки чтения"],
["調整本站的閱讀顯示。設定只會儲存在此裝置。","Adjust this site for easier reading. Settings stay on this device.","调整本站的阅读样式。设置仅保存在此设备。","読みやすい表示に調整できます。設定はこの端末にだけ保存されます。","Darstellung für leichteres Lesen anpassen. Einstellungen werden nur auf diesem Gerät gespeichert.","Ajustez l’affichage pour faciliter la lecture. Les réglages restent sur cet appareil.","Настройте отображение для более удобного чтения. Параметры сохраняются только на этом устройстве."],
["使用無襯線字體","Use sans-serif text","使用无衬线字体","ゴシック体（サンセリフ）を使う","Serifenlose Schrift","Police sans empattement","Шрифт без засечек"],
["放大文字","Larger text","放大文字","文字を大きくする","Größere Schrift","Texte plus grand","Увеличить текст"],
["增加文字間距","More text spacing","增加文字间距","文字間隔を広げる","Mehr Textabstand","Espacement du texte accru","Увеличить интервалы"],
["縮短行寬","Narrower text columns","缩短行宽","行幅を短くする","Schmalere Textspalten","Colonnes de texte plus étroites","Сузить текстовые колонки"],
["簡化為單欄版面","Simpler one-column layout","切换为单栏布局","1列のシンプルなレイアウト","Einfaches einspaltiges Layout","Mise en page simplifiée sur une colonne","Упрощённая одноколоночная вёрстка"],
["減少動態效果","Reduce motion","减少动态效果","動きを減らす","Bewegung reduzieren","Réduire les animations","Сократить анимацию"],
["提高對比度","Higher contrast","提高对比度","コントラストを上げる","Höherer Kontrast","Contraste renforcé","Повысить контраст"],
["重設","Reset","重置","リセット","Zurücksetzen","Réinitialiser","Сбросить"],
];
// Original English headings also receive Chinese labels, rather than mixed UI.
const traditionalOverrides={
  'Back to portfolio':'返回作品集',
  'AUTHOR EDITION':'作者版本',
  'READER EDITION':'訪客版本',
  'DIGITAL PROOF':'數位校樣',
  'MADE IN YOUR BROWSER · NO REMOTE PRINTING':'瀏覽器本地生成 · 不遠程打印',
  'TYPEFACE_NOTE_TEMPLATE':'各語言的點陣字體均預設包含，使用 {bitmapSizes} 點整倍字形。網站字體 +{addOn}，包含 EB Garamond 與網站的中日文字體，提供 {siteSizes} 點。附加已發表譯文或簡體字版本 +{addOn}，僅提供已有對應版本的作品。',
  'TARIFF_NOTE_TEMPLATE':'{version}：原文按字數、非空行和分節加權，向上調至最近的 {ending} 結尾價格。標點、空格、題名及署名不計字數。網站字體、已發表譯文或簡體字版本及自選內容各加 {addOn}；自寫或修改原作即屬自選內容。附加版本不重複計字費，各商品相加為總價。',
  'PAYMENT_NOTE_TEMPLATE':'每次生成隨機安排刷卡、紙幣、硬幣或混合現金；超過 {coinLimit} 不安排純硬幣。現金足額，找零使用流通面額。切換語言不重抽；全部為虛構交易。'
};
const localeMap=new Map(localeRows.map(row=>[row[0],row]));
traditionalOverrides.Language='語言';
const portfolioLinks=[...document.querySelectorAll('a[href="https://hanpuli.github.io/"]')];
const portfolioWorkLinks=[...document.querySelectorAll('[data-portfolio-link]')];
function normaliseLocale(value){
  if(!value)return null;value=value.toLowerCase();
  if(['zh','zh-hant','zh-hant-hk','zh-tw','zh-hk'].includes(value))return 'zh-Hant';
  if(['zh-hans','zh-cn','zh-sg','zh-hans-cn'].includes(value))return 'zh-Hans';
  return ['en','ja','de','fr','ru'].find(lang=>value===lang||value.startsWith(lang+'-'))||null;
}
let uiLocale=normaliseLocale(new URL(location.href).searchParams.get('lang'))||(document.body.classList.contains('shop-page')?normaliseLocale(navigator.language):null)||normaliseLocale(document.documentElement.dataset.defaultLocale)||normaliseLocale(navigator.language)||'en';
const staticBindings=[];
const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(walker.nextNode()){
  const node=walker.currentNode,key=node.nodeValue.trim();
  if(node.parentElement?.closest('script,style,#ui-locale'))continue;
  if(localeMap.has(key))staticBindings.push({node,key,prefix:node.nodeValue.match(/^\s*/)[0],suffix:node.nodeValue.match(/\s*$/)[0]});
}
const attributeBindings=[];
document.querySelectorAll('[aria-label],[alt]').forEach(node=>{
  if(node.closest('#ui-locale'))return;
  for(const attr of ['aria-label','alt']){const key=node.getAttribute(attr);if(localeMap.has(key))attributeBindings.push({node,attr,key});}
});
function tr(key){return uiLocale==='zh-Hant'&&traditionalOverrides[key]||localeMap.get(key)?.[localeNames.indexOf(uiLocale)]||key;}
const localeNav=document.getElementById('ui-locale');
function applyLocale(){
  const htmlLang={'en':'en-GB','zh-Hant':'zh-Hant-HK','zh-Hans':'zh-Hans','ja':'ja','de':'de','fr':'fr','ru':'ru'}[uiLocale];
  document.documentElement.lang=htmlLang;
  document.documentElement.dataset.uiLocale=uiLocale;
  localeNav.querySelectorAll('[data-locale]').forEach(link=>{
    const current=link.dataset.locale===uiLocale;
    link.classList.toggle('current',current);
    if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  staticBindings.forEach(({node,key,prefix,suffix})=>node.nodeValue=prefix+tr(key)+suffix);
  attributeBindings.forEach(({node,attr,key})=>node.setAttribute(attr,tr(key)));
  document.title=tr('製作室')+' · Poetry Voucher · Hanpu Li';
  document.querySelector('meta[name="description"]').content=tr('製作詩券')+' · Hanpu Li · '+tr('MADE IN YOUR BROWSER · NO REMOTE PRINTING');
  const route={'en':'','zh-Hant':'zh/','zh-Hans':'zh-hans/','ja':'ja/','de':'de/','fr':'fr/','ru':'ru/'}[uiLocale];
  portfolioLinks.forEach(link=>link.href='https://hanpuli.github.io/'+route);
  portfolioWorkLinks.forEach(link=>link.href='https://hanpuli.github.io/'+route+'#work');
  document.querySelectorAll('[data-shop-link]').forEach(link=>link.href='/poetry-voucher/shop.html?lang='+uiLocale);
  document.querySelectorAll('[data-project-link]').forEach(link=>link.href='/'+route+'poetry-voucher/');
}
localeNav.addEventListener('click',event=>{
  const link=event.target.closest('[data-locale]');
  if(!link)return;
  event.preventDefault();
  const next=normaliseLocale(link.dataset.locale);
  if(!next||next===uiLocale)return;
  uiLocale=next;applyLocale();
  const url=new URL(location.href);url.searchParams.set('lang',uiLocale);history.replaceState(null,'',url);
  document.dispatchEvent(new Event('presslocalechange'));
});
applyLocale();
