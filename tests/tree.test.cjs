const fs=require('fs'),vm=require('vm');
class CL {constructor(){this.s=new Set()} add(...x){x.forEach(t=>this.s.add(t))} remove(...x){x.forEach(t=>this.s.delete(t))} toggle(x,on){if(on===undefined)on=!this.s.has(x);on?this.s.add(x):this.s.delete(x)} contains(x){return this.s.has(x)}}
class E {constructor(tag){this.tag=tag;this.style={};this.children=[];this.attrs={};this.handlers={};this.clientWidth=1000;this.clientHeight=560;this.scrollLeft=0;this.scrollTop=0;this.classList=new CL();this.namespaceURI='http://www.w3.org/2000/svg'}setAttribute(k,v){this.attrs[k]=v}append(...v){this.children.push(...v)}replaceChildren(...v){this.children=[...v]}addEventListener(k,f){this.handlers[k]=f}showModal(){this.open=true}close(){this.open=false}getBoundingClientRect(){return{left:0,top:0}}setPointerCapture(){}}
const roots={},warnings=[],document={handlers:{},addEventListener(k,f){(this.handlers[k]??=[]).push(f)},querySelector:s=>roots[s]??=new E('root'),createElement:t=>new E(t),createElementNS:(ns,t)=>new E(t)},file=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');let ctx={document,console:{warn:(...x)=>warnings.push(x.join(' ')),log:console.log},Uint8Array,Float64Array,Int32Array};vm.createContext(ctx);vm.runInContext(file.match(/<script>([\s\S]*?)<\/script>/)[1],ctx,{timeout:30000});
const charts=vm.runInContext('charts',ctx),graph=vm.runInContext('graphEdges',ctx),route=vm.runInContext('routeEdge',ctx),births=vm.runInContext('births',ctx);
const {NODE_W,NODE_H,PORTRAIT,PORTRAIT_INSET}=vm.runInContext('({NODE_W,NODE_H,PORTRAIT,PORTRAIT_INSET})',ctx);
if(NODE_W!==196||NODE_H!==220||PORTRAIT!==150||PORTRAIT_INSET!==23)throw Error('The portrait card geometry differs from the agreed layout');
function walk(e){return [e,...e.children.flatMap(walk)]}
// The enlarged trees should open on people rather than on empty canvas.
for(const chart of charts){
 const subtree=walk(roots['#chart-'+chart.id]),view=subtree.find(e=>e.className==='viewport'),output=subtree.find(e=>e.tag==='output'),scale=parseFloat(output.textContent)/100;
 const visible=chart.nodes.some(n=>{const left=(n.x+PORTRAIT_INSET)*scale,right=left+PORTRAIT*scale,top=n.y*scale,bottom=top+PORTRAIT*scale;return right>view.scrollLeft&&left<view.scrollLeft+view.clientWidth&&bottom>view.scrollTop&&top<view.scrollTop+view.clientHeight});
 if(!visible)throw Error(`${chart.id}: initial viewport contains no portrait`);
 if(chart.id==='family'&&scale!==.8)throw Error('The main family tree should initially open at 80%');
}
function cardBoxes(n){return [{left:n.x+PORTRAIT_INSET,right:n.x+PORTRAIT_INSET+PORTRAIT,top:n.y,bottom:n.y+PORTRAIT},{left:n.x,right:n.x+NODE_W,top:n.y+PORTRAIT+5,bottom:n.y+NODE_H}];}
function checkPath(points,nodes,a,b){for(let i=1;i<points.length;i++){let [x1,y1]=points[i-1],[x2,y2]=points[i];if(x1!==x2&&y1!==y2)throw Error('diagonal path');for(const n of nodes)for(const {left,right,top,bottom} of cardBoxes(n)){const hits=x1===x2 ? x1>left&&x1<right&&Math.max(y1,y2)>top&&Math.min(y1,y2)<bottom : y1>top&&y1<bottom&&Math.max(x1,x2)>left&&Math.min(x1,x2)<right;if(hits)throw Error(`${a} -> ${b} crosses ${n.id} (${x1},${y1})-(${x2},${y2})`)}}}
for(const c of charts){const ids=new Set(c.nodes.map(x=>x.id));if(ids.size!==c.nodes.length)throw Error('duplicates');const edges=graph(c),occ=new Map(),ports=vm.runInContext('edgePorts',ctx)(edges,Object.fromEntries(c.nodes.map(n=>[n.id,n])));let missing=0;for(const e of edges){if(!ids.has(e.a)||!ids.has(e.b))throw Error('unknown person');let p=route(c.nodes.find(n=>n.id===e.a),c.nodes.find(n=>n.id===e.b),c.nodes,c.w,c.h,occ,ports[edges.indexOf(e)]);if(!p){missing++;continue}checkPath(p,c.nodes,e.a,e.b)}const all=walk(roots['#chart-'+c.id]);const cards=all.filter(e=>e.tag==='button' && e.className && String(e.className).startsWith('node '));if(cards.length!==c.nodes.length)throw Error('bad node count');cards[0].handlers.click();const panel=all.find(e=>e.className==='selection-panel');if(!panel.children.some(e=>e.tag==='strong'))throw Error('selection not shown');const details=panel.children.find(e=>e.textContent==='Подробнее');details.handlers.click();if(!roots['#person-dialog'].open)throw Error('details');const controls=all.filter(e=>e.tag==='button'&&e.attrs['aria-label']==='Увеличить масштаб');if(controls.length!==1)throw Error('zoom');controls[0].handlers.click();console.log(c.id, 'people',ids.size,'edges',edges.length,'failed',missing,'birth years',Object.keys(births[c.id]).length);if(missing)throw Error('missing route');}
if(warnings.length)throw Error(warnings.join('\n'));
const marriedPairs=vm.runInContext('marriedPairs',ctx);
for(const c of charts){
 const edges=graph(c),elements=walk(roots['#chart-'+c.id]).filter(e=>e.classList.contains('edge'));
 for(const [a,b] of marriedPairs[c.id]||[]){
  const matches=edges.map((e,i)=>({e,i})).filter(({e})=>e.spouse&&((e.a===a&&e.b===b)||(e.a===b&&e.b===a)));
  const name=id=>c.nodes.find(n=>n.id===id).name;
  const visible=elements.filter(g=>g.classList.contains('edge-spouse')&&g.children.some(hit=>hit.attrs['aria-label']?.startsWith(`${name(a)} — ${name(b)}:`)));
  if(matches.length!==1||visible.length!==1)throw Error(`Spouse connection missing or duplicated: ${c.id} ${a} ${b}`);
 }
 if(edges.some(e=>e.spouse&&!(marriedPairs[c.id]||[]).some(([a,b])=>a===e.a&&b===e.b||a===e.b&&b===e.a)))throw Error('Unverified spouse connection');
}
const boykoAdopters=graph(charts.find(c=>c.id==='boyko')).find(e=>e.a==='alex'&&e.b==='nina');
if(!boykoAdopters?.spouse)throw Error('The family account identifies Alexey and Nina as spouses');
const boykoEdges=graph(charts.find(c=>c.id==='boyko'));
for(const parent of ['alex','nina'])if(!boykoEdges.some(e=>e.a===parent&&e.b==='ser2'&&e.kind==='blue'&&e.label==='усыновление'))throw Error('The adoption must remain distinct from the marriage');
const adoptionAlone=graph({id:'no-marriage-evidence',groups:[{parents:['a','b'],children:['c'],kind:'blue',label:'усыновление'}]});
const unprovenUnion=adoptionAlone.find(e=>e.a==='a'&&e.b==='b');
if(!unprovenUnion||unprovenUnion.spouse||unprovenUnion.kind!=='blue')throw Error('Joint adoption alone must not imply marriage');
// A family line is a continuous route from the parents' union to each actual child.
const familyRoutes=vm.runInContext('familyRoutes',ctx);
for(const c of charts){
 const map=Object.fromEntries(c.nodes.map(n=>[n.id,n])),routes=familyRoutes(c,map);
 for(const f of routes){
  const [a,b]=f.parents.map(id=>map[id]),[first,last]=[f.stem[0],f.stem.at(-1)];
  if(b){const left=a.x<b.x?a:b,right=left===a?b:a;
   if(f.anchor[0]<left.x+PORTRAIT_INSET+PORTRAIT||f.anchor[0]>right.x+PORTRAIT_INSET||f.anchor[1]!==left.y+PORTRAIT/2)throw Error(`${c.id}: family trunk must start on the parents' union`);
   if(first[0]!==f.anchor[0]||first[1]!==f.anchor[1])throw Error(`${c.id}: detached family stem`);
  }else if(![a.x+PORTRAIT_INSET,a.x+PORTRAIT_INSET+PORTRAIT].includes(first[0])||first[1]<=a.y||first[1]>=a.y+PORTRAIT||first[1]===a.y+PORTRAIT/2||last[0]!==f.anchor[0])throw Error(`${c.id}: single-parent trunk must start separately from the spouse line and reach the bus`);
  checkPath(f.stem,c.nodes,f.parents.join('+'),'family stem');
  const bus=f.bus.map(s=>s.points).sort((x,y)=>x[0][0]-y[0][0]);
  const targetIds=f.branches.map(b=>b.child);
  if(new Set(targetIds).size!==f.children.length||f.children.some(id=>!targetIds.includes(id)))throw Error(`${c.id}: each child needs exactly one family branch`);
  for(const branch of f.branches){
   const child=map[branch.child],start=branch.points[0],end=branch.points.at(-1);
   const validEnd=f.sidePort?([child.x+PORTRAIT_INSET,child.x+PORTRAIT_INSET+PORTRAIT].includes(end[0])&&end[1]===child.y+PORTRAIT/2):(end[0]>=child.x+PORTRAIT_INSET&&end[0]<=child.x+PORTRAIT_INSET+PORTRAIT&&end[1]===child.y);
   if(start[1]!==last[1]||!validEnd)throw Error(`${c.id}: disconnected child branch ${branch.child}`);
   let reached=Math.min(last[0],start[0]);const target=Math.max(last[0],start[0]);
   for(const segment of bus){if(segment[0][1]!==last[1]||segment[1][1]!==last[1])throw Error(`${c.id}: bus height mismatch`);if(segment[0][0]<=reached&&segment[1][0]>reached)reached=segment[1][0]}
   if(reached<target)throw Error(`${c.id}: bus does not connect to ${branch.child}`);
   checkPath(branch.points,c.nodes,f.parents.join('+'),branch.child);
  }
  for(const segment of bus)checkPath(segment,c.nodes,f.parents.join('+'),'family bus');
 }
}
const boykoChart=charts.find(c=>c.id==='boyko'),boykoFamily=familyRoutes(boykoChart,Object.fromEntries(boykoChart.nodes.map(n=>[n.id,n]))).find(f=>f.label==='усыновление');
if(!boykoFamily?.sidePort||boykoFamily.kind!=='blue'||boykoFamily.branches[0]?.child!=='ser2')throw Error('The adoptive line must reach Sergey separately from his biological mother');
const familyRoutesMain=familyRoutes(charts.find(c=>c.id==='family'),Object.fromEntries(charts.find(c=>c.id==='family').nodes.map(n=>[n.id,n])));
// The paternal branch keeps the two Maxims and two Svetas distinct and connects each generation.
const khramovChart=charts.find(c=>c.id==='khramov'),khramovEdges=graph(khramovChart);
// Keep siblings and their households close enough to read as one family.
const khramovNodes=Object.fromEntries(khramovChart.nodes.map(n=>[n.id,n]));
const siblingGaps=['sk','sv_k','and','max_young'].slice(1).map((id,i)=>khramovNodes[id].x-khramovNodes[['sk','sv_k','and'][i]].x);
if(Math.max(...siblingGaps)>600||Math.max(...siblingGaps)>Math.min(...siblingGaps)*1.5||khramovChart.w>2800)throw Error('Paternal sibling groups should be compact and evenly spaced');
for(let i=0;i<khramovChart.nodes.length;i++)for(let j=i+1;j<khramovChart.nodes.length;j++)for(const a of cardBoxes(khramovChart.nodes[i]))for(const b of cardBoxes(khramovChart.nodes[j])){
 if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)throw Error(`Paternal cards overlap: ${khramovChart.nodes[i].id} and ${khramovChart.nodes[j].id}`);
}
for(const [parent,child] of [['max_old','nik'],['nik','and'],['kat','and'],['nik','sk'],['kat','sv_k'],['nik','max_young'],['sk','liza'],['sk','slava'],['max_young','sv_max'],['max_young','nik_max'],['and','you'],['slava','bogdan']]){
 if(!khramovEdges.some(e=>e.a===parent&&e.b===child))throw Error(`Missing paternal family relationship: ${parent} -> ${child}`);
}
if(!births.khramov.nik[0].includes('1941')||!births.khramov.nik[0].includes('1942')||!khramovChart.nodes.find(n=>n.id==='nik').info.includes('1941')||births.khramov.kat[0]!=='23.02.1947')throw Error('Family-reported dates and grandfather birth-year discrepancy must be preserved');
if(births.khramov.and[0]!=='11.07.1974 — 02.08.2015'||births.khramov.you[0]!=='03.03.1997'||!khramovChart.nodes.find(n=>n.id==='and').info.includes('2017'))throw Error('Confirmed father and user dates or conflict are missing');
for(const [parent,child] of [['marina_b','liza'],['marina_b','slava'],['olga_h','sv_max'],['olga_h','nik_max'],['marina_s','sv_max'],['marina_s','nik_max']])if(khramovEdges.some(e=>e.a===parent&&e.b===child))throw Error(`Do not infer an unconfirmed parent: ${parent} -> ${child}`);
const khramovTimeline=walk(roots['#chart-khramov']).find(e=>e.className==='timeline-list');
const grandfatherTimeline=khramovTimeline.children.find(e=>e.children.some(child=>child.textContent==='Николай Максимович Храмов'));
if(grandfatherTimeline?.children[0]?.textContent!=='1942?')throw Error('A disputed birth year must remain visibly uncertain on the timeline');
if(births.khramov.marina_b[1]!==null||khramovTimeline.children.some(e=>e.children.some(child=>child.textContent==='Марина Геннадьевна Бондаренко')))throw Error('Incomplete birth year must not appear as a known timeline year');
if(births.khramov.nik_max?.[0]!=='11.08.2026'||khramovChart.nodes.find(n=>n.id==='nik_max')===khramovChart.nodes.find(n=>n.id==='nik'))throw Error('The new Nikolai must remain distinct from his grandfather');
if(khramovChart.nodes.find(n=>n.id==='sv_k')===khramovChart.nodes.find(n=>n.id==='sv_max'))throw Error('Different Svetas must remain distinct');
const fetisovFamily=familyRoutesMain.filter(f=>f.parents.includes('tan')&&f.parents.includes('val'));
if(fetisovFamily.length!==1||['ol','ilya','svetlana','ser_fet'].some(id=>!fetisovFamily[0].children.includes(id)))throw Error('Tatiana and Valentin need one shared branch for all four children');
const byParents=(a,b)=>familyRoutesMain.find(f=>f.parents.includes(a)&&f.parents.includes(b));
if(!byParents('and','ol')?.children.includes('you')||byParents('and','ol')?.children.includes('nast')||!byParents('ol','ser')?.children.includes('nast')||byParents('ol','ser')?.children.includes('you'))throw Error('Children of different partnerships must remain separate');
for(const [p1,p2,child] of [['and','ol','you'],['ol','ser','nast']]){const f=byParents(p1,p2),node=charts.find(c=>c.id==='family').nodes.find(n=>n.id===child);if(Math.abs(f.anchor[0]-(node.x+NODE_W/2))>.01||f.bus.length)throw Error('Child must be centered under their own parents with a straight shared branch: '+child)}
const adoption=graph(charts.find(c=>c.id==='family')).find(e=>e.a==='ser'&&e.b==='you');
if(!adoption||adoption.kind!=='blue'||adoption.label!=='усыновление')throw Error('Separate adoption must remain blue and labelled');
const archive=charts.find(c=>c.id==='nikiforov'),archiveRoutes=familyRoutes(archive,Object.fromEntries(archive.nodes.map(n=>[n.id,n])));
if(!archiveRoutes.some(f=>f.kind==='red'&&f.children.includes('stef'))||archiveRoutes.some(f=>f.parents.includes('d1909')&&f.parents.includes('a1909')))throw Error('Uncertain family and godparent relationships must stay distinct');
const nikiforovEdges=graph(archive);
if(!nikiforovEdges.some(e=>e.a==='ef_mar93'&&e.b==='ak_mar93'&&e.spouse))throw Error('The 1893 marriage must be represented as a documented union');
for(const [marriagePerson,parentOfTwins] of [['ef_mar93','ef2'],['ak_mar93','ak2']]){
 const possibleIdentity=nikiforovEdges.find(e=>e.a===marriagePerson&&e.b===parentOfTwins);
 if(!possibleIdentity||possibleIdentity.kind!=='red'||possibleIdentity.label!=='возможно один человек')throw Error('The 1893 and 1909 identities must remain explicitly unconfirmed');
 if(nikiforovEdges.some(e=>e.a===marriagePerson&&['d1909','a1909'].includes(e.b)))throw Error('The 1893 marriage cannot be treated as proven parentage of the 1909 twins');
}
if(!['fed_tuev','evd_tuev'].every(parent=>nikiforovEdges.some(e=>e.a===parent&&e.b==='ak_baby74'))||!nikiforovEdges.some(e=>e.a==='ak_mar93'&&e.b==='ak_baby74'&&e.kind==='red'&&e.label==='возможно один человек'))throw Error('The 1874 family must be documented separately and its identity with the 1893 bride remain unconfirmed');
if(!archiveRoutes.some(f=>f.kind==='red'&&f.children.includes('anast94')))throw Error('The 1894 child must remain an unconfirmed match to the 1909 parents');
if(births.nikiforov.ak_baby74?.[0]!=='04.06.1874 · ст. стиль')throw Error('The 1874 birth must retain the calendar of the original record');
const leviny=charts.find(c=>c.id==='leviny'),levinyEdges=graph(leviny);
for(const [parent,child] of [['geo16','feo16'],['aga16','feo16'],['geo17','ol17'],['aga17','ol17']])if(!levinyEdges.some(e=>e.a===parent&&e.b===child))throw Error('Missing documented parent in the Levin records: '+parent+' '+child);
for(const [parent,child] of [['geo16','ol17'],['aga16','ol17'],['geo17','feo16'],['aga17','feo16']])if(levinyEdges.some(e=>e.a===parent&&e.b===child))throw Error('The two Levin families must not be merged without proof');
for(const [child,witness] of [['feo16','tik16'],['feo16','evd16'],['ol17','nik17']])if(!levinyEdges.some(e=>e.a===child&&e.b===witness&&e.kind==='blue'))throw Error('A godparent must be represented separately in the archive chart');
for(const [a,b] of [['aga16','ref12'],['ref12','aga17'],['nik17','ref05']])if(!levinyEdges.some(e=>e.a===a&&e.b===b&&e.kind==='red'&&e.label==='возможно один человек'))throw Error('A possible namesake match must remain uncertain');
if(levinyEdges.some(e=>e.spouse)||!leviny.nodes.find(n=>n.id==='ol17')?.info.includes('по карточке'))throw Error('A marriage or an OCR reading cannot become established facts');
const gedcom=fs.readFileSync(require('path').join(__dirname,'..','semeinoe-drevo.ged'),'utf8');
const gedRecords=new Map([...gedcom.matchAll(/^0 (@[^@]+@) (INDI|FAM|SOUR)\r?\n([\s\S]*?)(?=^0 |(?![\s\S]))/gm)].map(m=>[m[1],m[3]]));
for(const match of gedcom.matchAll(/^\d+ (?:SOUR|FAMS|FAMC|HUSB|WIFE|CHIL|ASSO) (@[^@]+@)\s*$/gm))if(!gedRecords.has(match[1]))throw Error('Dangling GEDCOM reference: '+match[1]);
const weddingGed=gedRecords.get('@F_nik93@'),twinsGed=gedRecords.get('@F_nik09@');
const petrGed=gedRecords.get('@I_petr_nikitin_1896@');
if(!petrGed?.includes('1 SOUR @S18@')||/^1 FAM[CS] /m.test(petrGed)||!petrGed.includes('Родство с семейными Периковыми не установлено'))throw Error('The 1896 namesake must stay separate and cite the transcription');
const sistersGed=gedRecords.get('@F_popova_siblings@');
if(!['@I_nin@','@I_lud@'].every(id=>sistersGed?.includes('1 CHIL '+id)&&gedRecords.get(id)?.includes('1 FAMC @F_popova_siblings@'))||/^1 (?:HUSB|WIFE) /m.test(sistersGed||''))throw Error('The reported sisters must share a family without inventing their parents');
for(const id of ['@F_n3@','@F_n6@','@F_n8@','@F_n11@','@F_n12@'])if(!gedRecords.get(id)?.includes('1 MARR\n2 SOUR @S1@'))throw Error('A reported marriage must be exported with its family source: '+id);
if(!gedRecords.get('@F_khr2@')?.includes('1 MARR\n2 SOUR @S12@'))throw Error('Nikolai and Ekaterina’s marriage must cite the family table');
if(!gedRecords.get('@I_nikolai_m@')?.includes('2 NOTE Ранее в семейном сообщении указано 15.11.1941'))throw Error('The competing birth year must accompany the birth event in GEDCOM');
for(const id of ['@F_n1@','@F_n2@'])if(gedRecords.get(id)?.includes('1 MARR'))throw Error('A marriage must not be inferred solely from parenthood: '+id);
if(!gedRecords.get('@I_du@')?.includes('1 NAME Евдокия Ефимовна /Никифорова/')||gedRecords.get('@I_du@')?.includes('1 BIRT'))throw Error('Family patronymic must be kept without adopting the incorrect birth date');
if(!gedRecords.get('@I_val@')?.includes('1 NAME Валентин /Фетисов/')||!gedRecords.get('@I_val@')?.includes('1 NAME Валентин /Фитисов/'))throw Error('Both family surname spellings must survive GEDCOM export');
for(const [id,name] of [['@I_tam@','Тамара /Васильева/'],['@I_tan@','Татьяна /Фитисова/'],['@I_nast@','Анастасия Сергеевна /Видянова/'],['@I_nin@','Нина Анатольевна /Бойко/']])if(!gedRecords.get(id)?.includes(`1 NAME ${name}\n2 TYPE married\n2 SOUR @S1@`))throw Error('The reported married name must survive export with its source: '+id);
for(const [id,date] of [['@I_tan@','28 MAY 1950'],['@I_ol@','4 AUG 1977'],['@I_sergei@','16 SEP 1973'],['@I_nast@','8 SEP 2002']])if(!gedRecords.get(id)?.includes(`1 BIRT\n2 DATE ${date}\n2 PLAC Орск\n2 SOUR @S1@`))throw Error('A family-reported birthplace must be structured and sourced: '+id);
const valentineGed=gedRecords.get('@I_val@')||'',valentineBirth=valentineGed.match(/1 BIRT\n(?:2 .*\n)*/)?.[0]||'';
if(/2 PLAC /.test(valentineBirth)||!valentineGed.includes('происходил из деревни Долина Юхновского района Калужской области'))throw Error('The family account of origin must not become a claimed birthplace');
if(!gedRecords.get('@F_n11@')?.includes('деревне Покров Московской области')||!gedRecords.get('@F_n11@')?.includes('годы и состав переезжавших неизвестны'))throw Error('The family migration must retain its uncertainty');
const mainFamily=charts.find(c=>c.id==='family');
for(const id of ['tan','ol','ser','nast'])if(!mainFamily.nodes.find(n=>n.id===id)?.info.includes('родил')||!mainFamily.nodes.find(n=>n.id===id)?.info.includes('Орске'))throw Error('The family-reported birthplace must be visible in details: '+id);
if(!mainFamily.nodes.find(n=>n.id==='val')?.info.includes('Юхновского района Калужской области')||!charts.find(c=>c.id==='boyko').nodes.find(n=>n.id==='nina')?.info.includes('состав переезжавших неизвестны'))throw Error('Family-origin details must retain their context and uncertainty');
for(const [fam,husband,wife,child,source] of [['@F_per05@','@I_nik_per05@','@I_nat_per05@',null,'@S23@'],['@F_per09@','@I_nik_per09@','@I_nat_per09@','@I_ant_per09@','@S24@'],['@F_per14@','@I_nik_per14@','@I_nat_per14@','@I_ira_per14@','@S25@']]){
 const record=gedRecords.get(fam)||'';
 if(!record.includes('1 HUSB '+husband)||!record.includes('1 WIFE '+wife)||!record.includes('1 SOUR '+source)||![husband,wife].every(id=>gedRecords.get(id)?.includes('1 FAMS '+fam)))throw Error('The archive couple must remain separately sourced and reciprocal: '+fam);
 if(child?(!record.includes('1 CHIL '+child)||!gedRecords.get(child)?.includes('1 FAMC '+fam)):/^1 CHIL /m.test(record))throw Error('The archival family must not gain an inferred child: '+fam);
 for(const other of ['@I_ivan@','@I_io_per07@','@I_para_per12@'])if(record.includes(other))throw Error('An unproved identity must not merge archive and family records: '+fam);
}
if(!/1 MARR\n2 DATE 1905\n2 SOUR @S23@/.test(gedRecords.get('@F_per05@')||''))throw Error('The 1905 marriage must be exported with its own source');
const antoninaGed=gedRecords.get('@I_ant_per09@')||'',iraidaGed=gedRecords.get('@I_ira_per14@')||'',mother09Ged=gedRecords.get('@I_nat_per09@')||'';
if(!mother09Ged.includes('Иванова')||!mother09Ged.includes('Ермолаевна')||!mother09Ged.includes('требуют проверки')||/^1 NAME .*Ермолаева/m.test(mother09Ged))throw Error('The 1909 mother’s conflicting readings must remain unresolved');
if(!/1 BIRT\n2 DATE 1909\n2 SOUR @S24@/.test(antoninaGed)||!/1 BIRT\n2 DATE 1914\n2 SOUR @S25@/.test(iraidaGed)||/^2 DATE @#DJULIAN@/m.test(antoninaGed+iraidaGed))throw Error('Unverified days of the 1909 and 1914 records must not become exact dates');
for(const [child,witnesses,source] of [[antoninaGed,['@I_ilya_god09@','@I_anast_god09@'],'@S24@'],[iraidaGed,['@I_mih_god14@','@I_eli_god14@'],'@S25@']])for(const id of witnesses)if(!child.includes('1 ASSO '+id)||!gedRecords.get(id)?.includes('1 SOUR '+source)||/^1 FAM[CS] /m.test(gedRecords.get(id)||''))throw Error('Godparents must be retained as sourced associations, not relatives: '+id);
for(const [fam,father,mother,child,source,year,witnesses] of [
 ['@F_lev16@','@I_geo_lev16@','@I_aga_lev16@','@I_feo_lev16@','@S26@','1916',['@I_tik_god16@','@I_evd_god16@']],
 ['@F_lev17@','@I_geo_lev17@','@I_aga_lev17@','@I_ol_lev17@','@S27@','1917',['@I_nik_god17@']]
]){
 const record=gedRecords.get(fam)||'',person=gedRecords.get(child)||'';
 if(!record.includes('1 HUSB '+father)||!record.includes('1 WIFE '+mother)||!record.includes('1 CHIL '+child)||!record.includes('1 SOUR '+source)||/^1 MARR/m.test(record))throw Error('Each Levin record must remain a separate parental family without an invented marriage: '+fam);
 if(![father,mother].every(id=>gedRecords.get(id)?.includes('1 FAMS '+fam))||!person.includes('1 FAMC '+fam)||!person.includes('1 BIRT\n2 DATE '+year+'\n2 SOUR '+source))throw Error('Levin record pointers, birth year, or sources are inconsistent: '+fam);
 if(/^2 DATE @#DJULIAN@/m.test(person))throw Error('A day or month from the Levin record is not verified');
 for(const id of witnesses)if(!person.includes('1 ASSO '+id)||!gedRecords.get(id)?.includes('1 SOUR '+source)||/^1 FAM[CS] /m.test(gedRecords.get(id)||''))throw Error('Godparents must not become relatives in the Levin records: '+id);
}
if(!gedRecords.get('@I_ol_lev17@')?.includes('по карточке распознавания'))throw Error('The 1917 name must be identified as an OCR reading');
const maximGed=gedRecords.get('@I_maxim_h_1906@'),tamaraGed=gedRecords.get('@I_kid@');
if(!/1 BIRT\r?\n2 DATE 1906\r?\n2 SOUR @S7@/.test(maximGed)||!/1 DEAT\r?\n2 DATE 1954\r?\n2 SOUR @S7@/.test(maximGed)||!maximGed.includes('тождество не установлено'))throw Error('Maxim’s family photograph dates and uncertain museum match must remain distinct');
if(!/1 BIRT\r?\n2 DATE ABT 1958\r?\n2 SOUR @S1@/.test(tamaraGed)||!/1 DEAT\r?\n2 DATE ABT 2011\r?\n2 SOUR @S1@/.test(tamaraGed)||births.boyko.kid?.[1]!==null)throw Error('Tamara’s estimated years must remain approximate and outside the exact-year timeline');
if(!weddingGed?.includes('1 HUSB @I_ef93@')||!weddingGed.includes('1 WIFE @I_ak93@')||!weddingGed.includes('2 DATE @#DJULIAN@ 5 NOV 1893')||weddingGed.includes('1 CHIL '))throw Error('The documented 1893 marriage must retain the source calendar without inferred children');
if(!twinsGed?.includes('1 CHIL @I_evd_candidate@')||!twinsGed.includes('1 CHIL @I_ant_candidate@')||twinsGed.includes('1 CHIL @I_du@'))throw Error('The 1909 twins must remain separate from the family member whose identity is unproved');
if(!gedRecords.get('@F_tuev74@')?.includes('1 CHIL @I_ak74@')||!gedRecords.get('@F_nik94@')?.includes('1 CHIL @I_anast94@')||twinsGed.includes('@I_anast94@'))throw Error('The 1874 and 1894 archive families must remain independent');
if(/^1 MARR/m.test(gedRecords.get('@F_tuev74@')||'')||!gedRecords.get('@I_evd_grig@')?.includes('тождество женщин не подтверждены')||/^1 NAME .*Решетова/m.test(gedRecords.get('@I_evd_grig@')||''))throw Error('The 1867 marriage and OCR maiden name must remain unconfirmed leads for the 1874 family');
for(const [id,date] of [['@I_ak74@','4 JUN 1874'],['@I_anast94@','10 DEC 1894']])if(!gedRecords.get(id)?.includes('2 DATE @#DJULIAN@ '+date))throw Error('Archive birth date must retain the source calendar: '+id);
for(const id of ['@I_evd_candidate@','@I_ant_candidate@'])if(!gedRecords.get(id)?.includes('2 DATE @#DJULIAN@ 16 FEB 1909'))throw Error('The twins birth date must retain its source calendar');
console.log('All routes avoid unrelated cards; selection, details, zoom and timelines validated.');
const host=roots['#chart-family'];const all=walk(host),view=all.find(e=>e.className==='viewport'),output=all.find(e=>e.tag==='output');const original=output.textContent;let prevented=false;view.handlers.wheel({ctrlKey:true,metaKey:false,deltaY:-120,clientX:300,clientY:200,preventDefault(){prevented=true}});if(!prevented||output.textContent===original)throw Error('wheel zoom failed');let target={closest:()=>false};view.handlers.pointerdown({button:0,pointerId:1,clientX:200,clientY:200,target});view.handlers.pointerdown({button:0,pointerId:2,clientX:300,clientY:200,target});const beforePinch=output.textContent;view.handlers.pointermove({pointerId:2,clientX:350,clientY:200});if(output.textContent===beforePinch)throw Error('pinch zoom failed');view.handlers.pointerup({pointerId:2});view.handlers.pointerup({pointerId:1});const timeline=all.find(e=>e.className==='timeline-item');timeline.handlers.click();const panel=all.find(e=>e.className==='selection-panel');if(!panel.children.some(e=>e.tag==='strong'))throw Error('timeline focus failed');const edgeHit=all.find(e=>e.classList.contains('link-hit'));edgeHit.handlers.click({stopPropagation(){}});if(!panel.children.some(e=>e.className==='related-list'))throw Error('edge selection failed');console.log('Wheel zoom, pinch, drag, timeline focus and selected relation validated.');

roots['#person-dialog'].close();
const isSelected=()=>panel.children.some(e=>e.tag==='strong');
edgeHit.handlers.click({stopPropagation(){}});document.handlers.keydown.forEach(f=>f({key:'Escape'}));if(isSelected())throw Error('Escape did not clear selection');
edgeHit.handlers.click({stopPropagation(){}});view.handlers.pointerdown({button:0,pointerId:3,clientX:100,clientY:100,target});view.handlers.pointerup({pointerId:3});view.handlers.click({target:{closest:()=>false}});if(isSelected())throw Error('background click did not clear selection');
edgeHit.handlers.click({stopPropagation(){}});view.handlers.pointerdown({button:0,pointerId:4,clientX:100,clientY:100,target});view.handlers.pointermove({pointerId:4,clientX:150,clientY:100});view.handlers.pointerup({pointerId:4});view.handlers.click({target:{closest:()=>false}});if(!isSelected())throw Error('drag cleared selection');
console.log('Escape and background clear selection; dragging preserves selection.');

// Family groups retain the semantic graph, but render a single common trunk and child branches.
document.handlers.keydown.forEach(f=>f({key:'Escape'}));
function card(name){const item=all.find(e=>e.tag==='button' && e.attrs['aria-label']?.startsWith(name+','));if(!item)throw Error('Missing card '+name);return item}
const familyChart=charts.find(c=>c.id==='family'),familyEdges=graph(familyChart);
for(const child of ['konst_an','oleg_an'])if(!familyEdges.some(e=>e.a==='an'&&e.b===child))throw Error(`Missing Anatoly's child: ${child}`);
if(births.family.konst_an?.[0]!=='11.10.1960'||births.family.oleg_an)throw Error('Children of Anatoly have incorrect birth dates');
for(let i=0;i<familyChart.nodes.length;i++)for(let j=i+1;j<familyChart.nodes.length;j++){
 const a=familyChart.nodes[i],b=familyChart.nodes[j];
 if(a.x<b.x+NODE_W&&a.x+NODE_W>b.x&&a.y<b.y+NODE_H&&a.y+NODE_H>b.y)throw Error(`Family cards overlap: ${a.id}, ${b.id}`);
}
const nodeName=(id,c=familyChart)=>c.nodes.find(n=>n.id===id).name;
const cardById=(id)=>all.filter(e=>e.tag==='button'&&e.className&&String(e.className).startsWith('node '))[familyChart.nodes.findIndex(n=>n.id===id)];
for(const child of ['ilya','svetlana','ser_fet','ol']){
 const n=familyChart.nodes.find(n=>n.id===child),olga=familyChart.nodes.find(n=>n.id==='ol');
 if(!n||n.y!==olga.y||!['tan','val'].every(parent=>familyEdges.some(e=>e.a===parent&&e.b===child)))throw Error('Missing child or parent link in Fetisov family');
}
for(const partner of ['and','ser'])if(familyEdges.some(e=>['tan','val'].includes(e.a)&&e.b===partner))throw Error('Olga partner must not appear as her sibling');
function samples(d,step=0){
 const tokens=d.match(/[MLQ]|-?\d+(?:\.\d+)?/g),out=[];let x=0,y=0;
 for(let i=0;i<tokens.length;){const op=tokens[i++];if(op==='M'){x=+tokens[i++];y=+tokens[i++];out.push([x,y])}else if(op==='L'){const nx=+tokens[i++],ny=+tokens[i++],count=step?Math.max(12,Math.ceil(Math.hypot(nx-x,ny-y)/step)):12;for(let k=1;k<=count;k++)out.push([x+(nx-x)*k/count,y+(ny-y)*k/count]);x=nx;y=ny}else if(op==='Q'){const cx=+tokens[i++],cy=+tokens[i++],nx=+tokens[i++],ny=+tokens[i++];for(let k=1;k<=12;k++){const t=k/12;out.push([(1-t)**2*x+2*(1-t)*t*cx+t*t*nx,(1-t)**2*y+2*(1-t)*t*cy+t*t*ny])}x=nx;y=ny}else throw Error('Unknown path command '+op)}return out;
}
const roundedPath=vm.runInContext('roundedPath',ctx);
const familyPath=vm.runInContext('familyPath',ctx);
function nearSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<0.5}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function assertRoundCorner(hit,corner){
 const m=hit.attrs.d.match(/([MLQ]|-?\d+(?:\.\d+)?)/g),qi=m.findIndex((v,i)=>v==='Q'&&distance([+m[i+1],+m[i+2]],corner)<.001);
 if(qi<3)throw Error('An outer family corner must contain a quadratic curve');
 const from=[+m[qi-2],+m[qi-1]],control=[+m[qi+1],+m[qi+2]],to=[+m[qi+3],+m[qi+4]],u=[from[0]-control[0],from[1]-control[1]],v=[to[0]-control[0],to[1]-control[1]];
 if(distance(control,corner)>.001||Math.hypot(...u)<.001||Math.hypot(...v)<.001||Math.abs(u[0]*v[0]+u[1]*v[1])>.001)throw Error('Family corner must be a non-degenerate curve between perpendicular segments');
}
function connectedPathIndices(paths){
 const points=paths.map(h=>{const p=samples(h.attrs.d);return [p[0],p.at(-1)]}),connected=new Set([0]);
 let changed=true;while(changed){changed=false;for(let i=0;i<points.length;i++)if(!connected.has(i)&&[...connected].some(j=>points[i].some(a=>points[j].some(b=>distance(a,b)<.001)))){connected.add(i);changed=true}}
 return connected;
}
// Exercise both L orientations, and the distinct T junction at an aligned child.
for(const direction of [-1,1]){
 const x=direction*100,f={anchor:[0,0],stem:[[0,0],[0,100]],bus:[{points:[[Math.min(0,x),100],[Math.max(0,x),100]]}],branches:[{child:'c',points:[[x,100],[x,200]]}]};
 const stem={attrs:{d:familyPath(f,'stem',f.stem)}},branch={attrs:{d:familyPath(f,'branch',f.branches[0].points)}},bus={attrs:{d:familyPath(f,'bus',f.bus[0].points)}};
 assertRoundCorner(stem,[0,100]);assertRoundCorner(branch,[x,100]);
 if(connectedPathIndices([stem,bus,branch]).size!==3)throw Error('Rounded L turns must stay connected on both sides');
 const tee={...f,branches:[...f.branches,{child:'aligned',points:[[0,100],[0,200]]}]};
 if(familyPath(tee,'stem',tee.stem).includes('Q')||familyPath(tee,'branch',tee.branches[1].points).includes('Q'))throw Error('A T junction must remain connected rather than being rounded');
}
for(const c of charts){
 const subtree=walk(roots['#chart-'+c.id]),map=Object.fromEntries(c.nodes.map(n=>[n.id,n])),families=familyRoutes(c,map),allHits=subtree.filter(e=>e.classList.contains('link-hit'));
 const svg=subtree.find(e=>e.tag==='svg'),groups=[...svg.children];
 const familyPositions=groups.map((g,i)=>g.classList.contains('family-edge')?i:-1).filter(i=>i>=0);
 if(familyPositions.length){
  const firstFamily=Math.min(...familyPositions),lastFamily=Math.max(...familyPositions);
  for(const [i,g] of groups.entries()){
   if(g.classList.contains('family-edge'))continue;
   const hit=g.children.find(x=>x.classList.contains('link-hit'));
   const union=families.some(f=>f.parents.length===2&&hit.attrs['aria-label']?.startsWith(map[f.parents[0]].name+' — '+map[f.parents[1]].name+':'));
   if(union&&i>firstFamily||!union&&i<lastFamily)throw Error(c.id+': line layers must preserve junctions and separate unrelated crossings');
  }
 }
 const initial=groups.map(g=>g.children.find(x=>x.classList.contains('link-hit')).attrs.d);
 const stable=()=>{if(groups.length!==svg.children.length||groups.some((g,i)=>g!==svg.children[i]||g.children.find(x=>x.classList.contains('link-hit')).attrs.d!==initial[i]))throw Error('Highlighting must not move lines or change their stacking order')};
 const cards=subtree.filter(e=>e.tag==='button'&&e.className?.startsWith('node '));
 for(const button of cards){
  button.handlers.pointerenter({pointerType:'mouse'});stable();button.handlers.pointerleave({pointerType:'mouse'});stable();button.handlers.click();stable();
  const visibleNodes=c.nodes.filter((n,i)=>!cards[i].classList.contains('is-dim'));
  for(const group of groups.filter(g=>g.classList.contains('is-selected'))){
   const path=group.children.find(x=>x.classList.contains('link-hit'));
   for(const node of visibleNodes)for(const box of cardBoxes(node))if(samples(path.attrs.d).some(([x,y])=>x>box.left+.05&&x<box.right-.05&&y>box.top+.05&&y<box.bottom-.05))throw Error(c.id+': selected connection crosses visible card '+node.id);
  }
 }
 for(const f of families){
  const hits=allHits.filter(h=>h.attrs['data-family']===String(f.index)&&h.attrs['data-parents']===f.parents.join(','));
  const stems=hits.filter(h=>h.attrs['data-role']==='family-stem'),buses=hits.filter(h=>h.attrs['data-role']==='family-bus'),branches=hits.filter(h=>h.attrs['data-role']==='family-branch');
  if(stems.length!==1||buses.length!==f.bus.length||branches.length!==f.children.length)throw Error(c.id+': incorrect shared family rendering');
  for(const branch of f.branches){
   const hitsForChild=branches.filter(h=>h.attrs['data-child']===branch.child),child=map[branch.child];
   if(hitsForChild.length!==1)throw Error(c.id+': incorrect child branch '+branch.child);
   const end=samples(hitsForChild[0].attrs.d).at(-1);
   const reaches=f.sidePort?([child.x+PORTRAIT_INSET,child.x+PORTRAIT_INSET+PORTRAIT].some(x=>Math.abs(end[0]-x)<.001)&&Math.abs(end[1]-(child.y+PORTRAIT/2))<.001):(Math.abs(end[1]-child.y)<.001&&end[0]>=child.x+PORTRAIT_INSET&&end[0]<=child.x+PORTRAIT_INSET+PORTRAIT);
   if(!reaches)throw Error(c.id+': rendered branch does not reach '+branch.child);
  }
  // Verify connectivity of the actual rendered SVG segments, not merely the unrounded topology.
  const drawnPaths=[...stems,...buses,...branches];
  if(connectedPathIndices(drawnPaths).size!==drawnPaths.length)throw Error(c.id+': rendered family segments are disconnected');
  const corners=[...new Set([f.anchor[0],...f.branches.map(b=>b.points[0][0])])];
  for(const x of corners){
   const adjacent=f.bus.filter(s=>s.points.some(p=>p[0]===x)),stem=f.anchor[0]===x,branch=f.branches.find(b=>b.points[0][0]===x);
   if(adjacent.length!==1||stem===Boolean(branch))continue;
   const hit=stem?stems[0]:branches.find(h=>h.attrs['data-child']===branch.child);
   assertRoundCorner(hit,[x,f.stem.at(-1)[1]]);
  }
  for(const branch of f.branches){
   const target=cards[c.nodes.findIndex(n=>n.id===branch.child)];target.handlers.pointerenter({pointerType:'mouse'});
   const selected=drawnPaths.filter(h=>groups.find(g=>g.children.includes(h))?.classList.contains('is-selected'));
   const childHit=branches.find(h=>h.attrs['data-child']===branch.child);
   if(!selected.includes(stems[0])||!selected.includes(childHit))throw Error(c.id+': hover must highlight the family stem and selected child branch');
   const ordered=[stems[0],...selected.filter(h=>h!==stems[0])];
   if(!connectedPathIndices(ordered).has(ordered.indexOf(childHit)))throw Error(c.id+': highlighted route to child is disconnected');
   target.handlers.pointerleave({pointerType:'mouse'});
  }
  if(f.parents.length===2){const p0=map[f.parents[0]].name,p1=map[f.parents[1]].name,union=allHits.find(h=>h.attrs['aria-label']?.startsWith(p0+' \u2014 '+p1+':'));
   if(!union)throw Error(c.id+': missing parents union');
   const pts=samples(union.attrs.d);if(!pts.slice(1).some((p,i)=>nearSegment(f.anchor,pts[i],p)))throw Error(c.id+': family stem is disconnected from parents union');
  }
  const rendered=groups.filter(g=>g.children.some(h=>hits.includes(h)));
  if(f.kind==='red'&&rendered.some(g=>!g.classList.contains('edge-red')))throw Error(c.id+': uncertain family must stay red');
  if(f.kind==='blue'&&rendered.some(g=>!g.classList.contains('edge-blue')))throw Error(c.id+': adoption must stay blue');
 }
}
const familyGroup=(role,parents,child)=>all.find(e=>e.classList.contains('link-hit')&&e.attrs['data-role']==='family-'+role&&e.attrs['data-parents']===parents&&(child===undefined||e.attrs['data-child']===child));
const findGroup=hit=>walk(host).find(e=>e.tag==='g'&&e.children.includes(hit));
// Exercise the actual rendered lines for every chart, including curves and faded-independent states.
for(const c of charts){
 const subtree=walk(roots['#chart-'+c.id]),hits=subtree.filter(e=>e.classList.contains('link-hit'));
 for(const hit of hits){const rendered=samples(hit.attrs.d,8);for(const node of c.nodes)for(const box of cardBoxes(node)){
  if(rendered.some(([x,y])=>x>box.left+.05&&x<box.right-.05&&y>box.top+.05&&y<box.bottom-.05))throw Error(`${c.id}: rendered line ${hit.attrs['aria-label']} crosses portrait or caption of ${node.id}`);
 }}
 const map=Object.fromEntries(c.nodes.map(n=>[n.id,n])),families=familyRoutes(c,map);
 function onPortrait(point,node){const [x,y]=point,l=node.x+PORTRAIT_INSET,r=l+PORTRAIT,t=node.y,b=t+PORTRAIT,eps=.02;return ((Math.abs(x-l)<eps||Math.abs(x-r)<eps)&&y>=t-eps&&y<=b+eps)||((Math.abs(y-t)<eps||Math.abs(y-b)<eps)&&x>=l-eps&&x<=r+eps)}
 for(const edge of graph(c)){
  if(families.some(f=>f.parents.includes(edge.a)&&f.children.includes(edge.b)&&edge.kind===f.kind))continue;
  const hit=hits.find(h=>h.attrs['aria-label']===`${map[edge.a].name} — ${map[edge.b].name}: ${edge.label}`);
  if(!hit)throw Error(`${c.id}: missing rendered line ${edge.a} → ${edge.b}`);
  const points=samples(hit.attrs.d),first=points[0],last=points.at(-1);
  if(!((onPortrait(first,map[edge.a])&&onPortrait(last,map[edge.b]))||(onPortrait(first,map[edge.b])&&onPortrait(last,map[edge.a]))))throw Error(`${c.id}: line ${edge.a} → ${edge.b} must connect portraits`);
 }
}
// A single documented parent has one shared, selectable trunk and no invented spouse.
for(const [parent,children] of [['an',['konst_an','oleg_an']],['mih',['sv','sr']],['yu',['ir','aa']]]){
 const f=familyRoutesMain.find(f=>f.parents.length===1&&f.parents[0]===parent);
 if(!f||f.children.length!==children.length||children.some(id=>!f.children.includes(id)))throw Error('Missing single-parent family '+parent);
 const stem=familyGroup('stem',parent),parentCard=cardById(parent);
 if(!stem||!stem.attrs['aria-label'].includes('дети'))throw Error('Single-parent shared line must be accessible');
 parentCard.handlers.pointerenter({pointerType:'mouse'});
 for(const child of children)if(!findGroup(familyGroup('branch',parent,child)).classList.contains('is-selected'))throw Error('Parent must highlight each child: '+child);
 parentCard.handlers.pointerleave({pointerType:'mouse'});
 for(const child of children){
  const branch=familyGroup('branch',parent,child),other=children.find(id=>id!==child);
  cardById(child).handlers.pointerenter({pointerType:'mouse'});
  if(!findGroup(stem).classList.contains('is-selected')||!findGroup(branch).classList.contains('is-selected')||!findGroup(familyGroup('branch',parent,other)).classList.contains('is-dim')||cardById(other).classList.contains('is-related'))throw Error('Single-parent child selection must isolate its own route: '+child);
  branch.handlers.click({stopPropagation(){}});
  if(!findGroup(branch).classList.contains('is-selected')||!findGroup(familyGroup('branch',parent,other)).classList.contains('is-dim'))throw Error('Single-parent branch click must isolate its own route: '+child);
  cardById(child).handlers.pointerleave({pointerType:'mouse'});
 }
}
const familyStem=familyGroup('stem','tan,val'),familyIlya=familyGroup('branch','tan,val','ilya'),familySvetlana=familyGroup('branch','tan,val','svetlana');
if(!familyStem||!familyIlya||!familySvetlana)throw Error('Missing Fetisov family stem or branches');
const parent=cardById('tan'),child=cardById('ilya'),pointer={pointerType:'mouse'};
parent.handlers.pointerenter(pointer);
if(!findGroup(familyStem).classList.contains('is-selected')||!findGroup(familyIlya).classList.contains('is-selected')||!findGroup(familySvetlana).classList.contains('is-selected'))throw Error('Hover on parent must show children and family branch');
parent.handlers.pointerleave(pointer);parent.handlers.click();
if(!findGroup(familyStem).classList.contains('is-selected')||!findGroup(familyIlya).classList.contains('is-selected'))throw Error('Parent click must retain family branch');
child.handlers.pointerenter(pointer);
if(!findGroup(familyStem).classList.contains('is-selected')||!findGroup(familyIlya).classList.contains('is-selected')||!findGroup(familySvetlana).classList.contains('is-dim'))throw Error('Hover on child must show its shared branch only');
const ilyaBus=fetisovFamily[0].bus.filter(s=>s.children.includes('ilya'));
for(const segment of ilyaBus){const hit=all.find(h=>h.classList.contains('link-hit')&&h.attrs['data-parents']==='tan,val'&&h.attrs['data-role']==='family-bus'&&h.attrs.d===familyPath(fetisovFamily[0],'bus',segment.points));if(!hit||!findGroup(hit).classList.contains('is-selected'))throw Error('Child highlight must include the entire connecting bus')}
if(cardById('tan').classList.contains('is-dim')||cardById('val').classList.contains('is-dim'))throw Error('Both parents must stay visible on child hover');
child.handlers.pointerleave(pointer);child.handlers.click();
if(!findGroup(familyStem).classList.contains('is-selected')||!findGroup(familyIlya).classList.contains('is-selected')||!findGroup(familySvetlana).classList.contains('is-dim'))throw Error('Child click must show same shared path');
if(!panel.children.some(e=>e.tag==='strong'&&e.textContent===nodeName('ilya')))throw Error('Child click should select that child');
familyIlya.handlers.click({stopPropagation(){}});
if(!panel.children.some(e=>e.className==='related-list'&&['tan','val','ilya'].every(id=>e.children.some(b=>b.textContent===nodeName(id)))))throw Error('Clicking child branch must identify both parents and child');
familyStem.handlers.click({stopPropagation(){}});
if(!panel.children.some(e=>e.className==='related-list'&&['tan','val','ol','ilya','svetlana','ser_fet'].every(id=>e.children.some(b=>b.textContent===nodeName(id)))))throw Error('Clicking family stem must identify whole family');
document.handlers.keydown.forEach(f=>f({key:'Escape'}));
if(isSelected()||findGroup(familyStem).classList.contains('is-dim'))throw Error('Escape must clear family selection');
const adoptionHit=all.find(h=>h.classList.contains('link-hit')&&h.attrs['aria-label']?.startsWith(nodeName('ser')+' \u2014 '+nodeName('you')+':'));
if(!adoptionHit||!findGroup(adoptionHit).classList.contains('edge-blue'))throw Error('Separate adoption line must remain visible and blue');
const adoptionPoints=samples(adoptionHit.attrs.d),serNode=familyChart.nodes.find(n=>n.id==='ser'),youNode=familyChart.nodes.find(n=>n.id==='you');
const startAdoption=adoptionPoints[0],endAdoption=adoptionPoints.at(-1);
if(distance(startAdoption,[serNode.x+PORTRAIT_INSET+PORTRAIT,serNode.y+PORTRAIT/2])>.01||distance(endAdoption,[youNode.x+PORTRAIT_INSET,youNode.y+PORTRAIT/2])>.01)throw Error('Adoption must connect the two actual portraits');
const nastNode=familyChart.nodes.find(n=>n.id==='nast'),ilyaNode=familyChart.nodes.find(n=>n.id==='ilya'),rightAdoption=Math.max(...adoptionPoints.map(p=>p[0])),bottomAdoption=Math.max(...adoptionPoints.map(p=>p[1]));
if(rightAdoption<=Math.max(serNode.x+NODE_W,nastNode.x+NODE_W)||rightAdoption>=ilyaNode.x||bottomAdoption<=Math.max(youNode.y,nastNode.y)+NODE_H)throw Error('Adoption must use the nearby corridor after Nastya and before Ilya, then pass below the children');
adoptionHit.handlers.click({stopPropagation(){}});
if(!panel.children.some(e=>e.tag==='strong'&&e.textContent==='\u0443\u0441\u044b\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435'))throw Error('Adoption selection must retain its label');
const archiveRoot=roots['#chart-nikiforov'],archiveHits=walk(archiveRoot).filter(e=>e.classList.contains('link-hit'));
const akIdentity=archiveHits.find(e=>e.attrs['aria-label']==='Акилина Туева — Акулина Туева: возможно один человек');
const ak1874=archive.nodes.find(n=>n.id==='ak_baby74'),identityPoints=akIdentity&&samples(akIdentity.attrs.d);
if(!akIdentity||distance(identityPoints.at(-1),[ak1874.x+PORTRAIT_INSET,ak1874.y+PORTRAIT/2])>.01)throw Error('The possible identity must meet the 1874 portrait at its side, separate from the parents line');
const redBranch=archiveHits.find(e=>e.attrs['data-parents']==='ef2,ak2'&&e.attrs['data-child']==='stef');
if(!redBranch||!walk(archiveRoot).find(e=>e.tag==='g'&&e.children.includes(redBranch))?.classList.contains('edge-red'))throw Error('Uncertain family branch must remain red');
redBranch.handlers.click({stopPropagation(){}});
if(!walk(archiveRoot).some(e=>e.tag==='strong'&&e.textContent.includes('\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438')))throw Error('Uncertain selection must show its status');
const mishaCard=cardById('mi'),katyaCard=cardById('ka');
if(file.includes('lines-simple')||file.includes('lines-complex'))throw Error('Line mode switch should be removed');
if(!/\.family-edge\s+\.edge-halo\s*\{\s*stroke-width\s*:\s*0/.test(file)||!/\.edge-halo\s*\{[^}]*stroke\s*:\s*#fff[^}]*stroke-width\s*:\s*9/.test(file))throw Error('Family junctions must remain continuous while unrelated crossings are separated');
if(/\.edge\.is-selected\s+\.edge-line\s*\{[^}]*stroke-width/.test(file)||/\.node\.is-(selected|related)\s*\{[^}]*box-shadow/.test(file)||/\.node:hover\s*\{/.test(file))throw Error('Highlighting must not thicken outlines');
console.log('Shared family routes, accurate selection, uncertainty and adoption validated.');
// On narrow screens, the years control opens temporarily without consuming chart width.
if(!file.includes('@media(max-width:700px)')||!file.includes('.chart-shell{grid-template-columns:minmax(0,1fr)}')||!file.includes('.timeline.is-collapsed .timeline-list{display:none}'))throw Error('Mobile timeline layout missing');
for(const c of charts){
 const subtree=walk(roots['#chart-'+c.id]),timeline=subtree.find(e=>e.className==='timeline'),toggle=subtree.find(e=>e.className==='timeline-toggle'),list=subtree.find(e=>e.className==='timeline-list'),chartView=subtree.find(e=>e.className==='viewport'),chartPanel=subtree.find(e=>e.className==='selection-panel');
 if(!timeline||!toggle||!list||toggle.attrs['aria-controls']!==list.attrs.id||toggle.attrs['aria-expanded']!=='false'||!timeline.classList.contains('is-collapsed'))throw Error(`${c.id}: timeline should start closed`);
 toggle.handlers.click();if(toggle.attrs['aria-expanded']!=='true'||timeline.classList.contains('is-collapsed'))throw Error(`${c.id}: timeline did not open`);
 const item=list.children.find(e=>e.className==='timeline-item');
 if(item){item.handlers.click();if(toggle.attrs['aria-expanded']!=='false'||!timeline.classList.contains('is-collapsed')||!chartPanel.children.some(e=>e.tag==='strong'))throw Error(`${c.id}: choosing a year should close and select`)}
 else {toggle.handlers.click();if(toggle.attrs['aria-expanded']!=='false')throw Error(`${c.id}: empty timeline did not close`)}
 toggle.handlers.click();chartView.handlers.pointerdown({button:0,pointerId:71,clientX:50,clientY:50,target:{closest:()=>false}});chartView.handlers.pointerup({pointerId:71});if(toggle.attrs['aria-expanded']!=='false')throw Error(`${c.id}: touching the chart should close the timeline`);
 toggle.handlers.click();document.handlers.keydown.forEach(f=>f({key:'Escape'}));if(toggle.attrs['aria-expanded']!=='false')throw Error(`${c.id}: Escape should close the timeline`);
}
console.log('Mobile birth-year panel opens, selects, and closes without taking chart width.');
// One tap selects; a second tap on the same card opens details.
const modal=roots['#person-dialog'];modal.close();let now=1000;ctx.Date={now:()=>now};
const tap=person=>{person.handlers.pointerdown({pointerType:'touch',clientX:10,clientY:10});person.handlers.click({detail:1})};
tap(mishaCard);
if(modal.open||!panel.children.some(e=>e.textContent==='Миша Никифоров'))throw Error('One tap must select without opening details');
now+=250;tap(mishaCard);
if(!modal.open||roots['#dialog-name'].textContent!=='Миша Никифоров')throw Error('Two taps on one card must open details');modal.close();mishaCard.handlers.dblclick();if(modal.open)throw Error('Native touch double-click must not reopen details');
now+=1000;tap(mishaCard);const more=panel.children.find(e=>e.textContent==='Подробнее');more.handlers.click();if(!modal.open)throw Error('Details button must remain available');modal.close();
mishaCard.handlers.pointerdown({pointerType:'mouse'});mishaCard.handlers.click({detail:1});if(modal.open)throw Error('Mouse single-click must only select');
mishaCard.handlers.dblclick();if(!modal.open)throw Error('Mouse double-click must open details');modal.close();
now+=1000;tap(mishaCard);now+=100;tap(katyaCard);now+=100;tap(mishaCard);if(modal.open)throw Error('Taps on different people must not count as a double tap');
now+=1000;tap(mishaCard);now+=501;tap(mishaCard);if(modal.open)throw Error('Taps outside the time window must remain single');
now+=250;tap(mishaCard);if(!modal.open)throw Error('A quick second tap should open details');modal.close();
now+=1000;tap(mishaCard);now+=100;mishaCard.handlers.pointerdown({pointerType:'touch',clientX:10,clientY:10});mishaCard.handlers.pointermove({pointerType:'touch',clientX:35,clientY:10});mishaCard.handlers.click({detail:1});now+=100;tap(mishaCard);if(modal.open)throw Error('A swipe must interrupt the double-tap sequence');
now+=1000;tap(mishaCard);now+=100;mishaCard.handlers.pointerdown({pointerType:'touch',clientX:10,clientY:10});mishaCard.handlers.pointercancel();now+=100;tap(mishaCard);if(modal.open)throw Error('A cancelled touch must interrupt the double-tap sequence');
mishaCard.handlers.pointerdown({pointerType:'touch',clientX:10,clientY:10});mishaCard.handlers.click({detail:0});if(modal.open)throw Error('Keyboard activation must not be treated as a touch');
mishaCard.handlers.click({detail:0});if(!modal.open||roots['#dialog-name'].textContent!=='Миша Никифоров')throw Error('A second keyboard activation must open the selected person');modal.close();
now+=1000;tap(mishaCard);now+=100;view.handlers.pointerdown({pointerType:'touch',button:0,pointerId:99,clientX:50,clientY:50,target:{closest:()=>false}});view.handlers.pointerup({pointerId:99});now+=100;tap(mishaCard);if(modal.open)throw Error('Touching the background must interrupt the double-tap sequence');
const tatiana=card('Татьяна Перикова'),tatianaData=charts[0].nodes.find(n=>n.id==='tan');now+=1000;tap(tatiana);now+=200;tap(tatiana);
if(!modal.open||roots['#dialog-description'].textContent!==tatianaData.info)throw Error('Double-tap details must contain the person’s story');modal.close();
const archiveTree=charts.find(c=>c.id==='perikov'),archivePerson=archiveTree.nodes.find(n=>n.id==='io'),archiveCard=walk(roots['#chart-perikov']).find(e=>e.tag==='button'&&e.attrs['aria-label']?.startsWith(archivePerson.name+','));
for(const chart of charts){
 document.handlers.keydown.forEach(f=>f({key:'Escape'}));
 const personCard=walk(roots['#chart-'+chart.id]).find(e=>e.tag==='button'&&e.className?.startsWith('node '));
 if(!personCard?.attrs['aria-description'])throw Error(`${chart.id}: keyboard instructions missing`);
 personCard.handlers.click({detail:0});if(modal.open)throw Error(`${chart.id}: first keyboard activation should select`);
 personCard.handlers.click({detail:0});if(!modal.open)throw Error(`${chart.id}: second keyboard activation should open details`);modal.close();
}
now+=1000;tap(archiveCard);now+=200;tap(archiveCard);if(!modal.open||!roots['#dialog-links'].children.some(e=>e.href===archivePerson.source))throw Error('Double-tap details must retain archive sources');modal.close();
now+=1000;tap(mishaCard);now+=100;tap(archiveCard);now+=100;tap(mishaCard);if(modal.open)throw Error('Taps in different branches must not count as a double tap');
console.log('One tap selects; two taps open details. Other inputs do not cause accidental openings.');
// Check real assigned photos, including the memorial which is a document, not a portrait.
const photoCatalog=vm.runInContext('photoCatalog',ctx),path=require('path');
const redactedTable='assets/sources/khramov-family-table-redacted.png';
const redactedHash=require('crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',redactedTable))).digest('hex');
if(redactedHash!=='796b00c30aaf86e63973ef9572d08ff310e3db0c1865ac43987e5dde0358571c')throw Error('Verify that both phone numbers are fully redacted before replacing the family table');
if(!photoCatalog.khramov.nik?.some(photo=>photo.src===redactedTable&&!photo.portrait)||!photoCatalog.khramov.and?.some(photo=>photo.src===redactedTable&&!photo.portrait))throw Error('Redacted family table must be available as a source, not a portrait');
for(const [chartId,personId,src] of [['family','an','assets/photos/anatoly-perikov.png'],['family','an','assets/photos/anatoly-perikov-young.png'],['family','yu','assets/photos/yuri-perikov-hat.png'],['family','tam','assets/photos/tamara-perikova.png'],['khramov','max_old','assets/photos/maxim-khramov.png'],['family','and','assets/photos/andrey-khramov-memorial.png'],['khramov','and','assets/photos/andrey-khramov-memorial.png']])if(!photoCatalog[chartId]?.[personId]?.some(photo=>photo.src===src))throw Error(`Photo assignment missing: ${chartId}/${personId}`);
if(photoCatalog.family.an.some(photo=>photo.src.includes('yuri-perikov-hat')))throw Error('Yuri portrait must not be attributed to Anatoly');
for(const [chartId,people] of Object.entries(photoCatalog))for(const [personId,photos] of Object.entries(people)){
 const chart=charts.find(c=>c.id===chartId),person=chart.nodes.find(n=>n.id===personId),subtree=walk(roots['#chart-'+chartId]);
 const cardElement=subtree.filter(e=>e.tag==='button'&&e.className&&String(e.className).startsWith('node '))[chart.nodes.findIndex(n=>n.id===personId)];
 const portrait=photos.find(photo=>photo.portrait);
 if(!cardElement||cardElement.classList.contains('has-portrait')!==Boolean(portrait))throw Error('Incorrect portrait on '+person.name);
 if(portrait&&!walk(cardElement).some(e=>e.className==='node-portrait'&&e.src===portrait.src))throw Error('Missing thumbnail for '+person.name);
 for(const photo of photos)if(!fs.existsSync(path.join(__dirname,'..',photo.src)))throw Error('Missing photo file: '+photo.src);
 cardElement.handlers.pointerdown({pointerType:'mouse'});cardElement.handlers.click({detail:1});
 subtree.find(e=>e.className==='selection-panel').children.find(e=>e.textContent==='Подробнее').handlers.click();
 const parts=roots['#dialog-photos'].children,figure=parts[0],link=figure?.children[0],img=link?.children[0];
 if(!figure||link.href!==photos[0].src||img.src!==photos[0].src)throw Error('First photo details missing for '+person.name);
 if(parts.length!==(photos.length>1?2:1))throw Error('Unexpected photo controls for '+person.name);
 modal.close();
}
console.log('Portraits and memorial image are assigned, accessible in details, and present on disk.');

// Exercise independent slider instances without relying on any specific family member's photos.
const showPhotos=vm.runInContext('showPhotos',ctx),photoPanel=roots['#dialog-photos'];
const fixture=[{src:'one.png',alt:'First portrait',caption:'First caption'},{src:'two.png',alt:'Second portrait',caption:'Second caption'},{src:'three.png',alt:'Third portrait',caption:'Third caption'}];
showPhotos({name:'Test',photos:[]});if(photoPanel.children.length!==0)throw Error('Empty gallery should be hidden');
showPhotos({name:'Test',photos:[fixture[0]]});
if(photoPanel.children.length!==1||photoPanel.children[0].children[0].href!=='one.png')throw Error('A single photo must not show navigation');
showPhotos({name:'Test',photos:fixture});
const figure=photoPanel.children[0],link=figure.children[0],img=link.children[0],caption=figure.children[1],controls=photoPanel.children[1],prev=controls.children[0],count=controls.children[1],next=controls.children[2];
if(prev.attrs['aria-label']!=='Предыдущее фото'||next.attrs['aria-label']!=='Следующее фото'||count.attrs['aria-live']!=='polite')throw Error('Slider controls must have accessible names and live position');
for(const [button,expected] of [[prev,'assets/icons/photo-previous.svg'],[next,'assets/icons/photo-next.svg']]){
 const icon=button.children[0];
 if(icon?.tag!=='img'||icon.src!==expected||icon.attrs['aria-hidden']!=='true'||icon.alt!==''||!fs.existsSync(path.join(__dirname,'..',expected)))throw Error('Slider needs accessible vector arrows');
 const svg=fs.readFileSync(path.join(__dirname,'..',expected),'utf8');
 if(!/<svg\b/.test(svg)||!/viewBox="0 0 18 18"/.test(svg)||!/<path\b/.test(svg))throw Error('Slider icon must be a correctly sized vector');
}
const checkSlide=(index)=>{const photo=fixture[index];if(link.href!==photo.src||img.src!==photo.src||img.alt!==photo.alt||caption.textContent!==photo.caption||count.textContent!==`${index+1} / ${fixture.length}`)throw Error('Slider failed to show image '+index)};
checkSlide(0);next.handlers.click();checkSlide(1);next.handlers.click();checkSlide(2);next.handlers.click();checkSlide(0);prev.handlers.click();checkSlide(2);prev.handlers.click();checkSlide(1);
let sliderPrevented=false;figure.handlers.keydown({key:'ArrowRight',preventDefault(){sliderPrevented=true}});if(!sliderPrevented)throw Error('ArrowRight should be consumed in slider');checkSlide(2);
sliderPrevented=false;controls.handlers.keydown({key:'ArrowLeft',preventDefault(){sliderPrevented=true}});if(!sliderPrevented)throw Error('ArrowLeft should be consumed in slider');checkSlide(1);
sliderPrevented=false;figure.handlers.keydown({key:'Enter',preventDefault(){sliderPrevented=true}});if(sliderPrevented)throw Error('Other keys must not be consumed');checkSlide(1);
const photoPointer=(x,y,type='touch')=>({pointerType:type,clientX:x,clientY:y});
link.handlers.pointerdown(photoPointer(100,100));link.handlers.pointerup(photoPointer(30,105));checkSlide(2);
sliderPrevented=false;link.handlers.click({preventDefault(){sliderPrevented=true}});if(!sliderPrevented)throw Error('Swipe must not open the image');
sliderPrevented=false;link.handlers.click({preventDefault(){sliderPrevented=true}});if(sliderPrevented)throw Error('A later tap should open the image');
link.handlers.pointerdown(photoPointer(30,100));link.handlers.pointerup(photoPointer(100,105));checkSlide(1);
link.handlers.pointerdown(photoPointer(100,100));link.handlers.pointerup(photoPointer(90,200));checkSlide(1);
link.handlers.pointerdown(photoPointer(100,100,'mouse'));link.handlers.pointerup(photoPointer(20,100,'mouse'));checkSlide(1);
link.handlers.pointerdown(photoPointer(100,100));link.handlers.pointercancel();link.handlers.pointerup(photoPointer(20,100));checkSlide(1);
showPhotos({name:'Another person',photos:fixture});
if(photoPanel.children[0].children[0].href!=='one.png'||photoPanel.children[1].children[1].textContent!=='1 / 3')throw Error('Opening another person must reset the slider');
showPhotos({name:'No photos'});if(photoPanel.children.length!==0)throw Error('Switching to a person without photos must clear the previous gallery');
// Real cards exercise selection, details and switching between a multi-photo and a single-photo person.
const anatoly=charts.find(c=>c.id==='family').nodes.find(n=>n.id==='an'),olga=charts.find(c=>c.id==='family').nodes.find(n=>n.id==='ol'),personInfo=vm.runInContext('personInfo',ctx);
const yuri=charts.find(c=>c.id==='family').nodes.find(n=>n.id==='yu');
if(anatoly.photos.length!==2||olga.photos.length!==1||yuri.photos.length!==1||yuri.photos[0].src!=='assets/photos/yuri-perikov-hat.png')throw Error('Real photo fixtures missing or incorrect');
personInfo(anatoly);
if(!modal.open||roots['#dialog-name'].textContent!==anatoly.name||photoPanel.children.length!==2)throw Error('Anatoly details should show a slider');
let realLink=photoPanel.children[0].children[0],realControls=photoPanel.children[1];
for(let i=0;i<anatoly.photos.length;i++){
 if(realLink.href!==anatoly.photos[i].src||realLink.children[0].src!==anatoly.photos[i].src||photoPanel.children[0].children[1].textContent!==anatoly.photos[i].caption||realControls.children[1].textContent!==`${i+1} / 2`)throw Error('Incorrect Anatoly slide '+i);
 if(i<anatoly.photos.length-1)realControls.children[2].handlers.click();
}
personInfo(olga);
if(roots['#dialog-name'].textContent!=='Ольга Валентиновна Фитисова'||photoPanel.children.length!==1||photoPanel.children[0].children[0].href!==olga.photos[0].src)throw Error('Single-photo details must show Olga’s full name and replace the previous gallery without controls');
personInfo(anatoly);
if(photoPanel.children[0].children[0].href!==anatoly.photos[0].src||photoPanel.children[1].children[1].textContent!=='1 / 2')throw Error('Reopening Anatoly must reset slider');
personInfo(yuri);
if(roots['#dialog-name'].textContent!==yuri.name||photoPanel.children.length!==1||photoPanel.children[0].children[0].href!=='assets/photos/yuri-perikov-hat.png')throw Error('Yuri must display the corrected photograph without extra slider controls');
modal.close();
console.log('Photo slider navigation, labels, touch gestures and reset validated.');

// Modal data must follow the person and chart, including after opening a different person.
const person=(chart,id)=>charts.find(c=>c.id===chart).nodes.find(n=>n.id===id);
const dateText=()=>roots['#dialog-date'].textContent, maidenText=()=>roots['#dialog-maiden'].textContent;
personInfo(person('family','tan'));
if(roots['#dialog-name'].textContent!=='Татьяна Фитисова'||maidenText()!=='(Перикова)'||dateText()!=='28.05.1950'||roots['#dialog-relationship'].textContent!=='Бабушка')throw Error('Tatiana modal needs confirmed name, maiden surname, relationship and birth date');
personInfo(person('family','nast'));
if(roots['#dialog-name'].textContent!=='Анастасия Сергеевна Видянова'||maidenText()!=='(Бойко)'||dateText()!=='08.09.2002')throw Error('Anastasia modal needs confirmed maiden surname and birth date');
personInfo(person('family','and'));
if(maidenText()!==''||dateText()!=='11.07.1974 — 02.08.2015')throw Error('Birth and death must appear without carrying over previous maiden name');
personInfo(person('family','du'));
if(roots['#dialog-name'].textContent!=='Евдокия Ефимовна Перикова'||dateText()!==''||maidenText()!=='(Никифорова)')throw Error('Family patronymic must be shown without inferring an unknown date');
personInfo(person('boyko','nina'));
if(roots['#dialog-name'].textContent!=='Нина Анатольевна Бойко'||maidenText()!=='(Попова)')throw Error('Nina modal must retain her patronymic and maiden name');
personInfo(person('nikiforov','d1909'));
if(dateText()!=='16.02.1909 · ст. стиль'||roots['#dialog-state'].textContent!=='Требует проверки')throw Error('Historical date and uncertainty must retain their qualification');
personInfo(person('khramov','fyodor'));
if(dateText()!=='1915 — 1996'||roots['#dialog-relationship'].textContent!=='Отец Екатерины'||photoPanel.children[0].children[0].href!=='assets/photos/fyodor-konygin-memorial.png')throw Error('Fyodor must show his own years, daughter relationship and original family sheet');
personInfo({id:'fyodor',chartId:'family',name:'Без даты',sub:'',photos:[]});
if(dateText()!=='')throw Error('The same id in another chart must not inherit Fyodor’s date');
personInfo(person('perikov','io'));
if(!roots['#dialog-links'].children.some(e=>e.href===person('perikov','io').source))throw Error('Archive links must remain accessible from the modal');
personInfo(person('perikov','petr'));
if(!roots['#dialog-links'].children.some(e=>e.href===person('perikov','petr').source&&e.textContent==='Открыть выписку'))throw Error('The transcription must not be labelled as the original metric record');
modal.close();
console.log('Modal names, relationships, qualified dates, sources and chart-specific data validated.');
