const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const G=require('../admin/diagram-geometry.cjs');
const Routing=require('../admin/auto-router.cjs');
const {render}=require('./helpers/render-tree.cjs');
const {audit,overlap,segments,crossing}=require('./helpers/route-audit.cjs');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/tree.js'),'utf8').replace(/^const treeData = /,'').replace(/;\s*$/,''));
const route=Routing.createAutoRouter();
const plain=value=>JSON.parse(JSON.stringify(value));
function initial(scene,chartId,data){
  return {nodes:Object.fromEntries(scene.nodes.map(n=>[n.id,[n.x,n.y]])),paths:scene.models.map(model=>({model,points:G.copy(model.pointsFor(data.routes[chartId]?.[model.key])),override:structuredClone(data.routes[chartId]?.[model.key]||{})}))};
}
function check(scene,nodes,plans,context){
  const models=scene.models.map(model=>({...model,points:plans.get(model.key).points}));
  const report=audit({id:context,nodes,models});
  assert.deepEqual(report.hits,[],context+': portraits and names must remain unobstructed');
  assert.deepEqual(report.overlaps,[],context+': independent lines must not share a stretch');
  for(const m of models){
    assert.ok(m.points.length<=18,context+': unexpected detour '+m.key);
    assert.ok(G.isOrthogonal(m.points),context+': orthogonal segments');
    assert.equal(G.normalize(m.points).length,m.points.length,context+': redundant points');
    const ss=segments(m.points);
    for(let i=0;i<ss.length;i++)for(let j=i+2;j<ss.length;j++){
      assert.ok(overlap(ss[i],ss[j])<.01,context+': backtracking '+m.key);
      assert.equal(crossing(ss[i],ss[j]),null,context+': self-intersection '+m.key);
    }
    for(const side of ['start','end'])if(m[side+'Node']){
      const n=nodes.find(n=>n.id===m[side+'Node']),p=side==='start'?m.points[0]:m.points.at(-1);
      assert.ok(G.same(G.project({x:n.x+23,y:n.y,size:150},p),p),context+': detached port '+m.key);
    }
  }
  for(const stem of models.filter(m=>m.role==='stem')){
    const union=models.find(m=>m.union&&stem.parents.length===2&&stem.parents.every(id=>m.union.includes(id)));
    if(union)assert.ok(G.pathAnchor(union.points,stem.points[0]).distance<.01,context+': detached parent union');
    for(const branch of models.filter(m=>m.familyId===stem.familyId&&m.role==='branch'))assert.ok(models.some(m=>m!==branch&&m.familyId===stem.familyId&&G.pathAnchor(m.points,branch.points[0]).distance<.01),context+': detached child '+branch.key);
  }
}
let cases=0;
for(const [id,scene] of render(data)){
  const start=initial(scene,id,data);
  const selected=[...new Set([scene.nodes[0].id,...scene.models.filter(m=>m.role==='branch').slice(0,2).map(m=>m.endNode),...scene.models.filter(m=>m.union).slice(-1).flatMap(m=>m.union)])];
  const arrangements=[scene.nodes.map(n=>({...n,x:n.x+100,y:n.y+100}))];
  for(const who of selected)for(const [dx,dy] of [[20,30],[350,300],[-300,650]]){
    const nodes=scene.nodes.map(n=>({...n,...(n.id===who?{x:Math.max(40,n.x+dx),y:n.y+dy}:{})}));
    if(nodes.some(a=>nodes.some(b=>a!==b&&a.x<b.x+220&&a.x+220>b.x&&a.y<b.y+240&&a.y+240>b.y)))continue;
    arrangements.push(nodes);
  }
  const siblings=scene.models.filter(m=>m.role==='branch');
  const pair=siblings.find(a=>siblings.some(b=>b!==a&&b.familyId===a.familyId));
  if(pair){const other=siblings.find(b=>b!==pair&&b.familyId===pair.familyId),a=scene.nodes.find(n=>n.id===pair.endNode),b=scene.nodes.find(n=>n.id===other.endNode);
    arrangements.push(scene.nodes.map(n=>({...n,...(n.id===a.id?{x:b.x,y:b.y}:n.id===b.id?{x:a.x,y:a.y}:{})})));
  }
  for(const [i,nodes] of arrangements.entries()){check(scene,nodes,route(nodes,start),id+':'+i);cases++;}
}
// Moving an unrelated card into the middle of a line must invalidate that line.
const simpleNodes=[{id:'a',x:100,y:100},{id:'b',x:1000,y:100},{id:'obstacle',x:500,y:800}];
const simpleModel={key:'ab',startNode:'a',endNode:'b',members:['a','b']};
const simpleInitial={nodes:Object.fromEntries(simpleNodes.map(n=>[n.id,[n.x,n.y]])),paths:[{model:simpleModel,points:[[273,175],[1023,175]],override:{}}]};
const blockedNodes=simpleNodes.map(n=>n.id==='obstacle'?{...n,y:100}:n),detour=route(blockedNodes,simpleInitial);
check({models:[simpleModel]},blockedNodes,detour,'unrelated obstacle');
assert.ok(detour.get('ab').points.length>2);
// A very long authored route is replaced by a short route after a card moves.
const longPath=[[273,175],[300,175],[300,500],[400,500],[400,700],[800,700],[800,500],[900,500],[900,175],[1023,175]];
const atBorder=simpleNodes.map(n=>n.id==='a'?{...n,x:0,y:0}:n);
check({models:[simpleModel]},atBorder,route(atBorder,simpleInitial),'canvas border');
const cleanup=route(simpleNodes.map(n=>n.id==='b'?{...n,x:1100}:n),{...simpleInitial,paths:[{model:simpleModel,points:longPath,override:{}}]});
assert.equal(cleanup.get('ab').points.length,2,'Old loops must not constrain fresh routing');

// Exercise the real controller, including the interact.js card drag callback,
// arrow/Shift handling, undo/redo, and the actual persisted renderer format.
const working=structuredClone(data),charts=render(working),scene=charts.get('family'),chart=working.charts.find(c=>c.id==='family');
const Element=scene.canvas.constructor;
const controls=new Map(),listeners=new Map(),draggables=[];
const parent={querySelector(selector){if(!controls.has(selector)){const e=new Element('button');e.checked=false;e.closest=()=>e;controls.set(selector,e);}return controls.get(selector);},querySelectorAll(){return [];},addEventListener(){},removeEventListener(){}};
const doc={head:new Element('head'),body:new Element('body'),createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(){}};
doc.defaultView={familyTreeEditor:{charts},addEventListener(){},removeEventListener(){}};
scene.svg.getScreenCTM=()=>({a:1});
const interact=()=>({draggable(options){draggables.push(options.listeners);return {unset(){}};}});interact.stop=()=>{};
const window={};const source=fs.readFileSync(path.join(root,'ui/canvas-editor.js'),'utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(source,{window,document:parent,interact,G,Routing,structuredClone,requestAnimationFrame:fn=>fn(),console});
const errors=[];let changed=0;
const editor=window.mountCanvasEditor({doc,chart:()=>chart,data:()=>working,changed:()=>changed++,route:()=>null,clearRoute(){},setMode(){},selectedPoint:()=>null,syncRouteControls(){},notify:message=>errors.push(message),selectPerson(){}});
const geometry=()=>scene.models.map(m=>[m.key,plain(m.pointsFor(working.routes.family[m.key]))]);
const currentPlans=()=>new Map(scene.models.map(m=>[m.key,{points:m.pointsFor(working.routes.family[m.key])}]));
const before=geometry(),id='ol',n=scene.nodes.find(n=>n.id===id),original=[n.x,n.y];
editor.selectPerson(id);
const target={dataset:{person:id}};
draggables[0].start({target,x0:0,y0:0});
for(let i=1;i<=8;i++)draggables[0].move({clientX:i*10,clientY:i*15,shiftKey:false,altKey:true});
draggables[0].end();
assert.deepEqual(errors,[]);assert.deepEqual([n.x,n.y],[original[0]+80,original[1]+120]);
check(scene,scene.nodes,currentPlans(),'real card drag');
const after=geometry();editor.undo();assert.deepEqual(geometry(),before,'Undo restores the entire geometry transaction');editor.undo(true);assert.deepEqual(geometry(),after,'Redo restores all junctions');
const keyboard=(key,shiftKey=false)=>listeners.get('keydown')({key,shiftKey,target:{closest(){return null;}},preventDefault(){},stopImmediatePropagation(){}});
keyboard('ArrowRight',true);assert.deepEqual([n.x,n.y],[original[0]+90,original[1]+120],'Shift+arrow moves ten pixels');
keyboard('ArrowDown');assert.deepEqual([n.x,n.y],[original[0]+90,original[1]+121],'Arrow moves one pixel');
for(let i=0;i<40;i++){keyboard(i%2?'ArrowLeft':'ArrowRight');check(scene,scene.nodes,currentPlans(),'repeated movement '+i);}
assert.deepEqual(errors,[]);assert.ok(changed>0);
// Cross a sibling's horizontal position, then verify the saved bus ordering.
const crossingNode=scene.nodes.find(n=>n.id==='nik_elder');
draggables[0].start({target:{dataset:{person:'nik_elder'}},x0:0,y0:0});
draggables[0].move({clientX:2000,clientY:20,shiftKey:false,altKey:true});draggables[0].end();
assert.deepEqual(errors,[]);check(scene,scene.nodes,currentPlans(),'changed sibling order');
const reopened=render(working).get('family');
for(const model of reopened.models){const saved=scene.models.find(m=>m.key===model.key);assert.deepEqual(plain(model.pointsFor(working.routes.family[model.key])),plain(saved.pointsFor(working.routes.family[saved.key])),'Saving and reopening must preserve '+model.key);}
check(reopened,reopened.nodes,new Map(reopened.models.map(m=>[m.key,{points:m.pointsFor(working.routes.family[m.key])}])),'reopened');
editor.destroy();
console.log(`Automatic routing: ${cases} real-diagram moves, unrelated obstacle, loop cleanup, live controller drag, repeated arrows, undo/redo and reopening passed.`);
