const fs=require('fs'),vm=require('vm');
class CL {constructor(){this.s=new Set()} add(...x){x.forEach(t=>this.s.add(t))} remove(...x){x.forEach(t=>this.s.delete(t))} toggle(x,on){if(on===undefined)on=!this.s.has(x);on?this.s.add(x):this.s.delete(x)} contains(x){return this.s.has(x)}}
class E {constructor(tag){this.tag=tag;this.style={};this.children=[];this.attrs={};this.handlers={};this.clientWidth=1000;this.clientHeight=560;this.scrollLeft=0;this.scrollTop=0;this.classList=new CL();this.namespaceURI='http://www.w3.org/2000/svg'}setAttribute(k,v){this.attrs[k]=v}append(...v){this.children.push(...v)}replaceChildren(...v){this.children=[...v]}addEventListener(k,f){this.handlers[k]=f}showModal(){this.open=true}close(){this.open=false}getBoundingClientRect(){return{left:0,top:0}}setPointerCapture(){}}
const roots={},warnings=[],document={handlers:{},addEventListener(k,f){(this.handlers[k]??=[]).push(f)},querySelector:s=>roots[s]??=new E('root'),createElement:t=>new E(t),createElementNS:(ns,t)=>new E(t)},file=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');let ctx={document,console:{warn:(...x)=>warnings.push(x.join(' ')),log:console.log},Uint8Array,Float64Array,Int32Array};vm.createContext(ctx);vm.runInContext(file.match(/<script>([\s\S]*?)<\/script>/)[1],ctx,{timeout:30000});
const charts=vm.runInContext('charts',ctx),graph=vm.runInContext('graphEdges',ctx),route=vm.runInContext('routeEdge',ctx),births=vm.runInContext('births',ctx);
function walk(e){return [e,...e.children.flatMap(walk)]}
function checkPath(points,nodes,a,b){for(let i=1;i<points.length;i++){let [x1,y1]=points[i-1],[x2,y2]=points[i];if(x1!==x2&&y1!==y2)throw Error('diagonal path');for(const n of nodes){const left=n.x,right=n.x+174,top=n.y,bottom=n.y+96;const hits=x1===x2 ? x1>left&&x1<right&&Math.max(y1,y2)>top&&Math.min(y1,y2)<bottom : y1>top&&y1<bottom&&Math.max(x1,x2)>left&&Math.min(x1,x2)<right;if(hits)throw Error(`${a} -> ${b} crosses ${n.id} (${x1},${y1})-(${x2},${y2})`)}}}
for(const c of charts){const ids=new Set(c.nodes.map(x=>x.id));if(ids.size!==c.nodes.length)throw Error('duplicates');const edges=graph(c),occ=new Map(),ports=vm.runInContext('edgePorts',ctx)(edges,Object.fromEntries(c.nodes.map(n=>[n.id,n])));let missing=0;for(const e of edges){if(!ids.has(e.a)||!ids.has(e.b))throw Error('unknown person');let p=route(c.nodes.find(n=>n.id===e.a),c.nodes.find(n=>n.id===e.b),c.nodes,c.w,c.h,occ,ports[edges.indexOf(e)]);if(!p){missing++;continue}checkPath(p,c.nodes,e.a,e.b)}const all=walk(roots['#chart-'+c.id]);const cards=all.filter(e=>e.tag==='button' && e.className && String(e.className).startsWith('node '));if(cards.length!==c.nodes.length)throw Error('bad node count');cards[0].handlers.click();const panel=all.find(e=>e.className==='selection-panel');if(!panel.children.some(e=>e.tag==='strong'))throw Error('selection not shown');const details=panel.children.find(e=>e.textContent==='Подробнее');details.handlers.click();if(!roots['#person-dialog'].open)throw Error('details');const controls=all.filter(e=>e.tag==='button'&&e.attrs['aria-label']==='Увеличить масштаб');if(controls.length!==1)throw Error('zoom');controls[0].handlers.click();console.log(c.id, 'people',ids.size,'edges',edges.length,'failed',missing,'birth years',Object.keys(births[c.id]).length);if(missing)throw Error('missing route');}
if(warnings.length)throw Error(warnings.join('\n'));
console.log('All routes avoid unrelated cards; selection, details, zoom and timelines validated.');
const host=roots['#chart-family'];const all=walk(host),view=all.find(e=>e.className==='viewport'),output=all.find(e=>e.tag==='output');const original=output.textContent;let prevented=false;view.handlers.wheel({ctrlKey:true,metaKey:false,deltaY:-120,clientX:300,clientY:200,preventDefault(){prevented=true}});if(!prevented||output.textContent===original)throw Error('wheel zoom failed');let target={closest:()=>false};view.handlers.pointerdown({button:0,pointerId:1,clientX:200,clientY:200,target});view.handlers.pointerdown({button:0,pointerId:2,clientX:300,clientY:200,target});const beforePinch=output.textContent;view.handlers.pointermove({pointerId:2,clientX:350,clientY:200});if(output.textContent===beforePinch)throw Error('pinch zoom failed');view.handlers.pointerup({pointerId:2});view.handlers.pointerup({pointerId:1});const timeline=all.find(e=>e.className==='timeline-item');timeline.handlers.click();const panel=all.find(e=>e.className==='selection-panel');if(!panel.children.some(e=>e.tag==='strong'))throw Error('timeline focus failed');const edgeHit=all.find(e=>e.classList.contains('link-hit'));edgeHit.handlers.click({stopPropagation(){}});if(!panel.children.some(e=>e.className==='related-list'))throw Error('edge selection failed');console.log('Wheel zoom, pinch, drag, timeline focus and selected relation validated.');

roots['#person-dialog'].close();
const isSelected=()=>panel.children.some(e=>e.tag==='strong');
edgeHit.handlers.click({stopPropagation(){}});document.handlers.keydown.forEach(f=>f({key:'Escape'}));if(isSelected())throw Error('Escape did not clear selection');
edgeHit.handlers.click({stopPropagation(){}});view.handlers.pointerdown({button:0,pointerId:3,clientX:100,clientY:100,target});view.handlers.pointerup({pointerId:3});view.handlers.click({target:{closest:()=>false}});if(isSelected())throw Error('background click did not clear selection');
edgeHit.handlers.click({stopPropagation(){}});view.handlers.pointerdown({button:0,pointerId:4,clientX:100,clientY:100,target});view.handlers.pointermove({pointerId:4,clientX:150,clientY:100});view.handlers.pointerup({pointerId:4});view.handlers.click({target:{closest:()=>false}});if(!isSelected())throw Error('drag cleared selection');
console.log('Escape and background clear selection; dragging preserves selection.');

// The user's examples: use a straight line when cards align, otherwise the nearest side.
document.handlers.keydown.forEach(f=>f({key:'Escape'}));
function card(name){const item=all.find(e=>e.tag==='button' && e.attrs['aria-label']?.startsWith(name+','));if(!item)throw Error(`Missing card ${name}`);return item}
function relation(from,to){const hits=[...new Set(all.filter(e=>e.classList.contains('link-hit')&&e.attrs['aria-label']?.startsWith(from+' — '+to+':')))];if(hits.length!==1)throw Error(`Missing relation ${from} — ${to}`);return hits[0]}
function points(hit){return hit.attrs.d.match(/-?\d+(?:\.\d+)?/g).map(Number)}
function turns(hit){return (hit.attrs.d.match(/Q/g)||[]).length}
function straight(hit){const p=points(hit);return turns(hit)===0&&(p[0]===p[2]||p[1]===p[3])}
const efKatya=relation('Ефим Никифоров','Катя Никифорова'),akKatya=relation('Акулина Никифорова','Катя Никифорова');
const basePaths=[efKatya.attrs.d,akKatya.attrs.d];card('Катя Никифорова').handlers.click();
if(turns(efKatya)>2||turns(akKatya)>2)throw Error('Katya’s connections should stay simple');
document.handlers.keydown.forEach(f=>f({key:'Escape'}));
if(isSelected()||efKatya.attrs.d!==basePaths[0]||akKatya.attrs.d!==basePaths[1])throw Error('Reset did not restore routes');
card('Миша Никифоров').handlers.click();
const efMisha=relation('Ефим Никифоров','Миша Никифоров'),akMisha=relation('Акулина Никифорова','Миша Никифоров');
if(!straight(efMisha)||turns(akMisha)!==1)throw Error('Misha should have a straight and a side connection');
const misha=charts[0].nodes.find(n=>n.id==='mi'),end=points(akMisha);
if(end.at(-2)!==misha.x+174||end.at(-1)<=misha.y||end.at(-1)>=misha.y+96)throw Error('Aculina should connect to Misha’s right side');
card('Татьяна Перикова').handlers.click();
if(!straight(relation('Иван Периков','Татьяна Перикова'))||!straight(relation('Татьяна Перикова','Ольга Фитисова')))throw Error('Tatiana should connect vertically to Ivan and Olga');
card('Акулина Никифорова').handlers.click();
if(turns(relation('Акулина Никифорова','Миша Никифоров'))!==1||turns(relation('Акулина Никифорова','Евдокия «Дуня»'))>2)throw Error('Aculina’s connections should stay simple');
const children=['Стеша Никифорова','Катя Никифорова','Миша Никифоров','Евдокия «Дуня»'];
const starts=children.map(name=>points(relation('Акулина Никифорова',name))[0]);
if(new Set(starts).size!==4)throw Error('Children links should leave from separate points');
console.log('Reference examples: direct, top and side connections, with separate sibling lines.');
// Every focused line must connect its two people and avoid the other highlighted cards.
function samples(d){
 const tokens=d.match(/[MLQ]|-?\d+(?:\.\d+)?/g),out=[];let x=0,y=0;
 for(let i=0;i<tokens.length;){const op=tokens[i++];if(op==='M'){x=+tokens[i++];y=+tokens[i++];out.push([x,y])}else if(op==='L'){const nx=+tokens[i++],ny=+tokens[i++];for(let k=1;k<=12;k++)out.push([x+(nx-x)*k/12,y+(ny-y)*k/12]);x=nx;y=ny}else if(op==='Q'){const cx=+tokens[i++],cy=+tokens[i++],nx=+tokens[i++],ny=+tokens[i++];for(let k=1;k<=12;k++){const t=k/12;out.push([(1-t)**2*x+2*(1-t)*t*cx+t*t*nx,(1-t)**2*y+2*(1-t)*t*cy+t*t*ny])}x=nx;y=ny}else throw Error('Unknown path command '+op)}return out;
}
let checked=0;
for(const c of charts){
 const subtree=walk(roots['#chart-'+c.id]),svg=subtree.find(x=>x.tag==='svg'),groups=[...new Set(svg.children)],edges=graph(c),cards=subtree.filter(x=>x.tag==='button'&&x.className?.startsWith('node '));
 if(groups.length!==edges.length)throw Error('Mismatch between rendered and recorded links');
 const initialPaths=groups.map(g=>g.children.find(x=>x.classList.contains('link-hit')).attrs.d);
 const checkStable=()=>{if(groups.some((g,i)=>g.children.find(x=>x.classList.contains('link-hit')).attrs.d!==initialPaths[i])||svg.children.length!==groups.length||svg.children.some((g,i)=>g!==groups[i]))throw Error('Highlighting must not move lines or change their stacking order')};
 for(let ni=0;ni<c.nodes.length;ni++){
  cards[ni].handlers.pointerenter({pointerType:'mouse'});checkStable();cards[ni].handlers.pointerleave({pointerType:'mouse'});checkStable();
  cards[ni].handlers.click();checkStable();const n=c.nodes[ni],visible=new Set([n.id,...edges.filter(e=>e.a===n.id||e.b===n.id).flatMap(e=>[e.a,e.b])]);
  for(let i=0;i<edges.length;i++)if(groups[i].classList.contains('is-selected')){
   const e=edges[i],hit=groups[i].children.find(x=>x.classList.contains('link-hit')),pts=samples(hit.attrs.d),endpoints=[c.nodes.find(x=>x.id===e.a),c.nodes.find(x=>x.id===e.b)];
   const onBorder=(p,node)=>p[0]>=node.x-0.01&&p[0]<=node.x+174.01&&p[1]>=node.y-0.01&&p[1]<=node.y+96.01&&(Math.abs(p[0]-node.x)<.01||Math.abs(p[0]-node.x-174)<.01||Math.abs(p[1]-node.y)<.01||Math.abs(p[1]-node.y-96)<.01);
   if(!((onBorder(pts[0],endpoints[0])&&onBorder(pts.at(-1),endpoints[1]))||(onBorder(pts[0],endpoints[1])&&onBorder(pts.at(-1),endpoints[0]))))throw Error(`Focused link has wrong endpoints: ${e.a} ${e.b}`);
   for(const id of visible){const node=c.nodes.find(n=>n.id===id);if(pts.some(([x,y])=>x>node.x+.05&&x<node.x+173.95&&y>node.y+.05&&y<node.y+95.95))throw Error(`Focused link ${e.a} ${e.b} crosses visible ${id}`)}checked++;
  }
 }
}
console.log(`Checked ${checked} focused connections and their visible cards.`);
// Hover previews the same links as a click, then restores the last explicit choice.
document.handlers.keydown.forEach(f=>f({key:'Escape'}));
const mishaCard=card('Миша Никифоров'),katyaCard=card('Катя Никифорова'),pointer={pointerType:'mouse'};
if(file.includes('lines-simple')||file.includes('lines-complex'))throw Error('Line mode switch should be removed');
const normalMisha=[efMisha.attrs.d,akMisha.attrs.d];
mishaCard.handlers.pointerenter(pointer);
if(!mishaCard.classList.contains('is-selected')||isSelected())throw Error('Hover should preview without changing the panel');
const hoverMisha=[efMisha.attrs.d,akMisha.attrs.d];
if(normalMisha.some((d,i)=>d!==hoverMisha[i]))throw Error('Hover must not move links');
if(!card('Катя Никифорова').classList.contains('is-dim')||card('Ефим Никифоров').classList.contains('is-dim'))throw Error('Hover must dim only unrelated people');
mishaCard.handlers.pointerleave(pointer);
if(mishaCard.classList.contains('is-selected')||[efMisha.attrs.d,akMisha.attrs.d].some((d,i)=>d!==normalMisha[i]))throw Error('Hover should clear on leave');
mishaCard.handlers.pointerenter(pointer);mishaCard.handlers.click();
if([efMisha.attrs.d,akMisha.attrs.d].some((d,i)=>d!==hoverMisha[i]))throw Error('Hover and click should display the same paths');
mishaCard.handlers.pointerleave(pointer);
if(!mishaCard.classList.contains('is-selected')||!panel.children.some(e=>e.textContent==='Миша Никифоров'))throw Error('Click selection was lost on leave');
katyaCard.handlers.pointerenter(pointer);
if(!katyaCard.classList.contains('is-selected')||!panel.children.some(e=>e.textContent==='Миша Никифоров'))throw Error('Hover should not replace the saved selection');
katyaCard.handlers.pointerleave(pointer);
if(!mishaCard.classList.contains('is-selected')||!panel.children.some(e=>e.textContent==='Миша Никифоров'))throw Error('Hover did not restore the clicked person');
edgeHit.handlers.click({stopPropagation(){}});const edgeTitle=panel.children.find(e=>e.tag==='strong')?.textContent;
katyaCard.handlers.pointerenter(pointer);katyaCard.handlers.pointerleave(pointer);
if(panel.children.find(e=>e.tag==='strong')?.textContent!==edgeTitle)throw Error('Hover did not restore the clicked connection');
const oldPath=efMisha.attrs.d;katyaCard.handlers.pointerenter({pointerType:'touch'});katyaCard.handlers.pointerleave({pointerType:'touch'});
if(efMisha.attrs.d!==oldPath)throw Error('Touch should not trigger hover');
if(/\.edge\.is-selected\s+\.edge-line\s*\{[^}]*stroke-width/.test(file)||/\.node\.is-(selected|related)\s*\{[^}]*box-shadow/.test(file)||/\.node:hover\s*\{/.test(file))throw Error('Highlighting must not thicken outlines');
console.log('Hover and click preserve routes and outlines while dimming unrelated elements.');
