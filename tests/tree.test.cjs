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

// Katya's two parent links should be simple, rounded and stay between generations.
document.handlers.keydown.forEach(f=>f({key:'Escape'}));
const katya=all.find(e=>e.tag==='button' && e.attrs['aria-label']?.startsWith('Катя Никифорова,'));
if(!katya)throw Error('Katya card missing');
const parentHits=[...new Set(all.filter(e=>e.classList.contains('link-hit') && /^(Ефим|Акулина) Никифоров/.test(e.attrs['aria-label']||'') && e.attrs['aria-label'].includes('Катя Никифорова')))];
if(parentHits.length!==2)throw Error('Katya must have two parent links');
const basePaths=parentHits.map(hit=>hit.attrs.d);
katya.handlers.click();
for(const hit of parentHits){
 const d=hit.attrs.d,turns=(d.match(/Q/g)||[]).length;if(turns!==2)throw Error(`Katya parent route has ${turns} bends: ${d}`);
 const nums=d.match(/-?\d+(?:\.\d+)?/g).map(Number),ys=nums.filter((_,i)=>i%2===1);
 if(ys.some(y=>y<Math.min(ys[0],ys.at(-1))||y>Math.max(ys[0],ys.at(-1))))throw Error(`Katya parent route takes a detour: ${d}`);
}
document.handlers.keydown.forEach(f=>f({key:'Escape'}));
if(isSelected())throw Error('Escape did not clear Katya selection');
if(parentHits.some((hit,i)=>hit.attrs.d!==basePaths[i]))throw Error('Reset should restore the original routes');
console.log('Katya parent routes have two rounded bends and stay between generations.');
