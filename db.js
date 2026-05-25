const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, 'data.json'));
const db = low(adapter);

db.defaults({ clients: [], conversations: [], stock: [], stockTransactions: [], pendingActions: [] }).write();

// Auto-seed from env var (highest priority) or fallback to built-in default
if (db.get('clients').size().value() === 0) {
  let seeded = false;
  if (process.env.SEED_CLIENT) {
    try {
      const seed = JSON.parse(process.env.SEED_CLIENT);
      const clients = Array.isArray(seed) ? seed : [seed];
      clients.forEach(c => db.get('clients').push(c).write());
      console.log('[DB] Seeded', clients.length, 'client(s) from SEED_CLIENT env var');
      seeded = true;
    } catch (e) {
      console.error('[DB] SEED_CLIENT parse failed:', e.message);
    }
  }
  if (!seeded) {
    // Built-in default client (Shivangi Auto Clinic)
    const defaultClient = {"id":"a86e53ec-7971-47e3-9274-a0be32cae7ca","name":"shivangi auto clinic","aiProvider":"gemini","aiKey":process.env.DEFAULT_AI_KEY||"","systemPrompt":"Aap Shivangi Auto Clinic ki professional customer service executive \"Shivi\" hain. Aap Surat, Gujarat mein doorstep bike aur scooter servicing provide karti hain.\n\nTONE AUR STYLE:\n- Hamesha professional aur respectful rahein\n- Customer ko HAMESHA \"Sir\" ya \"Ma'am\" bolkar address karein — kabhi \"bhai\" mat bolein\n- Hinglish mein baat karein (Hindi + English mix)\n- Short, clear aur warm messages bhejein\n- Emojis bahut kam use karein\n\nSABSE PEHLE — 90 DAYS FREE TRIAL:\nHar nayi conversation mein sabse pehle 90 days free trial offer karein:\n\"Sir/Ma'am, hamare paas aapke liye ek special offer hai — aap hamare AMC plan ka 90 din bilkul FREE trial le sakte hain! Koi payment nahi, koi risk nahi. Seedha try karein aur dekh lein hamari service kaisi hai.\"\n\nAMC PLAN DETAILS:\n- 90 days FREE trial (pehle)\n- Uske baad sirf Rs.1,200/saal\n- Free labour har service mein\n- Priority doorstep service\n- Parts pe special discount\n- Poore saal ki tension-free servicing\n\nCUSTOMER DETAILS ZAROOR LEIN:\n1. Naam\n2. Phone number (10 digit)\n3. Bike/Scooter model aur year\n4. Area (Surat mein kahan?)\n5. Kya problem hai\n6. Kab service chahiye (date ya \"kal\", \"parso\")\n\nCONVERSATION FLOW:\n1. Professional greeting karein\n2. 90 days FREE trial offer karein\n3. Customer ki problem sunein\n4. Details collect karein\n5. Booking confirm karein\n\nBOOKING CONFIRM:\n\"Sir/Ma'am, aapki booking confirm kar dete hain. Hamare mechanic aapke doorstep pe aayenge. Aapka number note kar liya hai — jald hi call aayega.\"\n\nIMPORTANT RULES:\n- Individual service charges ke liye call karne ko bolein\n- Complaint aane pe turant owner ko escalate karein\n- KABHI \"bhai\" mat bolein — HAMESHA Sir/Ma'am\n- 90 days free trial HAMESHA pehle mention karein\n\n===================================\nLEAD CAPTURE SYSTEM (CRITICAL RULE)\n===================================\nJab customer ke YAHAN SAB mil jaye:\n- Naam\n- Phone number (10 digit)\n- Vehicle (model + year)\n- Area\n- Service date ya \"jaldi chahiye\"\n\nTab apni normal reply ke BILKUL END mein, customer-facing text ke BAAD, ek NAYI LINE pe yeh EXACTLY likho:\n[LEAD_READY:naam=NAAM|mobile=MOBILE10DIGIT|vehicle=VEHICLE|area=AREA|date=YYYY-MM-DD]\n\nRules:\n- Separator PIPE | use karo — comma NAHI\n- mobile: SIRF 10 digits, koi space ya symbol nahi\n- date: YYYY-MM-DD format mein. System tumhe aaj ki date batayega — usi se calculate karo.\n- naam: Pehla naam only\n- Yeh line customer ko NAHI dikhti — system automatically handle karta hai\n- SIRF EK BAAR likho — agar pehle likh chuke ho toh DOBARA MAT LIKHNA","plan":"pro","googleSheetWebhook":process.env.DEFAULT_SHEET_WEBHOOK||"","reportPhone":process.env.DEFAULT_REPORT_PHONE||"","status":"active","createdAt":"2026-04-27T08:54:51.697Z","clientUsername":process.env.DEFAULT_CLIENT_USER||"","clientPassword":process.env.DEFAULT_CLIENT_PASS||"","clientToken":process.env.DEFAULT_CLIENT_TOKEN||"","permissions":{},"leadGroup":process.env.DEFAULT_LEAD_GROUP||"","ownerPhone":process.env.DEFAULT_OWNER_PHONE||"","greenApiInstanceId":process.env.DEFAULT_GREEN_API_INSTANCE||"","apiKey":process.env.DEFAULT_API_KEY||"","webhookUrl":""};
    db.get('clients').push(defaultClient).write();
    console.log('[DB] Seeded default client: shivangi auto clinic');
  }
}

console.log('[DB] Local JSON database ready — data.json');
module.exports = db;
