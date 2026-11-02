const fs=require('fs'),vm=require('vm');
class CL {constructor(){this.s=new Set()} add(...x){x.forEach(t=>this.s.add(t))} remove(...x){x.forEach(t=>this.s.delete(t))} toggle(x,on){if(on===undefined)on=!this.s.has(x);on?this.s.add(x):this.s.delete(x)} contains(x){return this.s.has(x)}}
class E {constructor(tag){this.tag=tag;this.style={};this.children=[];this.attrs={};this.handlers={};this.clientWidth=1000;this.clientHeight=560;this.scrollLeft=0;this.scrollTop=0;this.classList=new CL();this.namespaceURI='http://www.w3.org/2000/svg'}setAttribute(k,v){this.attrs[k]=v}append(...v){this.children.push(...v)}replaceChildren(...v){this.children=[...v]}addEventListener(k,f){this.handlers[k]=f}showModal(){this.open=true}close(){this.open=false}getBoundingClientRect(){return{left:0,top:0}}setPointerCapture(){}}
const roots={},warnings=[],document={handlers:{},addEventListener(k,f){(this.handlers[k]??=[]).push(f)},querySelector:s=>roots[s]??=new E('root'),createElement:t=>new E(t),createElementNS:(ns,t)=>new E(t)},file=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');let ctx={document,console:{warn:(...x)=>warnings.push(x.join(' ')),log:console.log},Uint8Array,Float64Array,Int32Array};vm.createContext(ctx);vm.runInContext(file.match(/<script>([\s\S]*?)<\/script>/)[1],ctx,{timeout:30000});
const charts=vm.runInContext('charts',ctx),graph=vm.runInContext('graphEdges',ctx),route=vm.runInContext('routeEdge',ctx),births=vm.runInContext('births',ctx);
function walk(e){return [e,...e.children.flatMap(walk)]}
function checkPath(points,nodes,a,b){for(let i=1;i<points.length;i++){let [x1,y1]=points[i-1],[x2,y2]=points[i];if(x1!==x2&&y1!==y2)throw Error('diagonal path');for(const n of nodes){const left=n.x,right=n.x+174,top=n.y,bottom=n.y+96;const hits=x1===x2 ? x1>left&&x1<right&&Math.max(y1,y2)>top&&Math.min(y1,y2)<bottom : y1>top&&y1<bottom&&Math.max(x1,x2)>left&&Math.min(x1,x2)<right;if(hits)throw Error(`${a} -> ${b} crosses ${n.id} (${x1},${y1})-(${x2},${y2})`)}}}
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
if(!boykoAdopters||boykoAdopters.spouse||boykoAdopters.kind!=='blue')throw Error('Joint adoption alone must not imply marriage');
// A family line is a continuous route from the parents' union to each actual child.
const familyRoutes=vm.runInContext('familyRoutes',ctx);
for(const c of charts){
 const map=Object.fromEntries(c.nodes.map(n=>[n.id,n])),routes=familyRoutes(c,map);
 for(const f of routes){
  const [a,b]=f.parents.map(id=>map[id]),left=a.x<b.x?a:b,right=left===a?b:a;
  if(f.anchor[0]<left.x+174||f.anchor[0]>right.x||f.anchor[1]!==left.y+48)throw Error(`${c.id}: family trunk must start on the parents' union`);
  const [first,last]=[f.stem[0],f.stem.at(-1)];
  if(first[0]!==f.anchor[0]||first[1]!==f.anchor[1])throw Error(`${c.id}: detached family stem`);
  checkPath(f.stem,c.nodes,f.parents.join('+'),'family stem');
  const bus=f.bus.map(s=>s.points).sort((x,y)=>x[0][0]-y[0][0]);
  const targetIds=f.branches.map(b=>b.child);
  if(new Set(targetIds).size!==f.children.length||f.children.some(id=>!targetIds.includes(id)))throw Error(`${c.id}: each child needs exactly one family branch`);
  for(const branch of f.branches){
   const child=map[branch.child],start=branch.points[0],end=branch.points.at(-1);
   if(start[1]!==last[1]||end[0]<child.x||end[0]>child.x+174||end[1]!==child.y)throw Error(`${c.id}: disconnected child branch ${branch.child}`);
   let reached=Math.min(last[0],start[0]);const target=Math.max(last[0],start[0]);
   for(const segment of bus){if(segment[0][1]!==last[1]||segment[1][1]!==last[1])throw Error(`${c.id}: bus height mismatch`);if(segment[0][0]<=reached&&segment[1][0]>reached)reached=segment[1][0]}
   if(reached<target)throw Error(`${c.id}: bus does not connect to ${branch.child}`);
   checkPath(branch.points,c.nodes,f.parents.join('+'),branch.child);
  }
  for(const segment of bus)checkPath(segment,c.nodes,f.parents.join('+'),'family bus');
 }
}
const familyRoutesMain=familyRoutes(charts.find(c=>c.id==='family'),Object.fromEntries(charts.find(c=>c.id==='family').nodes.map(n=>[n.id,n])));
// The paternal branch keeps the two Maxims and two Svetas distinct and connects each generation.
const khramovChart=charts.find(c=>c.id==='khramov'),khramovEdges=graph(khramovChart);
for(const [parent,child] of [['max_old','nik'],['nik','and'],['kat','and'],['nik','sk'],['kat','sv_k'],['nik','max_young'],['sk','liza'],['sk','slava'],['max_young','sv_max'],['max_young','nik_max'],['and','you']]){
 if(!khramovEdges.some(e=>e.a===parent&&e.b===child))throw Error(`Missing paternal family relationship: ${parent} -> ${child}`);
}
if(births.khramov.nik[0]!=='15.11.1941'||births.khramov.kat[0]!=='23.02.1947')throw Error('Confirmed grandparents birth dates missing');
if(births.khramov.nik_max?.[0]!=='11.08.2026'||khramovChart.nodes.find(n=>n.id==='nik_max')===khramovChart.nodes.find(n=>n.id==='nik'))throw Error('The new Nikolai must remain distinct from his grandfather');
if(khramovChart.nodes.find(n=>n.id==='sv_k')===khramovChart.nodes.find(n=>n.id==='sv_max'))throw Error('Different Svetas must remain distinct');
const fetisovFamily=familyRoutesMain.filter(f=>f.parents.includes('tan')&&f.parents.includes('val'));
if(fetisovFamily.length!==1||['ol','ilya','svetlana','ser_fet'].some(id=>!fetisovFamily[0].children.includes(id)))throw Error('Tatiana and Valentin need one shared branch for all four children');
const byParents=(a,b)=>familyRoutesMain.find(f=>f.parents.includes(a)&&f.parents.includes(b));
if(!byParents('and','ol')?.children.includes('you')||byParents('and','ol')?.children.includes('nast')||!byParents('ol','ser')?.children.includes('nast')||byParents('ol','ser')?.children.includes('you'))throw Error('Children of different partnerships must remain separate');
const adoption=graph(charts.find(c=>c.id==='family')).find(e=>e.a==='ser'&&e.b==='you');
if(!adoption||adoption.kind!=='blue'||adoption.label!=='усыновление')throw Error('Separate adoption must remain blue and labelled');
const archive=charts.find(c=>c.id==='nikiforov'),archiveRoutes=familyRoutes(archive,Object.fromEntries(archive.nodes.map(n=>[n.id,n])));
if(!archiveRoutes.some(f=>f.kind==='red'&&f.children.includes('stef'))||archiveRoutes.some(f=>f.parents.includes('d1909')&&f.parents.includes('a1909')))throw Error('Uncertain family and godparent relationships must stay distinct');
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
 if(a.x<b.x+174&&a.x+174>b.x&&a.y<b.y+96&&a.y+96>b.y)throw Error(`Family cards overlap: ${a.id}, ${b.id}`);
}
const nodeName=(id,c=familyChart)=>c.nodes.find(n=>n.id===id).name;
const cardById=(id)=>card(nodeName(id));
for(const child of ['ilya','svetlana','ser_fet','ol']){
 const n=familyChart.nodes.find(n=>n.id===child),olga=familyChart.nodes.find(n=>n.id==='ol');
 if(!n||n.y!==olga.y||!['tan','val'].every(parent=>familyEdges.some(e=>e.a===parent&&e.b===child)))throw Error('Missing child or parent link in Fetisov family');
}
for(const partner of ['and','ser'])if(familyEdges.some(e=>['tan','val'].includes(e.a)&&e.b===partner))throw Error('Olga partner must not appear as her sibling');
function samples(d){
 const tokens=d.match(/[MLQ]|-?\d+(?:\.\d+)?/g),out=[];let x=0,y=0;
 for(let i=0;i<tokens.length;){const op=tokens[i++];if(op==='M'){x=+tokens[i++];y=+tokens[i++];out.push([x,y])}else if(op==='L'){const nx=+tokens[i++],ny=+tokens[i++];for(let k=1;k<=12;k++)out.push([x+(nx-x)*k/12,y+(ny-y)*k/12]);x=nx;y=ny}else if(op==='Q'){const cx=+tokens[i++],cy=+tokens[i++],nx=+tokens[i++],ny=+tokens[i++];for(let k=1;k<=12;k++){const t=k/12;out.push([(1-t)**2*x+2*(1-t)*t*cx+t*t*nx,(1-t)**2*y+2*(1-t)*t*cy+t*t*ny])}x=nx;y=ny}else throw Error('Unknown path command '+op)}return out;
}
const roundedPath=vm.runInContext('roundedPath',ctx);
const familyPath=vm.runInContext('familyPath',ctx);
function nearSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<0.5}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function assertRoundCorner(hit,corner){
 const m=hit.attrs.d.match(/([MLQ]|-?\d+(?:\.\d+)?)/g),qi=m.indexOf('Q');
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
   const union=families.some(f=>hit.attrs['aria-label']?.startsWith(map[f.parents[0]].name+' — '+map[f.parents[1]].name+':'));
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
   for(const node of visibleNodes)if(samples(path.attrs.d).some(([x,y])=>x>node.x+.05&&x<node.x+173.95&&y>node.y+.05&&y<node.y+95.95))throw Error(c.id+': selected connection crosses visible card '+node.id);
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
   if(Math.abs(end[1]-child.y)>.001||end[0]<child.x||end[0]>child.x+174)throw Error(c.id+': rendered branch does not reach '+branch.child);
  }
  // Verify connectivity of the actual rendered SVG segments, not merely the unrounded topology.
  const drawnPaths=[...stems,...buses,...branches];
  if(connectedPathIndices(drawnPaths).size!==drawnPaths.length)throw Error(c.id+': rendered family segments are disconnected');
  const corners=[...new Set([f.anchor[0],...f.branches.map(b=>b.points[0][0])])];
  for(const x of corners){
   const adjacent=f.bus.filter(s=>s.points.some(p=>p[0]===x)),stem=f.anchor[0]===x,branch=f.branches.find(b=>b.points[0][0]===x);
   if(adjacent.length!==1||stem===Boolean(branch))continue;
   const hit=stem?stems[0]:branches.find(h=>h.attrs['data-child']===branch.child);
   assertRoundCorner(hit,[x,f.stem[1][1]]);
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
  const p0=map[f.parents[0]].name,p1=map[f.parents[1]].name,union=allHits.find(h=>h.attrs['aria-label']?.startsWith(p0+' \u2014 '+p1+':'));
  if(!union)throw Error(c.id+': missing parents union');
  const pts=samples(union.attrs.d);if(!pts.slice(1).some((p,i)=>nearSegment(f.anchor,pts[i],p)))throw Error(c.id+': family stem is disconnected from parents union');
  const rendered=groups.filter(g=>g.children.some(h=>hits.includes(h)));
  if(f.kind==='red'&&rendered.some(g=>!g.classList.contains('edge-red')))throw Error(c.id+': uncertain family must stay red');
  if(f.kind==='blue'&&rendered.some(g=>!g.classList.contains('edge-blue')))throw Error(c.id+': adoption must stay blue');
 }
}
const familyGroup=(role,parents,child)=>all.find(e=>e.classList.contains('link-hit')&&e.attrs['data-role']==='family-'+role&&e.attrs['data-parents']===parents&&(child===undefined||e.attrs['data-child']===child));
const findGroup=hit=>walk(host).find(e=>e.tag==='g'&&e.children.includes(hit));
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
adoptionHit.handlers.click({stopPropagation(){}});
if(!panel.children.some(e=>e.tag==='strong'&&e.textContent==='\u0443\u0441\u044b\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435'))throw Error('Adoption selection must retain its label');
const archiveRoot=roots['#chart-nikiforov'],archiveHits=walk(archiveRoot).filter(e=>e.classList.contains('link-hit'));
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
now+=1000;tap(mishaCard);now+=100;view.handlers.pointerdown({pointerType:'touch',button:0,pointerId:99,clientX:50,clientY:50,target:{closest:()=>false}});view.handlers.pointerup({pointerId:99});now+=100;tap(mishaCard);if(modal.open)throw Error('Touching the background must interrupt the double-tap sequence');
const tatiana=card('Татьяна Перикова'),tatianaData=charts[0].nodes.find(n=>n.id==='tan');now+=1000;tap(tatiana);now+=200;tap(tatiana);
if(!modal.open||roots['#dialog-description'].textContent!==tatianaData.info)throw Error('Double-tap details must contain the person’s story');modal.close();
const archiveTree=charts.find(c=>c.id==='perikov'),archivePerson=archiveTree.nodes.find(n=>n.id==='io'),archiveCard=walk(roots['#chart-perikov']).find(e=>e.tag==='button'&&e.attrs['aria-label']?.startsWith(archivePerson.name+','));
now+=1000;tap(archiveCard);now+=200;tap(archiveCard);if(!modal.open||!roots['#dialog-links'].children.some(e=>e.href===archivePerson.source))throw Error('Double-tap details must retain archive sources');modal.close();
now+=1000;tap(mishaCard);now+=100;tap(archiveCard);now+=100;tap(mishaCard);if(modal.open)throw Error('Taps in different branches must not count as a double tap');
console.log('One tap selects; two taps open details. Other inputs do not cause accidental openings.');
// Check real assigned photos, including the memorial which is a document, not a portrait.
const photoCatalog=vm.runInContext('photoCatalog',ctx),path=require('path');
for(const [chartId,personId,src] of [['family','an','assets/photos/anatoly-perikov.png'],['family','tam','assets/photos/tamara-perikova.png'],['khramov','max_old','assets/photos/maxim-khramov.png'],['family','and','assets/photos/andrey-khramov-memorial.png'],['khramov','and','assets/photos/andrey-khramov-memorial.png']])if(!photoCatalog[chartId]?.[personId]?.some(photo=>photo.src===src))throw Error(`Photo assignment missing: ${chartId}/${personId}`);
for(const [chartId,people] of Object.entries(photoCatalog))for(const [personId,photos] of Object.entries(people)){
 const chart=charts.find(c=>c.id===chartId),person=chart.nodes.find(n=>n.id===personId),subtree=walk(roots['#chart-'+chartId]);
 const cardElement=subtree.find(e=>e.tag==='button'&&e.attrs['aria-label']?.startsWith(person.name+','));
 const portrait=photos.find(photo=>photo.portrait);
 if(!cardElement||cardElement.classList.contains('has-portrait')!==Boolean(portrait))throw Error('Incorrect portrait on '+person.name);
 if(portrait&&!cardElement.children.some(e=>e.className==='node-portrait'&&e.src===portrait.src))throw Error('Missing thumbnail for '+person.name);
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
if(anatoly.photos.length!==3||olga.photos.length!==1)throw Error('Real photo fixtures missing');
personInfo(anatoly);
if(!modal.open||roots['#dialog-name'].textContent!==anatoly.name||photoPanel.children.length!==2)throw Error('Anatoly details should show a slider');
let realLink=photoPanel.children[0].children[0],realControls=photoPanel.children[1];
for(let i=0;i<anatoly.photos.length;i++){
 if(realLink.href!==anatoly.photos[i].src||realLink.children[0].src!==anatoly.photos[i].src||photoPanel.children[0].children[1].textContent!==anatoly.photos[i].caption||realControls.children[1].textContent!==`${i+1} / 3`)throw Error('Incorrect Anatoly slide '+i);
 if(i<anatoly.photos.length-1)realControls.children[2].handlers.click();
}
personInfo(olga);
if(roots['#dialog-name'].textContent!==olga.name||photoPanel.children.length!==1||photoPanel.children[0].children[0].href!==olga.photos[0].src)throw Error('Single-photo details must replace the previous gallery without controls');
personInfo(anatoly);
if(photoPanel.children[0].children[0].href!==anatoly.photos[0].src||photoPanel.children[1].children[1].textContent!=='1 / 3')throw Error('Reopening Anatoly must reset slider');
modal.close();
console.log('Photo slider navigation, labels, touch gestures and reset validated.');
