<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Ma Maison Review Management Dashboard</title>
<script
src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script
src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script
src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script
src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
<script
src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script>
tailwind.config = {
theme: {
extend: {
colors: {
ivory: '#FBF8F1',
panel: '#FFFFFF',
charcoal: '#2E2A25',
charcoalsoft: '#5B554D',
gold: '#B08D57',
goldsoft: '#EFE6D6',
border: '#E7E1D6',
good: '#4F7A5B',
amber: '#C98A2B',
danger: '#B4483C',
},
fontFamily: {
sans: ['Inter', 'Noto Sans', 'Noto Sans JP', 'Noto Sans SC',
'system-ui', 'sans-serif'],
},
},
},
};
</script>
<style>
html, body { background:#FBF8F1; }
::-webkit-scrollbar { height:10px; width:10px; }
::-webkit-scrollbar-thumb { background:#DDD5C6; border-radius:6px; }
.clamp2 { display:-webkit-box; -webkit-line-clamp:2;
-webkit-box-orient:vertical; overflow:hidden; }
.sticky-col { position:sticky; background:inherit; z-index:2; }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
const { useState, useEffect, useMemo, useRef, useCallback } = React;
/* ============================================================
CONSTANTS
============================================================ */
const LS_KEY = "ma_maison_reviews_v1";
const CATEGORIES = ["Services", "Food Standard", "Food Quality",
"Cleanliness", "Price", "Others"];
const SEVERITIES = ["Low", "Low-Medium", "Medium", "High", "Critical"];
const CONFIDENCE = ["Low", "Low-Medium", "Medium", "High", "Critical"];
const RESPONSIBLES = ["Outlet Manager","Kitchen Manager","Front-of-House
Manager","Area
Manager","Operations","HR","Finance","Marketing","Management","Requires
Assignment"];
const SALES_RECOVERY = ["No Recovery Required","Contact
Customer","Apology Only","Replacement Meal","Voucher","Refund
Review","Management Follow-up","Requires Approval","Completed"];
const STATUSES = ["Not Started","In Progress","Pending
Verification","Completed","Requires Confirmation","Closed"];
const REPLY_STATUSES = ["No Reply","Draft — Not Yet
Published","Published"];
const SENTIMENTS = ["Positive","Neutral","Negative"];
const OPEN_STATUSES = ["Not Started","In Progress","Pending
Verification","Requires Confirmation"];
const DONE_STATUSES = ["Completed","Closed"];
// Canonical field keys and header aliases for auto-mapping
const FIELD_DEFS = [
{ key:"reviewID", label:"Review ID", aliases:["review
id","reviewid","id","review_id"] },
{ key:"outlet", label:"Outlet", required:true,
aliases:["outlet","branch","location","store","shop"] },
{ key:"reviewer", label:"Reviewer", required:true,
aliases:["reviewer","reviewer name","customer","name","author"] },
{ key:"reviewDate", label:"Review Date", required:true, aliases:["review
date","date","review_date","datetime","created"] },
{ key:"rating", label:"Rating", required:true, aliases:["rating","star
rating","stars","score","star"] },
{ key:"originalReview", label:"Original Review", required:true,
aliases:["original review","review comment","full
review","review","comment","review text","content","text"] },
{ key:"originalLanguage", label:"Original Language", aliases:["original
language","language","lang"] },
{ key:"englishTranslation", label:"English Translation",
aliases:["english translation","translation","translated","english"] },
{ key:"existingReply", label:"Existing Management Reply",
aliases:["existing management reply","management reply","owner
reply","reply","response","business reply"] },
{ key:"draftedReply", label:"Drafted Reply", aliases:["drafted
reply","draft reply","draft"] },
{ key:"replyStatus", label:"Reply Status", aliases:["reply status"] },
{ key:"sentiment", label:"Sentiment", aliases:["sentiment"] },
{ key:"category", label:"Category", aliases:["category","complaint
category","issue category"] },
{ key:"severity", label:"Severity", aliases:["severity","priority"] },
{ key:"possibleRootCause", label:"Possible Root Cause",
aliases:["possible root cause","root cause"] },
{ key:"rootCauseConfidence", label:"Root Cause Confidence",
aliases:["root cause confidence","confidence"] },
{ key:"responsible", label:"Responsible",
aliases:["responsible","responsible person","department","owner
department","assigned"] },
{ key:"salesRecovery", label:"Sales Recovery", aliases:["sales
recovery","recovery","service recovery"] },
{ key:"actionPlan", label:"Action Plan", aliases:["action
plan","action","plan"] },
{ key:"recommendedTimeline", label:"Recommended Timeline",
aliases:["recommended timeline","timeline","target date","due"] },
{ key:"status", label:"Status", aliases:["status","action status"] },
{ key:"managementNotes", label:"Management Notes", aliases:["management
notes","notes","remarks"] },
{ key:"lastUpdated", label:"Last Updated", aliases:["last
updated","updated","modified"] },
{ key:"concernReview", label:"Concern Review", aliases:["concern
review","concern","is concern","flag"] },
];
const FIELD_KEYS = FIELD_DEFS.map(f=>f.key);
const REQUIRED_KEYS = FIELD_DEFS.filter(f=>f.required).map(f=>f.key);
// Fields management may edit (originals stay locked)
const EDITABLE_KEYS =
["draftedReply","replyStatus","category","severity","possibleRootCause","rootCauseConfidence","responsible","salesRecovery","actionPlan","recommendedTimeline","status","managementNotes","concernReview","sentiment","englishTranslation"];
/* ============================================================
HELPERS
============================================================ */
const norm = (s) =>
(s==null?"":String(s)).trim().toLowerCase().replace(/[_\-]+/g,"
").replace(/\s+/g," ");
function guessMapping(headers) {
const map = {};
const used = new Set();
FIELD_DEFS.forEach(f => {
const hit = headers.find(h => {
const nh = norm(h);
return !used.has(h) && (nh === norm(f.label) || f.aliases.includes(nh));
});
if (hit) { map[f.key] = hit; used.add(hit); }
else map[f.key] = "";
});
return map;
}
function parseDateISO(v) {
if (v==null || v==="") return "";
const s = String(v).trim();
// already ISO
let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
// dd/mm/yyyy or mm/dd/yyyy — assume dd/mm/yyyy if first > 12
m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
if (m) {
let a=+m[1], b=+m[2], y=+m[3]; if (y<100) y+=2000;
let day=a, mon=b; if (a>12 && b<=12){day=a;mon=b;} else if
(b>12){day=b;mon=a;}
return `${y}-${pad(mon)}-${pad(day)}`;
}
const d = new Date(s);
if (!isNaN(d)) return
`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
return "";
}
const pad = (n)=>String(n).padStart(2,"0");
const monthKey = (iso)=> iso ? iso.slice(0,7) : "";
const yearOf = (iso)=> iso ? iso.slice(0,4) : "";
const todayISO = ()=> { const d=new Date(); return
`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
function detectLanguage(text) {
if (!text) return "";
if (/[぀-ゟ゠-ヿ]/.test(text)) return "Japanese";
if (/[가-힯]/.test(text)) return "Korean";
if (/[一-鿿]/.test(text)) return "Chinese";
if (/[฀-๿]/.test(text)) return "Thai";
return "English";
}
const isEnglish = (rec)=> {
const lang = (rec.originalLanguage||"").toLowerCase();
if (lang) return lang.startsWith("en");
return detectLanguage(rec.originalReview) === "English";
};
function ratingNum(v){ const n=parseFloat(v); return isNaN(n)?null:n; }
// Concern logic: honor uploaded flag; otherwise rating<=2 or
High/Critical severity.
function computeConcern(rec) {
const flag = norm(rec.concernReview);
if (["yes","y","true","1"].includes(flag)) return true;
if (["no","n","false","0"].includes(flag)) return false;
const r = ratingNum(rec.rating);
if (r!=null && r<=2) return true;
if (["High","Critical"].includes(rec.severity)) return true;
return false;
}
function stableId(rec, idx) {
if (rec.reviewID) return String(rec.reviewID);
const basis = [rec.outlet, rec.reviewer, rec.reviewDate, rec.rating,
rec.originalReview].join("|");
let h = 5381;
for (let i=0;i<basis.length;i++){ h = ((h<<5)+h) ^ basis.charCodeAt(i);
}
return "R" + (h>>>0).toString(36).toUpperCase();
}
const dupKey = (rec)=>
[norm(rec.outlet),norm(rec.reviewer),parseDateISO(rec.reviewDate),ratingNum(rec.rating),norm(rec.originalReview)].join("~");
function blankRecord(){ const o={}; FIELD_KEYS.forEach(k=>o[k]="");
return o; }
// Build a canonical record from a raw row + mapping; keep original
fields
function buildRecord(row, mapping) {
const rec = blankRecord();
FIELD_KEYS.forEach(k => {
const src = mapping[k];
if (src && row[src]!=null) rec[k] = String(row[src]);
});
rec.reviewDate = parseDateISO(rec.reviewDate);
if (!rec.originalLanguage) rec.originalLanguage =
detectLanguage(rec.originalReview);
rec.reviewID = stableId(rec);
rec._orig = {...row}; // preserve every original uploaded field exactly
return rec;
}
function severityRank(s){ return Math.max(0, SEVERITIES.indexOf(s)); }
function overdue(rec){
if (!rec.recommendedTimeline) return false;
const iso = parseDateISO(rec.recommendedTimeline);
if (!iso) return false;
if (DONE_STATUSES.includes(rec.status)) return false;
return iso < todayISO();
}
const hasReply = (rec)=> !!(rec.existingReply &&
rec.existingReply.trim());
const hasAnyReply = (rec)=> hasReply(rec) || !!(rec.draftedReply &&
rec.draftedReply.trim());
/* ============================================================
CSV EXPORT (UTF-8 + BOM)
============================================================ */
function exportCSV(records, filename) {
const exportedAt = new Date().toISOString();
// union of original fields + canonical fields
const origCols = [];
records.forEach(r => Object.keys(r._orig||{}).forEach(c => {
if(!origCols.includes(c)) origCols.push(c); }));
const canonCols = FIELD_DEFS.map(f=>f.label);
const rows = records.map(r => {
const o = {};
origCols.forEach(c => o["Original: "+c] = (r._orig||{})[c] ?? "");
FIELD_DEFS.forEach(f => {
let v = r[f.key] ?? "";
if (f.key==="reviewDate" || f.key==="lastUpdated") v = v ?
parseDateISO(v) : v;
o[f.label] = v;
});
o["Concern Review (Computed)"] = computeConcern(r) ? "Yes":"No";
o["Exported At"] = exportedAt;
return o;
});
const csv = Papa.unparse(rows, { quotes:true });
const blob = new Blob(["﻿"+csv], { type:"text/csv;charset=utf-8;" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url; a.download = filename; a.click();
setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function downloadText(text, filename, mime="text/plain;charset=utf-8;")
{
const blob = new Blob(["﻿"+text], { type:mime });
const url = URL.createObjectURL(blob);
const a = document.createElement("a"); a.href=url; a.download=filename;
a.click();
setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/* ============================================================
SMALL UI PRIMITIVES
============================================================ */
function Badge({children, tone="neutral", title}) {
const tones = {
neutral:"bg-goldsoft text-charcoal border-border",
good:"bg-good/10 text-good border-good/30",
amber:"bg-amber/10 text-amber border-amber/30",
danger:"bg-danger/10 text-danger border-danger/30",
gold:"bg-gold/10 text-gold border-gold/30",
};
return <span title={title} className={`inline-block text-[11px]
font-medium px-2 py-0.5 rounded-full border
${tones[tone]||tones.neutral}`}>{children}</span>;
}
function confTone(v){
return
{"Low":"good","Low-Medium":"amber","Medium":"amber","High":"danger","Critical":"danger"}[v]
|| "neutral";
}
function sevTone(v){
return
{"Low":"good","Low-Medium":"amber","Medium":"amber","High":"danger","Critical":"danger"}[v]
|| "neutral";
}
function statusTone(v){
if (DONE_STATUSES.includes(v)) return "good";
if (v==="In Progress"||v==="Pending Verification") return "amber";
if (v==="Requires Confirmation") return "danger";
return "neutral";
}
function Tooltip({label, children}) {
return (
<span className="relative group inline-flex items-center">
{children}
<span className="pointer-events-none absolute left-1/2 -translate-x-1/2
bottom-full mb-1 hidden group-hover:block z-50 w-60 text-[11px]
leading-snug bg-charcoal text-ivory rounded-md px-2 py-1.5 shadow-lg">
{label}
</span>
</span>
);
}
const Info = ({label}) => (
<Tooltip label={label}><span className="ml-1 w-4 h-4 inline-flex
items-center justify-center rounded-full border border-border
text-[10px] text-charcoalsoft cursor-help">i</span></Tooltip>
);
function Card({title, value, sub, tone}) {
const vcol =
tone==="danger"?"text-danger":tone==="amber"?"text-amber":tone==="good"?"text-good":"text-charcoal";
return (
<div className="bg-panel border border-border rounded-xl p-4">
<div className="text-[12px] text-charcoalsoft font-medium flex
items-center">{title}</div>
<div className={`text-2xl font-semibold mt-1 ${vcol}`}>{value}</div>
{sub && <div className="text-[11px] text-charcoalsoft
mt-0.5">{sub}</div>}
</div>
);
}
function Select({value, onChange, options, placeholder, className=""}) {
return (
<select value={value||""} onChange={e=>onChange(e.target.value)}
className={`text-[13px] border border-border rounded-lg px-2 py-1.5
bg-panel text-charcoal focus:outline-none focus:ring-2
focus:ring-gold/40 ${className}`}>
{placeholder!==undefined && <option value="">{placeholder}</option>}
{options.map(o => <option key={o} value={o}>{o}</option>)}
</select>
);
}
/* ============================================================
CHART wrapper
============================================================ */
function ChartBox({type, data, options, height=220, empty}) {
const ref = useRef(null);
const inst = useRef(null);
useEffect(()=>{
if (!ref.current) return;
if (inst.current) { inst.current.destroy(); inst.current=null; }
if (empty) return;
inst.current = new Chart(ref.current, { type, data, options:{
responsive:true, maintainAspectRatio:false,
plugins:{ legend:{ labels:{ color:"#5B554D", font:{size:11} } } },
scales: options?.scales, ...options,
}});
return ()=>{ if(inst.current){inst.current.destroy();
inst.current=null;} };
});
if (empty) return <div style={{height}} className="flex items-center
justify-center text-[12px] text-charcoalsoft border border-dashed
border-border rounded-lg">No data for current filters.</div>;
return <div style={{height}}><canvas ref={ref}></canvas></div>;
}
const PALETTE =
["#B08D57","#4F7A5B","#C98A2B","#7A6A8A","#5B7A8A","#B4483C","#8A7A5B","#6A8A7A"];
/* ============================================================
MAIN APP
============================================================ */
function App() {
const [records, setRecords] = useState([]);
const [tab, setTab] = useState("overview");
const [importState, setImportState] = useState(null); // {files,
headers, mapping, rows, report}
const [confirmClear, setConfirmClear] = useState(false);
const [toast, setToast] = useState("");
// filters
const emptyFilters = { outlet:"", month:"", year:"", rating:"",
category:"", severity:"", responsible:"", status:"", search:"" };
const [filters, setFilters] = useState(emptyFilters);
const [sort, setSort] = useState("date_desc");
// load from localStorage
useEffect(()=>{
try {
const raw = localStorage.getItem(LS_KEY);
if (raw) { const arr = JSON.parse(raw); if
(Array.isArray(arr)&&arr.length){ setRecords(arr); } }
} catch(e){}
}, []);
// persist
useEffect(()=>{
try { localStorage.setItem(LS_KEY, JSON.stringify(records)); }
catch(e){}
}, [records]);
const showToast = (m)=>{ setToast(m); setTimeout(()=>setToast(""),
2600); };
const updateRecord = useCallback((id, patch)=>{
setRecords(prev => prev.map(r => r.reviewID===id ? {...r, ...patch,
lastUpdated: todayISO()} : r));
}, []);
const bulkUpdate = useCallback((ids, patch)=>{
const set = new Set(ids);
setRecords(prev => prev.map(r => set.has(r.reviewID) ? {...r, ...patch,
lastUpdated: todayISO()} : r));
}, []);
/* ---------- FILTERING ---------- */
const filtered = useMemo(()=>{
let list = records.filter(r=>{
if (filters.outlet && r.outlet!==filters.outlet) return false;
if (filters.month && monthKey(r.reviewDate)!==filters.month) return
false;
if (filters.year && yearOf(r.reviewDate)!==filters.year) return false;
if (filters.rating &&
String(Math.floor(ratingNum(r.rating)||0))!==filters.rating) return
false;
if (filters.category && r.category!==filters.category) return false;
if (filters.severity && r.severity!==filters.severity) return false;
if (filters.responsible && r.responsible!==filters.responsible) return
false;
if (filters.status && r.status!==filters.status) return false;
if (filters.search) {
const q = filters.search.toLowerCase();
const blob =
[r.reviewer,r.originalReview,r.englishTranslation,r.existingReply,r.draftedReply,r.actionPlan,r.managementNotes].join("
").toLowerCase();
if (!blob.includes(q)) return false;
}
return true;
});
const cmp = {
date_desc:(a,b)=> (b.reviewDate||"").localeCompare(a.reviewDate||""),
date_asc:(a,b)=> (a.reviewDate||"").localeCompare(b.reviewDate||""),
outlet:(a,b)=> (a.outlet||"").localeCompare(b.outlet||""),
month:(a,b)=> (a.reviewDate||"").localeCompare(b.reviewDate||""),
rating_desc:(a,b)=> (ratingNum(b.rating)||0)-(ratingNum(a.rating)||0),
rating_asc:(a,b)=> (ratingNum(a.rating)||0)-(ratingNum(b.rating)||0),
severity:(a,b)=> severityRank(b.severity)-severityRank(a.severity),
status:(a,b)=> STATUSES.indexOf(a.status)-STATUSES.indexOf(b.status),
};
list.sort(cmp[sort]||cmp.date_desc);
return list;
}, [records, filters, sort]);
const activeFilterCount =
Object.entries(filters).filter(([k,v])=>v!=="").length;
const outlets = useMemo(()=>[...new
Set(records.map(r=>r.outlet).filter(Boolean))].sort(), [records]);
const months = useMemo(()=>[...new
Set(records.map(r=>monthKey(r.reviewDate)).filter(Boolean))].sort(),
[records]);
const years = useMemo(()=>[...new
Set(records.map(r=>yearOf(r.reviewDate)).filter(Boolean))].sort(),
[records]);
/* ---------- IMPORT PIPELINE ---------- */
const handleFiles = async (fileList) => {
const chosen = Array.from(fileList);
const jsonFiles = chosen.filter(f=>/\.json$/i.test(f.name));
const files = chosen.filter(f=>/\.csv$|\.tsv$|\.txt$/i.test(f.name));
if (jsonFiles.length) {
  const outlet = window.prompt("Enter the outlet name for this JSON file (example: Ma Maison Tonkatsu @ The Gardens):", "")?.trim();
  if (!outlet) { showToast("Outlet name is required for JSON import."); return; }
  try {
    const allRows = [];
    for (const file of jsonFiles) {
      const parsed = JSON.parse(await file.text());
      const reviews = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.reviews) ? parsed.reviews : []);
      reviews.forEach(r => {
        const starMap = {ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5};
        const reply = r.reviewReply?.comment || r.reply?.comment || r.ownerReply || "";
        allRows.push({
          __file:file.name,
          "Review ID":r.reviewId || r.name || "",
          "Outlet":outlet,
          "Reviewer":r.reviewer?.displayName || r.reviewerName || r.author_name || r.author || "Anonymous",
          "Review Date":r.createTime || r.updateTime || r.date || r.time || "",
          "Rating":starMap[r.starRating] || r.starRating || r.rating || r.stars || "",
          "Original Review":r.comment || r.text || r.reviewText || "(No written review)",
          "Existing Management Reply":reply,
          "Reply Status":reply ? "Published" : "No Reply",
          "Last Updated":r.updateTime || ""
        });
      });
    }
    if (!allRows.length) throw new Error("No reviews found");
    const headers = [...new Set(allRows.flatMap(Object.keys))].filter(h=>h!=="__file");
    setImportState({fileNames:jsonFiles.map(f=>f.name),headers,mapping:guessMapping(headers),rows:allRows});
  } catch (err) { showToast("This JSON format could not be read. Please check the file."); }
  return;
}
if (!files.length) { showToast("Please choose JSON or CSV file(s)."); return; }
let pending = files.length;
let allHeaders = [];
let allRows = [];
files.forEach(file=>{
Papa.parse(file, {
header:true, skipEmptyLines:true, encoding:"UTF-8",
complete:(res)=>{
(res.meta.fields||[]).forEach(h=>{ if(!allHeaders.includes(h))
allHeaders.push(h); });
res.data.forEach(row=> allRows.push({__file:file.name, ...row}));
pending--;
if (pending===0) {
const mapping = guessMapping(allHeaders);
setImportState({ fileNames: files.map(f=>f.name), headers: allHeaders,
mapping, rows: allRows });
}
},
error:()=>{ pending--; if(pending===0 && allRows.length){ const
mapping=guessMapping(allHeaders);
setImportState({fileNames:files.map(f=>f.name),headers:allHeaders,mapping,rows:allRows});
} }
});
});
};
// compute validation report for current mapping
const validation = useMemo(()=>{
if (!importState) return null;
const { rows, mapping } = importState;
const existingKeys = new Set(records.map(dupKey));
const seen = new Set();
let valid=[], invalid=[], dupExisting=0, dupWithin=0;
const outletsSet = new Set(); let minD="", maxD="";
rows.forEach((row, i)=>{
const rec = buildRecord(row, mapping);
const missing = REQUIRED_KEYS.filter(k=> !String(rec[k]??"").trim());
const k = dupKey(rec);
if (missing.length) { invalid.push({row:i+1, file:row.__file, missing,
rec}); return; }
if (existingKeys.has(k)) { dupExisting++; return; }
if (seen.has(k)) { dupWithin++; return; }
seen.add(k);
valid.push(rec);
if (rec.outlet) outletsSet.add(rec.outlet);
if (rec.reviewDate){ if(!minD||rec.reviewDate<minD) minD=rec.reviewDate;
if(!maxD||rec.reviewDate>maxD) maxD=rec.reviewDate; }
});
return { total:rows.length, valid, invalid, dupExisting, dupWithin,
outlets:[...outletsSet].sort(), minD, maxD };
}, [importState, records]);
const confirmImport = () => {
if (!validation) return;
setRecords(prev => [...prev, ...validation.valid]);
setImportState(null);
setTab("overview");
showToast(`Imported ${validation.valid.length} review(s).`);
};
const exportErrorReport = () => {
if (!validation) return;
const rows = validation.invalid.map(iv=>({
"Source File":iv.file||"", "Row Number":iv.row,
"Missing Required Fields":
iv.missing.map(k=>FIELD_DEFS.find(f=>f.key===k).label).join("; "),
"Outlet":iv.rec.outlet, "Reviewer":iv.rec.reviewer, "Review
Date":iv.rec.reviewDate,
"Rating":iv.rec.rating, "Original Review":iv.rec.originalReview,
}));
const csv = Papa.unparse(rows.length?rows:[{"Note":"No invalid rows"}],
{quotes:true});
downloadText(csv, "ma_maison_import_errors.csv",
"text/csv;charset=utf-8;");
};
const loadSample = () => { setRecords(prev => [...prev,
...SAMPLE_RECORDS()]); setTab("overview"); showToast("Sample data
loaded."); };
const clearAll = () => { setRecords([]);
localStorage.removeItem(LS_KEY); setConfirmClear(false);
setFilters(emptyFilters); showToast("All data cleared."); };
/* ---------- RENDER ---------- */
const hasData = records.length>0;
return (
<div className="min-h-screen text-charcoal font-sans">
{/* Header */}
<header className="bg-panel border-b border-border sticky top-0 z-30">
<div className="max-w-[1500px] mx-auto px-4 py-3 flex items-center
justify-between gap-3 flex-wrap">
<div className="flex items-center gap-3">
<div className="w-9 h-9 rounded-lg bg-gold/15 border border-gold/30 flex
items-center justify-center text-gold font-semibold">MM</div>
<div>
<h1 className="text-[17px] font-semibold leading-tight">Ma Maison Review
Management Dashboard</h1>
<p className="text-[11px] text-charcoalsoft">Data stays in your browser
— nothing is uploaded or sent externally.</p>
</div>
</div>
{hasData && (
<div className="flex items-center gap-2">
<label className="text-[12px] px-3 py-1.5 rounded-lg border
border-border hover:bg-goldsoft cursor-pointer">
+ Add Data
<input type="file" accept=".json,.csv,.tsv,.txt" multiple className="hidden"
onChange={e=>handleFiles(e.target.files)} />
</label>
<button onClick={()=>setConfirmClear(true)} className="text-[12px] px-3
py-1.5 rounded-lg border border-border text-danger
hover:bg-danger/5">Clear Data</button>
</div>
)}
</div>
{hasData && (
<nav className="max-w-[1500px] mx-auto px-4 flex gap-1">
{[["overview","Overview"],["concern","Concern Reviews"],["all","All
Reviews & Analysis"]].map(([k,l])=>(
<button key={k} onClick={()=>setTab(k)}
className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px
${tab===k?"border-gold text-charcoal":"border-transparent
text-charcoalsoft hover:text-charcoal"}`}>{l}</button>
))}
</nav>
)}
</header>
{!hasData ? (
<UploadScreen onFiles={handleFiles} onSample={loadSample} />
) : (
<main className="max-w-[1500px] mx-auto px-4 py-4">
<FilterBar filters={filters} setFilters={setFilters}
emptyFilters={emptyFilters}
outlets={outlets} months={months} years={years}
sort={sort} setSort={setSort} activeCount={activeFilterCount}
filteredCount={filtered.length} totalCount={records.length} />
{filtered.length===0 && (
<div className="bg-panel border border-dashed border-border rounded-xl
p-8 text-center text-charcoalsoft text-sm my-4">
No reviews match the current filters. <button
onClick={()=>setFilters(emptyFilters)} className="text-gold
underline">Reset filters</button>
</div>
)}
{tab==="overview" && <Overview data={filtered} allData={records}
setFilters={setFilters} setTab={setTab} />}
{tab==="concern" && <ConcernTab data={filtered}
updateRecord={updateRecord} bulkUpdate={bulkUpdate}
showToast={showToast} />}
{tab==="all" && <AllTab data={filtered} outlets={outlets} />}
</main>
)}
{/* Import modal */}
{importState && validation && (
<ImportModal importState={importState} setImportState={setImportState}
validation={validation}
onConfirm={confirmImport} onExportErrors={exportErrorReport} />
)}
{/* Clear confirm */}
{confirmClear && (
<Modal onClose={()=>setConfirmClear(false)}>
<h3 className="text-lg font-semibold">Clear all imported data?</h3>
<p className="text-sm text-charcoalsoft mt-2">This removes all reviews
and management edits stored in this browser. This cannot be undone.
Consider exporting first.</p>
<div className="flex justify-end gap-2 mt-5">
<button onClick={()=>setConfirmClear(false)} className="px-4 py-2
text-sm rounded-lg border border-border">Cancel</button>
<button onClick={clearAll} className="px-4 py-2 text-sm rounded-lg
bg-danger text-white">Clear Data</button>
</div>
</Modal>
)}
{toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2
bg-charcoal text-ivory text-[13px] px-4 py-2 rounded-lg shadow-lg
z-50">{toast}</div>}
</div>
);
}
/* ============================================================
UPLOAD SCREEN
============================================================ */
function UploadScreen({onFiles, onSample}) {
const [drag, setDrag] = useState(false);
return (
<div className="max-w-3xl mx-auto px-4 py-10">
<div className={`bg-panel border-2 border-dashed rounded-2xl p-10
text-center transition ${drag?"border-gold bg-gold/5":"border-border"}`}
onDragOver={e=>{e.preventDefault();setDrag(true);}}
onDragLeave={()=>setDrag(false)}
onDrop={e=>{e.preventDefault();setDrag(false);onFiles(e.dataTransfer.files);}}>
<div className="w-14 h-14 mx-auto rounded-xl bg-gold/15 border
border-gold/30 flex items-center justify-center text-gold
text-2xl">↑</div>
<h2 className="text-xl font-semibold mt-4">Upload raw review data to
begin</h2>
<p className="text-sm text-charcoalsoft mt-1">Drag & drop a Google review JSON or CSV file here. Everything is processed locally in your
browser.</p>
<div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
<label className="px-5 py-2.5 rounded-lg bg-gold text-white text-sm
font-medium cursor-pointer hover:opacity-90">
Choose JSON / CSV
<input type="file" accept=".json,.csv,.tsv,.txt" multiple className="hidden"
onChange={e=>onFiles(e.target.files)} />
</label>
<button onClick={()=>downloadText(TEMPLATE_CSV(),
"ma_maison_import_template.csv","text/csv;charset=utf-8;")}
className="px-5 py-2.5 rounded-lg border border-border text-sm
hover:bg-goldsoft">Download CSV Template</button>
<button onClick={onSample} className="px-5 py-2.5 rounded-lg border
border-border text-sm hover:bg-goldsoft">Load Sample Data</button>
</div>
</div>
<div className="mt-6 grid sm:grid-cols-3 gap-3 text-[12px]
text-charcoalsoft">
<div className="bg-panel border border-border rounded-xl p-3"><b
className="text-charcoal">Required columns</b><br/>Outlet, Reviewer,
Review Date, Rating, Original Review.</div>
<div className="bg-panel border border-border rounded-xl p-3"><b
className="text-charcoal">Multilingual</b><br/>Chinese / Japanese /
other text displays correctly (UTF-8).</div>
<div className="bg-panel border border-border rounded-xl p-3"><b
className="text-charcoal">Private</b><br/>No login, no server, no
external transmission.</div>
</div>
</div>
);
}
/* ============================================================
FILTER BAR
============================================================ */
function FilterBar({filters, setFilters, emptyFilters, outlets, months,
years, sort, setSort, activeCount, filteredCount, totalCount}) {
const set = (k,v)=> setFilters(f=>({...f,[k]:v}));
return (
<div className="bg-panel border border-border rounded-xl p-3 mb-4">
<div className="flex flex-wrap items-center gap-2">
<Select value={filters.outlet} onChange={v=>set("outlet",v)}
options={outlets} placeholder="All Outlets" />
<Select value={filters.month} onChange={v=>set("month",v)}
options={months} placeholder="All Months" />
<Select value={filters.year} onChange={v=>set("year",v)} options={years}
placeholder="All Years" />
<Select value={filters.rating} onChange={v=>set("rating",v)}
options={["5","4","3","2","1"]} placeholder="All Ratings" />
<Select value={filters.category} onChange={v=>set("category",v)}
options={CATEGORIES} placeholder="All Categories" />
<Select value={filters.severity} onChange={v=>set("severity",v)}
options={SEVERITIES} placeholder="All Severities" />
<Select value={filters.responsible} onChange={v=>set("responsible",v)}
options={RESPONSIBLES} placeholder="All Responsible" />
<Select value={filters.status} onChange={v=>set("status",v)}
options={STATUSES} placeholder="All Status" />
<input value={filters.search} onChange={e=>set("search",e.target.value)}
placeholder="Search reviewer or text…"
className="text-[13px] border border-border rounded-lg px-2 py-1.5
bg-panel focus:outline-none focus:ring-2 focus:ring-gold/40
min-w-[180px] flex-1" />
<button onClick={()=>setFilters(emptyFilters)} className="text-[12px]
px-3 py-1.5 rounded-lg border border-border hover:bg-goldsoft">Reset
Filters</button>
</div>
<div className="flex flex-wrap items-center justify-between gap-2 mt-2
pt-2 border-t border-border">
<div className="flex items-center gap-3 text-[12px] text-charcoalsoft">
<span><b className="text-charcoal">{filteredCount}</b> of {totalCount}
reviews shown</span>
{activeCount>0 && <Badge tone="gold">{activeCount}
filter{activeCount>1?"s":""} active</Badge>}
</div>
<div className="flex items-center gap-2 text-[12px]">
<span className="text-charcoalsoft">Sort:</span>
<Select value={sort} onChange={setSort}
options={["date_desc","date_asc","outlet","rating_desc","rating_asc","severity","status"]}
/>
</div>
</div>
</div>
);
}
const SORT_LABEL = {date_desc:"Newest first",date_asc:"Oldest
first",outlet:"Outlet",rating_desc:"Rating high→low",rating_asc:"Rating
low→high",severity:"Severity",status:"Status"};
/* ============================================================
OVERVIEW TAB
============================================================ */
function Overview({data, setFilters, setTab}) {
const concerns = data.filter(computeConcern);
const total = data.length;
const avg = total ?
(data.reduce((s,r)=>s+(ratingNum(r.rating)||0),0)/data.filter(r=>ratingNum(r.rating)!=null).length)
: 0;
const concernRate = total ? (concerns.length/total*100) : 0;
const unanswered = concerns.filter(r=>!hasReply(r)).length;
const highCrit =
concerns.filter(r=>["High","Critical"].includes(r.severity)).length;
const openItems =
concerns.filter(r=>OPEN_STATUSES.includes(r.status)||!r.status).length;
const doneItems =
data.filter(r=>DONE_STATUSES.includes(r.status)).length;
const overdueCount = concerns.filter(overdue).length;
// monthly trend
const monthly = useMemo(()=>groupMonthly(data), [data]);
// concern by outlet
const byOutlet = useMemo(()=>{
const m={};
data.forEach(r=>{ const o=r.outlet||"—";
m[o]=m[o]||{n:0,c:0,sum:0,rc:0}; m[o].n++;
if(ratingNum(r.rating)!=null){m[o].sum+=ratingNum(r.rating);m[o].rc++;}
if(computeConcern(r))m[o].c++; });
return
Object.entries(m).map(([o,v])=>({outlet:o,n:v.n,c:v.c,rate:v.n?v.c/v.n*100:0,avg:v.rc?v.sum/v.rc:0})).sort((a,b)=>b.rate-a.rate);
}, [data]);
// category summary
const catCounts = CATEGORIES.map(c=>({c,
n:concerns.filter(r=>r.category===c).length}));
// action status
const statusCounts =
STATUSES.filter(s=>s!=="Closed").concat([]).slice(0,5); // Not
Started..Requires Confirmation set
const actionStates = ["Not Started","In Progress","Pending
Verification","Completed","Requires Confirmation"];
const actionCounts = actionStates.map(s=>({s,
n:concerns.filter(r=>r.status===s).length}));
// management summary calcs
const worstOutlet =
byOutlet.filter(o=>o.n>=1).slice().sort((a,b)=>b.rate-a.rate)[0];
const topCat = catCounts.slice().sort((a,b)=>b.n-a.n)[0];
const priority =
concerns.filter(r=>["High","Critical"].includes(r.severity))
.sort((a,b)=> severityRank(b.severity)-severityRank(a.severity) ||
(b.reviewDate||"").localeCompare(a.reviewDate||""));
return (
<div className="space-y-4">
{/* summary cards */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
<Card title="Total Reviews" value={total} sub="unique valid records" />
<Card title="Average Rating" value={avg?avg.toFixed(2):"—"} sub="of 5
stars" />
<Card title="Concern Reviews" value={concerns.length}
tone={concerns.length?"amber":undefined} sub="flagged for attention" />
<Card title="Concern Rate" value={concernRate.toFixed(1)+"%"}
tone={concernRate>25?"danger":concernRate>0?"amber":"good"}
sub={`${concerns.length} / ${total}`} />
<Card title="Unanswered Reviews" value={unanswered}
tone={unanswered?"amber":"good"} sub="concerns with no published reply"
/>
<Card title="High / Critical Concerns" value={highCrit}
tone={highCrit?"danger":"good"} />
<Card title="Open Action Items" value={openItems}
tone={openItems?"amber":"good"} />
<Card title="Completed Action Items" value={doneItems} tone="good" />
</div>
{/* auto management summary */}
<div className="bg-panel border border-border rounded-xl p-4">
<div className="text-[12px] font-semibold text-charcoalsoft
mb-2">Management Summary <span className="font-normal">(calculated from
current filters)</span></div>
<ul className="text-[13px] text-charcoal grid md:grid-cols-2 gap-x-6
gap-y-1 list-disc pl-5">
<li>Highest concern rate: <b>{worstOutlet?`${worstOutlet.outlet}
(${worstOutlet.rate.toFixed(0)}%)`:"—"}</b></li>
<li>Most common complaint category: <b>{topCat&&topCat.n?`${topCat.c}
(${topCat.n})`:"—"}</b></li>
<li>Unanswered concern reviews: <b>{unanswered}</b></li>
<li>Overdue action items: <b
className={overdueCount?"text-danger":""}>{overdueCount}</b></li>
</ul>
</div>
{/* charts */}
<div className="grid lg:grid-cols-2 gap-4">
<Panel title="Monthly Rating Trend" hint="Average rating (line) and
review volume (bars) by month.">
<ChartBox type="bar" height={230} empty={!monthly.labels.length}
data={{ labels:monthly.labels, datasets:[
{ type:"line", label:"Avg Rating", data:monthly.avg, yAxisID:"y1",
borderColor:"#B08D57", backgroundColor:"#B08D57", tension:0.3,
pointRadius:3 },
{ type:"bar", label:"Review Volume", data:monthly.count, yAxisID:"y",
backgroundColor:"#EFE6D6", borderColor:"#D8C7A6", borderWidth:1 },
]}}
options={{ scales:{ y:{ position:"left", beginAtZero:true,
ticks:{color:"#5B554D"} }, y1:{ position:"right", min:0, max:5,
grid:{drawOnChartArea:false}, ticks:{color:"#5B554D"} },
x:{ticks:{color:"#5B554D"}} } }} />
</Panel>
<Panel title="Concern Reviews by Outlet" hint="Concern count, concern %
and average rating per outlet.">
<ChartBox type="bar" height={230} empty={!byOutlet.length}
data={{ labels:byOutlet.map(o=>o.outlet), datasets:[
{ label:"Concern Count", data:byOutlet.map(o=>o.c),
backgroundColor:"#C98A2B", yAxisID:"y" },
{ label:"Concern %", data:byOutlet.map(o=>+o.rate.toFixed(1)),
backgroundColor:"#B4483C", yAxisID:"y1", type:"line",
borderColor:"#B4483C", pointRadius:3 },
{ label:"Avg Rating", data:byOutlet.map(o=>+o.avg.toFixed(2)),
backgroundColor:"#4F7A5B", type:"line", borderColor:"#4F7A5B",
yAxisID:"y2", pointRadius:3 },
]}}
options={{ scales:{
y:{position:"left",beginAtZero:true,ticks:{color:"#5B554D"}},
y1:{position:"right",beginAtZero:true,grid:{drawOnChartArea:false},ticks:{color:"#5B554D"}},
y2:{display:false,min:0,max:5}, x:{ticks:{color:"#5B554D"}} } }} />
</Panel>
<Panel title="Complaint Category Summary" hint="Concern reviews grouped
into the six standard categories.">
<ChartBox type="bar" height={230} empty={!concerns.length}
data={{ labels:catCounts.map(c=>c.c), datasets:[{ label:"Concerns",
data:catCounts.map(c=>c.n), backgroundColor:PALETTE }]}}
options={{ indexAxis:"y", plugins:{legend:{display:false}},
scales:{x:{beginAtZero:true,ticks:{color:"#5B554D",precision:0}},y:{ticks:{color:"#5B554D"}}}
}} />
</Panel>
<Panel title="Action Status Summary" hint="Status distribution across
concern reviews.">
<ChartBox type="doughnut" height={230} empty={!concerns.length}
data={{ labels:actionCounts.map(a=>a.s), datasets:[{
data:actionCounts.map(a=>a.n),
backgroundColor:["#C9C1B2","#C98A2B","#7A6A8A","#4F7A5B","#B4483C"] }]}}
options={{
plugins:{legend:{position:"right",labels:{color:"#5B554D",font:{size:11}}}}
}} />
</Panel>
</div>
{/* priority table */}
<Panel title="Priority Attention — High & Critical Concerns" hint="Only
High and Critical concern reviews.">
{priority.length===0 ? <Empty msg="No High or Critical concerns in the
current view." /> : (
<div className="overflow-x-auto">
<table className="w-full text-[12px]">
<thead className="text-charcoalsoft text-left border-b border-border">
<tr>{["Outlet","Review
Date","Reviewer","Rating","Category","Severity","Responsible","Status","Recommended
Timeline"].map(h=><th key={h} className="py-2 pr-3 font-medium
whitespace-nowrap">{h}</th>)}</tr>
</thead>
<tbody>
{priority.slice(0,50).map(r=>(
<tr key={r.reviewID} className="border-b border-border/60">
<td className="py-2 pr-3 whitespace-nowrap">{r.outlet}</td>
<td className="py-2 pr-3 whitespace-nowrap">{r.reviewDate}</td>
<td className="py-2 pr-3 whitespace-nowrap">{r.reviewer}</td>
<td className="py-2 pr-3">{r.rating}★</td>
<td className="py-2 pr-3 whitespace-nowrap">{r.category||"—"}</td>
<td className="py-2 pr-3"><Badge
tone={sevTone(r.severity)}>{r.severity||"—"}</Badge></td>
<td className="py-2 pr-3 whitespace-nowrap">{r.responsible==="Requires
Assignment"||!r.responsible ? <Badge tone="danger">Requires
Assignment</Badge> : r.responsible}</td>
<td className="py-2 pr-3"><Badge
tone={statusTone(r.status)}>{r.status||"Not Started"}</Badge></td>
<td className="py-2 pr-3 whitespace-nowrap">{r.recommendedTimeline||"—"}
{overdue(r)&&<Badge tone="danger">Overdue</Badge>}</td>
</tr>
))}
</tbody>
</table>
</div>
)}
</Panel>
</div>
);
}
function groupMonthly(data) {
const m = {};
data.forEach(r=>{ const k=monthKey(r.reviewDate); if(!k) return;
m[k]=m[k]||{count:0,sum:0,rc:0,concern:0,low:0,unans:0}; m[k].count++;
const rn=ratingNum(r.rating); if(rn!=null){m[k].sum+=rn;m[k].rc++;
if(rn<=2)m[k].low++;} if(computeConcern(r)){m[k].concern++;
if(!hasReply(r))m[k].unans++;} });
const labels = Object.keys(m).sort();
return {
labels,
count: labels.map(k=>m[k].count),
avg: labels.map(k=>m[k].rc?+(m[k].sum/m[k].rc).toFixed(2):null),
concern: labels.map(k=>m[k].concern),
concernRate:
labels.map(k=>m[k].count?+(m[k].concern/m[k].count*100).toFixed(1):0),
low: labels.map(k=>m[k].low),
unans: labels.map(k=>m[k].unans),
};
}
function Panel({title, hint, children, right}) {
return (
<div className="bg-panel border border-border rounded-xl p-4">
<div className="flex items-center justify-between mb-3">
<h3 className="text-[13px] font-semibold flex
items-center">{title}{hint&&<Info label={hint} />}</h3>
{right}
</div>
{children}
</div>
);
}
const Empty = ({msg})=> <div className="text-center text-[12px]
text-charcoalsoft py-8 border border-dashed border-border
rounded-lg">{msg}</div>;
/* ============================================================
CONCERN REVIEWS TAB (main working table)
============================================================ */
function ConcernTab({data, updateRecord, bulkUpdate, showToast}) {
const concerns = useMemo(()=>data.filter(computeConcern), [data]);
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(15);
const [selected, setSelected] = useState(new Set());
const [expanded, setExpanded] = useState(new Set());
const [bulkField, setBulkField] = useState({responsible:"", status:"",
category:""});
useEffect(()=>{ setPage(1); }, [data, pageSize]);
const pages = Math.max(1, Math.ceil(concerns.length/pageSize));
const pageItems = concerns.slice((page-1)*pageSize, page*pageSize);
const toggleSel = (id)=> setSelected(s=>{ const n=new Set(s);
n.has(id)?n.delete(id):n.add(id); return n; });
const toggleExp = (id)=> setExpanded(s=>{ const n=new Set(s);
n.has(id)?n.delete(id):n.add(id); return n; });
const allPageSelected = pageItems.length>0 &&
pageItems.every(r=>selected.has(r.reviewID));
const selectPage = ()=> setSelected(s=>{ const n=new Set(s);
if(allPageSelected){pageItems.forEach(r=>n.delete(r.reviewID));} else
{pageItems.forEach(r=>n.add(r.reviewID));} return n; });
const applyBulk = (field)=>{
const val = bulkField[field];
if (!val || selected.size===0) { showToast("Select rows and a value
first."); return; }
const patch = field==="responsible"?{responsible:val}:
field==="status"?{status:val}:{category:val};
bulkUpdate([...selected], patch);
showToast(`Updated ${selected.size} row(s).`);
};
return (
<div className="space-y-3">
{/* toolbar */}
<div className="bg-panel border border-border rounded-xl p-3 flex
flex-wrap items-center gap-2">
<span className="text-[12px] text-charcoalsoft mr-1"><b
className="text-charcoal">{concerns.length}</b> concern reviews · <b
className="text-charcoal">{selected.size}</b> selected</span>
<div className="flex items-center gap-1">
<Select value={bulkField.responsible}
onChange={v=>setBulkField(b=>({...b,responsible:v}))}
options={RESPONSIBLES} placeholder="Bulk responsible…" />
<button onClick={()=>applyBulk("responsible")} className="text-[12px]
px-2 py-1.5 rounded-lg border border-border
hover:bg-goldsoft">Apply</button>
</div>
<div className="flex items-center gap-1">
<Select value={bulkField.status}
onChange={v=>setBulkField(b=>({...b,status:v}))} options={STATUSES}
placeholder="Bulk status…" />
<button onClick={()=>applyBulk("status")} className="text-[12px] px-2
py-1.5 rounded-lg border border-border hover:bg-goldsoft">Apply</button>
</div>
<div className="flex items-center gap-1">
<Select value={bulkField.category}
onChange={v=>setBulkField(b=>({...b,category:v}))} options={CATEGORIES}
placeholder="Bulk category…" />
<button onClick={()=>applyBulk("category")} className="text-[12px] px-2
py-1.5 rounded-lg border border-border hover:bg-goldsoft">Apply</button>
</div>
<div className="flex-1"></div>
<button
onClick={()=>exportCSV(concerns,"ma_maison_concern_reviews.csv")}
className="text-[12px] px-3 py-1.5 rounded-lg bg-gold text-white
hover:opacity-90">Export Concern Reviews</button>
<button
onClick={()=>exportCSV(concerns,"ma_maison_concern_reviews_filtered.csv")}
className="text-[12px] px-3 py-1.5 rounded-lg border border-border
hover:bg-goldsoft">Export Filtered</button>
</div>
{concerns.length===0 ? <Empty msg="No concern reviews in the current
view." /> : (
<div className="bg-panel border border-border rounded-xl
overflow-hidden">
<div className="overflow-x-auto">
<table className="text-[12px] border-collapse min-w-[1400px]">
<thead className="bg-goldsoft/60 text-charcoalsoft text-left sticky
top-0 z-10">
<tr>
<th className="p-2"><input type="checkbox" checked={allPageSelected}
onChange={selectPage} /></th>
<th className="p-2 font-medium">ID</th>
<th className="p-2 font-medium sticky-col left-0
bg-goldsoft/90">Outlet</th>
<th className="p-2 font-medium">Review Date</th>
<th className="p-2 font-medium sticky-col bg-goldsoft/90"
style={{left:0}}>Reviewer</th>
<th className="p-2 font-medium">Rating</th>
<th className="p-2 font-medium min-w-[240px]">Review (Original /
Translation)</th>
<th className="p-2 font-medium min-w-[220px]">Reply</th>
<th className="p-2 font-medium">Category</th>
<th className="p-2 font-medium">Severity</th>
<th className="p-2 font-medium min-w-[160px]">Root Cause /
Confidence</th>
<th className="p-2 font-medium">Responsible</th>
<th className="p-2 font-medium">Sales Recovery</th>
<th className="p-2 font-medium min-w-[180px]">Action Plan</th>
<th className="p-2 font-medium">Timeline</th>
<th className="p-2 font-medium">Status</th>
<th className="p-2 font-medium min-w-[160px]">Notes</th>
<th className="p-2 font-medium">Updated</th>
</tr>
</thead>
<tbody>
{pageItems.map(r=>(
<ConcernRow key={r.reviewID} r={r} sel={selected.has(r.reviewID)}
onSel={()=>toggleSel(r.reviewID)}
exp={expanded.has(r.reviewID)} onExp={()=>toggleExp(r.reviewID)}
update={updateRecord} />
))}
</tbody>
</table>
</div>
{/* pagination */}
<div className="flex items-center justify-between p-3 border-t
border-border text-[12px]">
<div className="flex items-center gap-2">
<span className="text-charcoalsoft">Rows per page:</span>
<Select value={String(pageSize)} onChange={v=>setPageSize(+v)}
options={["10","15","25","50","100"]} />
</div>
<div className="flex items-center gap-2">
<button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-3
py-1.5 rounded-lg border border-border
disabled:opacity-40">Prev</button>
<span>Page {page} / {pages}</span>
<button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}
className="px-3 py-1.5 rounded-lg border border-border
disabled:opacity-40">Next</button>
</div>
</div>
</div>
)}
<p className="text-[11px] text-charcoalsoft">Recommended timelines are
suggested targets, not confirmed deadlines. Drafted replies are labelled
and never presented as published replies. Original review, rating,
reviewer and date are locked.</p>
</div>
);
}
function flagsFor(r) {
const out = [];
if (overdue(r)) out.push(["danger","Overdue"]);
if (["High","Critical"].includes(r.severity) && (!r.responsible ||
r.responsible==="Requires Assignment")) out.push(["danger","Needs
owner"]);
if (!hasAnyReply(r)) out.push(["amber","No reply"]);
if (DONE_STATUSES.includes(r.status) && !(r.managementNotes &&
r.managementNotes.trim())) out.push(["amber","No completion evidence"]);
return out;
}
function ConcernRow({r, sel, onSel, exp, onExp, update}) {
const english = isEnglish(r);
const flags = flagsFor(r);
const cell = "p-2 align-top";
return (
<tr className={`border-b border-border/60 ${sel?"bg-gold/5":"bg-panel"}
hover:bg-goldsoft/20`}>
<td className={cell}><input type="checkbox" checked={sel}
onChange={onSel} /></td>
<td className={cell+" text-charcoalsoft whitespace-nowrap"}>{r.reviewID}
{flags.length>0 && <div className="mt-1
space-y-0.5">{flags.map(([t,l],i)=><div key={i}><Badge
tone={t}>{l}</Badge></div>)}</div>}
</td>
<td className={cell+" sticky-col left-0 font-medium whitespace-nowrap
"+(sel?"bg-gold/5":"bg-panel")}>{r.outlet}</td>
<td className={cell+" whitespace-nowrap"}>{r.reviewDate}</td>
<td className={cell+" sticky-col whitespace-nowrap
"+(sel?"bg-gold/5":"bg-panel")} style={{left:0}}>{r.reviewer}</td>
<td className={cell+" whitespace-nowrap font-medium"}>{r.rating}★</td>
{/* review */}
<td className={cell}>
<div className={exp?"":"clamp2"}>{r.originalReview||"—"}</div>
{!english && (r.englishTranslation||"") && (
<div className={`mt-1 text-charcoalsoft italic ${exp?"":"clamp2"}`}>EN:
{r.englishTranslation}</div>
)}
{!english && !(r.englishTranslation||"").trim() && <div
className="mt-1"><Badge tone="amber">Translation missing</Badge></div>}
{(r.originalReview||"").length>60 && <button onClick={onExp}
className="text-[11px] text-gold
mt-1">{exp?"Collapse":"Expand"}</button>}
</td>
{/* reply */}
<td className={cell}>
{hasReply(r) ? (
<div><Badge tone="good">Published reply</Badge><div className={`mt-1
${exp?"":"clamp2"}`}>{r.existingReply}</div></div>
) : (
<div>
{(r.draftedReply||"").trim() ? <Badge tone="amber">Draft — Not Yet
Published</Badge> : <Badge tone="neutral">No reply available</Badge>}
<textarea value={r.draftedReply||""}
onChange={e=>update(r.reviewID,{draftedReply:e.target.value,
replyStatus:e.target.value.trim()?"Draft — Not Yet Published":"No
Reply"})}
placeholder="Write or paste a draft reply…" rows={exp?4:2}
className="mt-1 w-full text-[12px] border border-border rounded-lg px-2
py-1 focus:outline-none focus:ring-2 focus:ring-gold/40" />
</div>
)}
</td>
<td className={cell}><Select value={r.category}
onChange={v=>update(r.reviewID,{category:v})} options={CATEGORIES}
placeholder="—" className="min-w-[120px]" /></td>
<td className={cell}>
<Select value={r.severity} onChange={v=>update(r.reviewID,{severity:v})}
options={SEVERITIES} placeholder="—" />
<div className="mt-1"><Badge
tone={sevTone(r.severity)}>{r.severity||"—"}</Badge></div>
</td>
<td className={cell}>
<input value={r.possibleRootCause||""}
onChange={e=>update(r.reviewID,{possibleRootCause:e.target.value})}
placeholder="Possible root cause…"
className="w-full text-[12px] border border-border rounded-lg px-2 py-1
mb-1 focus:outline-none focus:ring-2 focus:ring-gold/40" />
<Select value={r.rootCauseConfidence}
onChange={v=>update(r.reviewID,{rootCauseConfidence:v})}
options={CONFIDENCE} placeholder="Confidence…" />
<div className="mt-1"><Badge tone={confTone(r.rootCauseConfidence)}
title="Represents management attention / confidence level — not
confirmed fault.">{r.rootCauseConfidence||"—"}</Badge></div>
</td>
<td className={cell}><Select value={r.responsible}
onChange={v=>update(r.reviewID,{responsible:v})} options={RESPONSIBLES}
placeholder="—" className="min-w-[130px]" /></td>
<td className={cell}><Select value={r.salesRecovery}
onChange={v=>update(r.reviewID,{salesRecovery:v})}
options={SALES_RECOVERY} placeholder="—" className="min-w-[130px]"
/></td>
<td className={cell}><textarea value={r.actionPlan||""}
onChange={e=>update(r.reviewID,{actionPlan:e.target.value})}
rows={exp?4:2} placeholder="Action plan…"
className="w-full text-[12px] border border-border rounded-lg px-2 py-1
focus:outline-none focus:ring-2 focus:ring-gold/40" /></td>
<td className={cell}><input type="date"
value={parseDateISO(r.recommendedTimeline)||""}
onChange={e=>update(r.reviewID,{recommendedTimeline:e.target.value})}
className="text-[12px] border border-border rounded-lg px-1 py-1
focus:outline-none focus:ring-2 focus:ring-gold/40" />
{overdue(r)&&<div className="mt-1"><Badge
tone="danger">Overdue</Badge></div>}</td>
<td className={cell}>
<Select value={r.status} onChange={v=>update(r.reviewID,{status:v})}
options={STATUSES} placeholder="Not Started" />
<div className="mt-1"><Badge tone={statusTone(r.status)}>{r.status||"Not
Started"}</Badge></div>
</td>
<td className={cell}><textarea value={r.managementNotes||""}
onChange={e=>update(r.reviewID,{managementNotes:e.target.value})}
rows={exp?4:2} placeholder="Notes / completion evidence…"
className="w-full text-[12px] border border-border rounded-lg px-2 py-1
focus:outline-none focus:ring-2 focus:ring-gold/40" /></td>
<td className={cell+" whitespace-nowrap
text-charcoalsoft"}>{r.lastUpdated||"—"}</td>
</tr>
);
}
/* ============================================================
ALL REVIEWS & ANALYSIS TAB
============================================================ */
function AllTab({data, outlets}) {
return (
<div className="space-y-4">
<SectionA data={data} />
<SectionB data={data} outlets={outlets} />
<SectionC data={data} />
<div className="flex justify-end">
<button
onClick={()=>exportCSV(data,"ma_maison_all_reviews_filtered.csv")}
className="text-[12px] px-3 py-1.5 rounded-lg bg-gold text-white
hover:opacity-90">Export Currently Filtered Data</button>
</div>
</div>
);
}
function SectionA({data}) {
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(20);
const [exp, setExp] = useState(new Set());
useEffect(()=>{ setPage(1); }, [data, pageSize]);
const pages = Math.max(1, Math.ceil(data.length/pageSize));
const items = data.slice((page-1)*pageSize, page*pageSize);
const toggle=(id)=>setExp(s=>{const n=new
Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
return (
<Panel title="Section A — All Reviews" hint="Every review in the current
filter, positive and negative." right={<button
onClick={()=>exportCSV(data,"ma_maison_all_reviews.csv")}
className="text-[11px] px-2 py-1 rounded-lg border border-border
hover:bg-goldsoft">Export</button>}>
{data.length===0? <Empty msg="No reviews." /> : (
<div>
<div className="overflow-x-auto">
<table className="text-[12px] w-full min-w-[1100px]">
<thead className="text-charcoalsoft text-left border-b border-border">
<tr>{["ID","Outlet","Reviewer","Date","Month","Rating","Review","Lang","Reply","Sentiment","Category","Severity","Concern","Status"].map(h=><th
key={h} className="py-2 pr-2 font-medium
whitespace-nowrap">{h}</th>)}</tr>
</thead>
<tbody>
{items.map(r=>{
const eng=isEnglish(r);
return (
<tr key={r.reviewID} className="border-b border-border/60 align-top">
<td className="py-2 pr-2 text-charcoalsoft
whitespace-nowrap">{r.reviewID}</td>
<td className="py-2 pr-2 whitespace-nowrap">{r.outlet}</td>
<td className="py-2 pr-2 whitespace-nowrap">{r.reviewer}</td>
<td className="py-2 pr-2 whitespace-nowrap">{r.reviewDate}</td>
<td className="py-2 pr-2
whitespace-nowrap">{monthKey(r.reviewDate)}</td>
<td className="py-2 pr-2 whitespace-nowrap">{r.rating}★</td>
<td className="py-2 pr-2 max-w-[280px]">
<div
className={exp.has(r.reviewID)?"":"clamp2"}>{r.originalReview}</div>
{!eng && (r.englishTranslation||"") && <div
className={`text-charcoalsoft italic
${exp.has(r.reviewID)?"":"clamp2"}`}>EN: {r.englishTranslation}</div>}
{(r.originalReview||"").length>60 && <button
onClick={()=>toggle(r.reviewID)} className="text-[11px]
text-gold">{exp.has(r.reviewID)?"Collapse":"Expand"}</button>}
</td>
<td className="py-2 pr-2
whitespace-nowrap">{r.originalLanguage||"—"}</td>
<td className="py-2 pr-2">{hasReply(r)?<Badge
tone="good">Published</Badge>:(r.draftedReply||"").trim()?<Badge
tone="amber">Draft</Badge>:<Badge>None</Badge>}</td>
<td className="py-2 pr-2 whitespace-nowrap">{r.sentiment||"—"}</td>
<td className="py-2 pr-2 whitespace-nowrap">{r.category||"—"}</td>
<td className="py-2 pr-2"><Badge
tone={sevTone(r.severity)}>{r.severity||"—"}</Badge></td>
<td className="py-2 pr-2">{computeConcern(r)?<Badge
tone="amber">Yes</Badge>:<Badge tone="good">No</Badge>}</td>
<td className="py-2 pr-2"><Badge
tone={statusTone(r.status)}>{r.status||"—"}</Badge></td>
</tr>);
})}
</tbody>
</table>
</div>
<div className="flex items-center justify-between pt-3 text-[12px]">
<div className="flex items-center gap-2"><span
className="text-charcoalsoft">Rows:</span><Select
value={String(pageSize)} onChange={v=>setPageSize(+v)}
options={["10","20","50","100"]} /></div>
<div className="flex items-center gap-2">
<button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-3
py-1.5 rounded-lg border border-border
disabled:opacity-40">Prev</button>
<span>Page {page} / {pages}</span>
<button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}
className="px-3 py-1.5 rounded-lg border border-border
disabled:opacity-40">Next</button>
</div>
</div>
</div>)}
</Panel>
);
}
function SectionB({data, outlets}) {
const [selOutlets, setSelOutlets] = useState([]);
const monthly = useMemo(()=>groupMonthly(data), [data]);
// per outlet monthly avg (max 5 lines)
const activeOutlets = selOutlets.length? selOutlets :
outlets.slice(0,5);
const tooMany = outlets.length>5 && selOutlets.length===0;
const perOutlet = useMemo(()=>{
const labels = monthly.labels;
return activeOutlets.map((o,i)=>{
const md={};
data.filter(r=>r.outlet===o).forEach(r=>{const k=monthKey(r.reviewDate);
if(!k)return; md[k]=md[k]||{s:0,c:0}; const rn=ratingNum(r.rating);
if(rn!=null){md[k].s+=rn;md[k].c++;}});
return { label:o,
data:labels.map(k=>md[k]&&md[k].c?+(md[k].s/md[k].c).toFixed(2):null),
borderColor:PALETTE[i%PALETTE.length],
backgroundColor:PALETTE[i%PALETTE.length], tension:0.3, spanGaps:true };
});
}, [data, activeOutlets, monthly]);
const toggleOutlet=(o)=>setSelOutlets(s=> s.includes(o)?
s.filter(x=>x!==o) : s.length<5? [...s,o] : s );
return (
<Panel title="Section B — Monthly Trends" hint="Volume, ratings and
concern trends by month.">
<div className="grid lg:grid-cols-2 gap-4">
<div>
<div className="text-[12px] text-charcoalsoft mb-1">Total reviews &
average rating by month</div>
<ChartBox type="bar" height={210} empty={!monthly.labels.length}
data={{labels:monthly.labels, datasets:[
{type:"bar",label:"Total
Reviews",data:monthly.count,backgroundColor:"#EFE6D6",borderColor:"#D8C7A6",borderWidth:1,yAxisID:"y"},
{type:"line",label:"Avg
Rating",data:monthly.avg,borderColor:"#B08D57",backgroundColor:"#B08D57",yAxisID:"y1",tension:0.3,pointRadius:3},
]}}
options={{scales:{y:{beginAtZero:true,ticks:{color:"#5B554D"}},y1:{position:"right",min:0,max:5,grid:{drawOnChartArea:false},ticks:{color:"#5B554D"}},x:{ticks:{color:"#5B554D"}}}}}
/>
</div>
<div>
<div className="text-[12px] text-charcoalsoft mb-1">1★ & 2★ and concern
reviews by month</div>
<ChartBox type="bar" height={210} empty={!monthly.labels.length}
data={{labels:monthly.labels, datasets:[
{label:"1★ & 2★",data:monthly.low,backgroundColor:"#C98A2B"},
{label:"Concern
Reviews",data:monthly.concern,backgroundColor:"#B4483C"},
{label:"Unanswered
Concerns",data:monthly.unans,backgroundColor:"#7A6A8A"},
]}}
options={{scales:{y:{beginAtZero:true,ticks:{color:"#5B554D",precision:0}},x:{ticks:{color:"#5B554D"}}}}}
/>
</div>
<div>
<div className="text-[12px] text-charcoalsoft mb-1">Concern rate (%) by
month</div>
<ChartBox type="line" height={210} empty={!monthly.labels.length}
data={{labels:monthly.labels, datasets:[{label:"Concern Rate
%",data:monthly.concernRate,borderColor:"#B4483C",backgroundColor:"#B4483C",tension:0.3,pointRadius:3}]}}
options={{scales:{y:{beginAtZero:true,ticks:{color:"#5B554D"}},x:{ticks:{color:"#5B554D"}}}}}
/>
</div>
<div>
<div className="text-[12px] text-charcoalsoft mb-1 flex items-center
justify-between">
<span>Average rating by outlet (max 5 lines)</span>
</div>
{tooMany && <div className="text-[11px] text-amber mb-1">More than 5
outlets — select up to 5 below.</div>}
{outlets.length>5 && (
<div className="flex flex-wrap gap-1 mb-2">
{outlets.map(o=>(
<button key={o} onClick={()=>toggleOutlet(o)} className={`text-[11px]
px-2 py-0.5 rounded-full border ${activeOutlets.includes(o)?"bg-gold/10
border-gold/40 text-gold":"border-border
text-charcoalsoft"}`}>{o}</button>
))}
</div>
)}
<ChartBox type="line" height={190} empty={!monthly.labels.length}
data={{labels:monthly.labels, datasets:perOutlet}}
options={{scales:{y:{min:0,max:5,ticks:{color:"#5B554D"}},x:{ticks:{color:"#5B554D"}}}}}
/>
</div>
</div>
</Panel>
);
}
function SectionC({data}) {
const concerns = data.filter(computeConcern);
const totalC = concerns.length;
const catRows = CATEGORIES.map(c=>({c,
n:concerns.filter(r=>r.category===c).length})).filter(x=>true);
const sevRows = SEVERITIES.map(s=>({s,
n:concerns.filter(r=>r.severity===s).length}));
const respRows = RESPONSIBLES.map(p=>({p,
n:concerns.filter(r=>r.responsible===p).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
const openN =
concerns.filter(r=>OPEN_STATUSES.includes(r.status)||!r.status).length;
const doneN =
concerns.filter(r=>DONE_STATUSES.includes(r.status)).length;
// by outlet
const outletCat = {};
concerns.forEach(r=>{const o=r.outlet||"—";
outletCat[o]=(outletCat[o]||0)+1;});
const outletRows =
Object.entries(outletCat).map(([o,n])=>({o,n})).sort((a,b)=>b.n-a.n);
// repeated themes: outlet+category pairs with >=2
const themeMap={};
concerns.forEach(r=>{ if(!r.category) return; const k=`${r.outlet||"—"}
· ${r.category}`; themeMap[k]=(themeMap[k]||0)+1; });
const themes =
Object.entries(themeMap).filter(([k,n])=>n>=2).map(([k,n])=>({k,n})).sort((a,b)=>b.n-a.n);
return (
<Panel title="Section C — Complaint Analysis" hint="Category, severity,
workload and recurring themes across concern reviews.">
{totalC===0? <Empty msg="No concern reviews to analyse." /> : (
<div className="grid lg:grid-cols-2 gap-5">
<div>
<div className="text-[12px] font-medium mb-2">Complaint count & % by
category <span className="text-charcoalsoft">(denominator = {totalC}
concerns)</span></div>
<table className="w-full text-[12px]">
<tbody>
{catRows.map(row=>(
<tr key={row.c} className="border-b border-border/50">
<td className="py-1.5">{row.c}</td>
<td className="py-1.5 text-right font-medium">{row.n}</td>
<td className="py-1.5 text-right text-charcoalsoft
w-24">{totalC?((row.n/totalC*100).toFixed(1)):0}% <span
className="text-[10px]">({row.n}/{totalC})</span></td>
</tr>
))}
</tbody>
</table>
<div className="text-[12px] font-medium mt-4 mb-2">Severity
distribution</div>
<ChartBox type="bar" height={160} empty={!totalC}
data={{labels:sevRows.map(s=>s.s),datasets:[{data:sevRows.map(s=>s.n),backgroundColor:["#4F7A5B","#C98A2B","#C98A2B","#B4483C","#B4483C"]}]}}
options={{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0,color:"#5B554D"}},x:{ticks:{color:"#5B554D"}}}}}
/>
</div>
<div>
<div className="text-[12px] font-medium mb-2">Complaints by outlet</div>
<ChartBox type="bar" height={160} empty={!outletRows.length}
data={{labels:outletRows.map(o=>o.o),datasets:[{data:outletRows.map(o=>o.n),backgroundColor:"#B08D57"}]}}
options={{indexAxis:"y",plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0,color:"#5B554D"}},y:{ticks:{color:"#5B554D"}}}}}
/>
<div className="text-[12px] font-medium mt-4 mb-2">Open vs completed
actions</div>
<div className="flex items-center gap-4">
<div className="flex-1"><ChartBox type="doughnut" height={130}
empty={!totalC}
data={{labels:["Open","Completed"],datasets:[{data:[openN,doneN],backgroundColor:["#C98A2B","#4F7A5B"]}]}}
options={{plugins:{legend:{position:"right",labels:{color:"#5B554D",font:{size:11}}}}}}
/></div>
</div>
<div className="text-[12px] font-medium mt-4 mb-2">Responsible
workload</div>
<table className="w-full text-[12px]">
<tbody>
{respRows.length? respRows.map(row=>(
<tr key={row.p} className="border-b border-border/50"><td
className="py-1">{row.p}</td><td className="py-1 text-right
font-medium">{row.n}</td></tr>
)) : <tr><td className="text-charcoalsoft py-1">No responsible persons
assigned yet.</td></tr>}
</tbody>
</table>
</div>
<div className="lg:col-span-2">
<div className="text-[12px] font-medium mb-2">Repeated concern themes
<span className="text-charcoalsoft">(same outlet + category, 2 or
more)</span></div>
{themes.length? (
<div className="flex flex-wrap gap-2">{themes.map(t=><Badge key={t.k}
tone="amber">{t.k} — {t.n}×</Badge>)}</div>
) : <div className="text-[12px] text-charcoalsoft">No repeated themes
detected in the current view.</div>}
</div>
</div>)}
</Panel>
);
}
/* ============================================================
IMPORT MODAL (mapping + validation)
============================================================ */
function Modal({children, onClose, wide}) {
return (
<div className="fixed inset-0 z-50 bg-charcoal/40 flex items-center
justify-center p-4" onClick={onClose}>
<div className={`bg-panel rounded-2xl shadow-2xl border border-border
p-6 w-full ${wide?"max-w-4xl":"max-w-md"} max-h-[90vh] overflow-y-auto`}
onClick={e=>e.stopPropagation()}>
{children}
</div>
</div>
);
}
function ImportModal({importState, setImportState, validation,
onConfirm, onExportErrors}) {
const {headers, mapping, fileNames} = importState;
const setMap = (key, val)=> setImportState(s=>({...s,
mapping:{...s.mapping,[key]:val}}));
const missingReq = REQUIRED_KEYS.filter(k=>!mapping[k]);
return (
<Modal wide onClose={()=>setImportState(null)}>
<div className="flex items-center justify-between">
<h3 className="text-lg font-semibold">Review import — {fileNames.join(",
")}</h3>
<button onClick={()=>setImportState(null)} className="text-charcoalsoft
hover:text-charcoal">✕</button>
</div>
<p className="text-[12px] text-charcoalsoft mt-1">Detected columns:
{headers.map(h=><span key={h} className="inline-block bg-goldsoft
rounded px-1.5 py-0.5 mr-1 mb-1 text-charcoal">{h}</span>)}</p>
{/* validation summary */}
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3">
<StatBox label="Rows detected" value={validation.total} />
<StatBox label="Valid (new)" value={validation.valid.length} tone="good"
/>
<StatBox label="Duplicates"
value={validation.dupExisting+validation.dupWithin} tone="amber" />
<StatBox label="Invalid" value={validation.invalid.length}
tone={validation.invalid.length?"danger":undefined} />
</div>
<div className="text-[12px] text-charcoalsoft mb-3">
Outlets detected: <b
className="text-charcoal">{validation.outlets.join(", ")||"—"}</b> ·
Date range: <b className="text-charcoal">{validation.minD||"?"} →
{validation.maxD||"?"}</b>
{validation.invalid.length>0 && <> · <button onClick={onExportErrors}
className="text-gold underline">Export error report</button></>}
</div>
{/* mapping table */}
<div className="border border-border rounded-xl overflow-hidden">
<table className="w-full text-[12px]">
<thead className="bg-goldsoft/60 text-charcoalsoft text-left"><tr><th
className="p-2 font-medium">Dashboard field</th><th className="p-2
font-medium">Mapped CSV column</th></tr></thead>
<tbody>
{FIELD_DEFS.map(f=>(
<tr key={f.key} className="border-t border-border/60">
<td className="p-2">{f.label}{f.required&&<span className="text-danger
ml-1">*</span>}</td>
<td className="p-2">
<select value={mapping[f.key]||""}
onChange={e=>setMap(f.key,e.target.value)}
className={`text-[12px] border rounded-lg px-2 py-1 bg-panel
min-w-[200px]
${f.required&&!mapping[f.key]?"border-danger":"border-border"}`}>
<option value="">— not mapped —</option>
{headers.map(h=><option key={h} value={h}>{h}</option>)}
</select>
</td>
</tr>
))}
</tbody>
</table>
</div>
{missingReq.length>0 && <p className="text-[12px] text-danger mt-3">Map
all required fields (*) to continue:
{missingReq.map(k=>FIELD_DEFS.find(f=>f.key===k).label).join(", ")}</p>}
<div className="flex justify-end gap-2 mt-5">
<button onClick={()=>setImportState(null)} className="px-4 py-2 text-sm
rounded-lg border border-border">Cancel</button>
<button disabled={missingReq.length>0 || validation.valid.length===0}
onClick={onConfirm}
className="px-4 py-2 text-sm rounded-lg bg-gold text-white
disabled:opacity-40">Import {validation.valid.length} review(s)</button>
</div>
<p className="text-[11px] text-charcoalsoft mt-2">Invalid rows are never
deleted — export the error report, fix, and re-upload. Exact duplicates
(Outlet + Reviewer + Date + Rating + Review) are skipped
automatically.</p>
</Modal>
);
}
function StatBox({label, value, tone}) {
const c =
tone==="good"?"text-good":tone==="amber"?"text-amber":tone==="danger"?"text-danger":"text-charcoal";
return <div className="border border-border rounded-lg p-2
text-center"><div className={`text-xl font-semibold
${c}`}>{value}</div><div className="text-[11px]
text-charcoalsoft">{label}</div></div>;
}
/* ============================================================
TEMPLATE + SAMPLE DATA
============================================================ */
function TEMPLATE_CSV() {
const headers = FIELD_DEFS.map(f=>f.label);
const example = {
"Review ID":"", "Outlet":"Ma Maison Pavilion", "Reviewer":"Jane Tan",
"Review Date":"2026-05-14",
"Rating":"2", "Original Review":"Service was slow and the tonkatsu was
cold.", "Original Language":"English",
"English Translation":"", "Existing Management Reply":"", "Drafted
Reply":"", "Reply Status":"",
"Sentiment":"Negative", "Category":"Services", "Severity":"High",
"Possible Root Cause":"Understaffed during lunch peak",
"Root Cause Confidence":"Medium", "Responsible":"Outlet Manager", "Sales
Recovery":"Contact Customer",
"Action Plan":"Review lunch staffing roster", "Recommended
Timeline":"2026-05-31", "Status":"In Progress",
"Management Notes":"", "Last Updated":"", "Concern Review":"Yes",
};
return Papa.unparse({ fields:headers,
data:[headers.map(h=>example[h]??"")] }, {quotes:true});
}
function SAMPLE_OBJECTS() {
// keyed by canonical field key — order-independent, blanks auto-filled
return [
{outlet:"Ma Maison Pavilion",reviewer:"Jane
Tan",reviewDate:"2026-05-14",rating:"2",originalReview:"Service was slow
and the tonkatsu was cold when it
arrived.",originalLanguage:"English",sentiment:"Negative",category:"Services",severity:"High",responsible:"Requires
Assignment",status:"Not Started",concernReview:"Yes"},
{outlet:"Ma Maison Pavilion",reviewer:"佐藤
健",reviewDate:"2026-05-20",rating:"1",originalReview:"とんかつが冷めていて、店員の対応も悪かった。",originalLanguage:"Japanese",englishTranslation:"The
tonkatsu was cold and the staff attitude was
poor.",sentiment:"Negative",category:"Food
Quality",severity:"Critical",responsible:"Kitchen
Manager",recommendedTimeline:"2026-05-28",status:"In
Progress",concernReview:"Yes"},
{outlet:"Ma Maison Pavilion",reviewer:"David
Lee",reviewDate:"2026-06-02",rating:"5",originalReview:"Excellent katsu
curry, very crispy. Will come
again!",originalLanguage:"English",existingReply:"Thank you for your
kind words, we hope to see you
soon!",replyStatus:"Published",sentiment:"Positive",severity:"Low",status:"Closed",concernReview:"No"},
{outlet:"Ma Maison
Gardens",reviewer:"陈美玲",reviewDate:"2026-06-08",rating:"2",originalReview:"价格偏贵，份量也变少了。",originalLanguage:"Chinese",englishTranslation:"The
price is on the high side and portions have gotten
smaller.",sentiment:"Negative",category:"Price",severity:"Medium",responsible:"Requires
Assignment",status:"Not Started",concernReview:"Yes"},
{outlet:"Ma Maison Gardens",reviewer:"Sarah
Wong",reviewDate:"2026-06-15",rating:"3",originalReview:"Food was okay
but the table was a bit
sticky.",originalLanguage:"English",sentiment:"Neutral",category:"Cleanliness",severity:"Low-Medium",responsible:"Front-of-House
Manager",actionPlan:"Wipe-down checklist
added",recommendedTimeline:"2026-06-25",status:"Completed",managementNotes:"Cleaning
checklist implemented and verified.",concernReview:"No"},
{outlet:"Ma Maison Gardens",reviewer:"山田
花子",reviewDate:"2026-06-21",rating:"1",originalReview:"注文を間違えられ、謝罪もなかった。二度と行かない。",originalLanguage:"Japanese",englishTranslation:"They
got my order wrong and did not even apologise. Never
again.",sentiment:"Negative",category:"Services",severity:"Critical",responsible:"Requires
Assignment",status:"Not Started",concernReview:"Yes"},
{outlet:"Ma Maison Riverside",reviewer:"Ahmad
Faizal",reviewDate:"2026-05-30",rating:"4",originalReview:"Good ambience
and tasty ramen, slightly long
wait.",originalLanguage:"English",existingReply:"We appreciate your
feedback and are working on wait
times.",replyStatus:"Published",sentiment:"Positive",severity:"Low",status:"Closed",concernReview:"No"},
{outlet:"Ma Maison Riverside",reviewer:"Michelle
Koh",reviewDate:"2026-06-11",rating:"2",originalReview:"The chicken
katsu tasted off, I think it was not
fresh.",originalLanguage:"English",sentiment:"Negative",category:"Food
Standard",severity:"High",responsible:"Kitchen
Manager",recommendedTimeline:"2026-06-20",status:"Pending
Verification",concernReview:"Yes"},
{outlet:"Ma Maison
Riverside",reviewer:"김민준",reviewDate:"2026-06-18",rating:"2",originalReview:"돈카츠가
기름지고 반찬이
부족했어요.",originalLanguage:"Korean",englishTranslation:"The tonkatsu
was greasy and the side dishes were
insufficient.",sentiment:"Negative",category:"Food
Quality",severity:"Medium",responsible:"Requires Assignment",status:"Not
Started",concernReview:"Yes"},
{outlet:"Ma Maison Pavilion",reviewer:"Grace
Lim",reviewDate:"2026-07-01",rating:"5",originalReview:"Best Japanese
comfort food in town, staff very
warm.",originalLanguage:"English",sentiment:"Positive",severity:"Low",concernReview:"No"},
{outlet:"Ma Maison Gardens",reviewer:"Kenji
Watanabe",reviewDate:"2026-07-03",rating:"3",originalReview:"Portion
fine but a bit oily
today.",originalLanguage:"English",sentiment:"Neutral",category:"Food
Quality",severity:"Low-Medium",responsible:"Kitchen Manager",status:"Not
Started",concernReview:"No"},
{outlet:"Ma Maison Riverside",reviewer:"Nurul
Aina",reviewDate:"2026-07-05",rating:"1",originalReview:"Waited 45
minutes and food came wrong. Very
disappointed.",originalLanguage:"English",sentiment:"Negative",category:"Services",severity:"Critical",responsible:"Requires
Assignment",recommendedTimeline:"2026-07-12",status:"Not
Started",concernReview:"Yes"},
{outlet:"Ma Maison
Pavilion",reviewer:"王伟",reviewDate:"2026-07-07",rating:"2",originalReview:"环境有点脏，桌子没擦干净。",originalLanguage:"Chinese",englishTranslation:"The
environment was a bit dirty, the table was not wiped
clean.",sentiment:"Negative",category:"Cleanliness",severity:"High",responsible:"Front-of-House
Manager",recommendedTimeline:"2026-07-15",status:"In
Progress",concernReview:"Yes"},
{outlet:"Ma Maison Gardens",reviewer:"Priya
Nair",reviewDate:"2026-06-28",rating:"4",originalReview:"Lovely set
lunch, good
value.",originalLanguage:"English",sentiment:"Positive",severity:"Low",concernReview:"No"},
{outlet:"Ma Maison Riverside",reviewer:"Tan Boon
Huat",reviewDate:"2026-06-25",rating:"2",originalReview:"Prices went up
again but quality
dropped.",originalLanguage:"English",sentiment:"Negative",category:"Price",severity:"Medium",responsible:"Requires
Assignment",status:"Not Started",concernReview:"Yes"},
];
}
function SAMPLE_RECORDS() {
return SAMPLE_OBJECTS().map(obj=>{
const rec = blankRecord();
Object.keys(obj).forEach(k=>{ if(k in rec) rec[k]=obj[k]; });
rec.reviewDate = parseDateISO(rec.reviewDate);
if (!rec.originalLanguage) rec.originalLanguage =
detectLanguage(rec.originalReview);
rec.reviewID = stableId(rec);
rec._orig = { Outlet:rec.outlet, Reviewer:rec.reviewer, "Review
Date":rec.reviewDate, Rating:rec.rating, "Original
Review":rec.originalReview };
return rec;
});
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>
