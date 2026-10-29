// ---- Parsing & matching (shared by the app and the seeding script) ----
const LEVELS = ['newcomer','bronze','silver','gold','syllabus','novice','pre-champ','prechamp','championship','open'];
const ROUNDS = [['1st round',1],['first round',1],['second round',2],['2nd round',2],['quarter',3],['semi-final',4],['semi final',4],['semifinal',4],['final',5]];
const ROUND_LABEL = {1:'1st Round',2:'2nd Round',3:'Quarter',4:'Semi',5:'Final'};

function parseClock(t){
  const m = /(\d{1,2}):(\d{2})\s*([AP])\.?M/i.exec(t||'');
  if(!m) return null;
  let h = (+m[1]) % 12; if(m[3].toUpperCase()==='P') h += 12;
  return h*60 + (+m[2]);
}
function fmtClock(min){
  if(min==null || isNaN(min)) return '';
  min = Math.round(min); min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min/60), m = min%60;
  return ((h%12)||12) + ':' + String(m).padStart(2,'0') + ' ' + (h<12?'AM':'PM');
}
function styleOf(text){
  const s = ' ' + text.toLowerCase().replace(/[.,]/g,' ') + ' ';
  const amer = /\s(amer|american|a)\s/.test(s), intl = /\s(intl|international|i)\s/.test(s);
  const latinish = /\s(cha|rumba|swing|bolero|mambo|rhythm|samba|jive|paso|latin)\s/.test(s);
  if(amer) return latinish ? 'rhythm' : 'smooth';
  if(intl) return latinish ? 'latin' : 'standard';
  if(/\s(swing|bolero|mambo|rhythm)\s/.test(s)) return 'rhythm';
  if(/\s(jive|samba|paso|latin)\s/.test(s)) return 'latin';
  if(/\s(smooth)\s/.test(s)) return 'smooth';
  if(/\s(standard|quickstep)\s/.test(s)) return 'standard';
  return 'other';
}
function parseHeatName(name){
  const low = name.toLowerCase();
  let rank = 5, roundTxt = null;
  for(const [r,k] of ROUNDS){ if(low.includes(r)){ rank = k; roundTxt = r; break; } }
  let base = name;
  if(roundTxt){ const i = low.indexOf(roundTxt); base = name.slice(0,i) + name.slice(i+roundTxt.length); }
  base = base.replace(/\s+/g,' ').trim();
  const dm = /\(([A-Za-z]+)\)/.exec(name);
  return { base, rank, single: !roundTxt, dances: dm ? dm[1].toUpperCase() : '', style: styleOf(name) };
}
function parseSchedule(text){
  const out = []; let n = 0;
  const lines = [];
  for(const raw of (text||'').split(/\r?\n/)) for(const piece of raw.split(/(?=\b\d{1,2}:\d{2}\s*[AP]\.?M\b)/i)) lines.push(piece);
  for(let raw of lines){
    let line = raw.trim().replace(/\s+\d+(st|nd|rd|th)\s+Annual.*$/i,'').trim();
    if(!line) continue;
    let m = /^(\d{1,2}:\d{2}\s*[AP]\.?M\.?)\s+\[(\d+)\]\s+(.+)$/i.exec(line);
    if(m){ out.push({ id:'h'+(++n)+'_'+Math.random().toString(36).slice(2,6), t:m[1].toUpperCase().replace(/\s+/,' '), ev:+m[2], name:m[3].trim() }); continue; }
    m = /^(\d{1,2}:\d{2}\s*[AP]\.?M\.?)\s+(.+)$/i.exec(line);
    if(m){ out.push({ id:'b'+(++n)+'_'+Math.random().toString(36).slice(2,6), t:m[1].toUpperCase(), label:m[2].trim() }); }
  }
  // Text copied from a two-column PDF comes out interleaved; put it back in time order.
  const body = out.filter(h => !/sunday/i.test(h.label||'')), tail = out.filter(h => /sunday/i.test(h.label||''));
  let backwards = false;
  for(let i=1;i<body.length;i++) if(parseClock(body[i].t) < parseClock(body[i-1].t)) { backwards = true; break; }
  if(backwards) body.sort((a,b)=>parseClock(a.t)-parseClock(b.t));
  return body.concat(tail);
}

const SPLIT_LEVELS = /^((?:Newcomer|Bronze|Silver|Gold|Novice|Pre-Champ|Championship)(?:\s*,\s*(?:Newcomer|Bronze|Silver|Gold|Novice|Pre-Champ|Championship))*)\s+(?=\S)/i;
function takeName(tokens){
  let name = tokens.shift() || '';
  while(tokens.length && /^\(.*\)$/.test(tokens[0])) name += ' ' + tokens.shift();
  return name;
}
function parseEntries(text){
  const couples = [];
  for(let raw of (text||'').split(/\r?\n/)){
    const line = raw.trim();
    if(!line || /^lead\b/i.test(line) || /spreadsheet$/i.test(line)) continue;
    let lead, follow, rest;
    if(line.includes('\t')){
      const cols = line.split('\t').map(s=>s.trim());
      [lead, follow] = cols; rest = cols.slice(3).join(', ') || cols[2] || '';
    } else {
      const toks = line.split(/\s+/);
      lead = takeName(toks); follow = takeName(toks);
      rest = toks.join(' ').replace(SPLIT_LEVELS,'');
    }
    const events = rest.split(/\s*,\s*/).map(s=>s.trim()).filter(Boolean);
    if(!lead || !events.length) continue;
    couples.push({ id:'c'+(couples.length+1)+'_'+Math.random().toString(36).slice(2,6), lead, follow: follow||'TBA', events, manual:[] });
  }
  return couples;
}

function tokenize(str){
  let s = ' ' + str.toLowerCase() + ' ';
  const dm = /\(([a-z]+)\)/.exec(s);
  const dances = dm ? dm[1].toUpperCase().split('').sort().join('') : '';
  s = s.replace(/\([^)]*\)/g,' ').replace(/\ba\.\s/g,' amer ').replace(/\bi\.\s/g,' intl ')
       .replace(/\bamerican\b/g,'amer').replace(/\binternational\b/g,'intl')
       .replace(/\bv\.?\s*waltz\b/g,' vwaltz ').replace(/\bviennese waltz\b/g,' vwaltz ')
       .replace(/\bpre-champ\b/g,'prechamp').replace(/\b(1st round|second round|2nd round|quarter|semi-final|final)\b/g,' ')
       .replace(/[^a-z0-9 ]/g,' ');
  const words = s.split(/\s+/).filter(Boolean);
  const level = LEVELS.includes(words[0]) ? words.shift() : '';
  return { level, words: new Set(words), dances };
}
// events: Map evNum -> {base,...}. Returns evNum or null.
function matchEntry(entry, eventsByNum){
  const e = tokenize(entry);
  let best = null, bestExtra = 1e9;
  for(const [num, ev] of eventsByNum){
    const t = ev._tok || (ev._tok = tokenize(ev.base));
    if(t.level !== e.level) continue;
    if(e.dances && t.dances !== e.dances) continue;
    if(!e.dances && t.dances && t.dances.length > 1) continue;
    let ok = true; for(const w of e.words) if(!t.words.has(w)){ ok = false; break; }
    if(!ok) continue;
    const extra = t.words.size - e.words.size;
    if(extra < bestExtra){ best = num; bestExtra = extra; }
  }
  return best;
}
function eventsFromSchedule(heats){
  const m = new Map();
  for(const h of heats){ if(h.ev==null) continue; if(!m.has(h.ev)){ const p = parseHeatName(h.name); m.set(h.ev, { num:h.ev, base:p.base, style:p.style, dances:p.dances }); } }
  return m;
}
if(typeof module !== 'undefined') module.exports = { parseClock, fmtClock, parseSchedule, parseEntries, parseHeatName, matchEntry, eventsFromSchedule, styleOf };
