const assert = require('node:assert/strict');
const G = require('../admin/diagram-geometry.cjs');
const original = [[10,20],[80,20],[80,150],[200,150]];
const intact = structuredClone(original);
const moved = G.moveVertex(original,1,[120,60]);
assert.deepEqual(original,intact,'Dragging must not mutate the gesture starting geometry');
assert.deepEqual(moved[0],original[0]);
assert.deepEqual(moved.at(-1),original.at(-1));
function rightAngles(points) {
  for(let i=1;i<points.length;i++)assert.ok(points[i][0]===points[i-1][0]||points[i][1]===points[i-1][1],JSON.stringify(points));
}
rightAngles(moved);
assert.equal(G.isOrthogonal(original),true);
assert.equal(G.isOrthogonal([[0,0],[10,20]]),false);
const junction = G.moveVertex([[100,100],[200,100],[200,300]],1,[250,100],true,{start:true,end:false});
assert.deepEqual(junction,[[100,100],[250,100],[250,300]],'A free family junction follows its bend');
assert.deepEqual(G.moveEnds(original,[40,70],[230,200]),original.map(([x,y])=>[x+30,y+50]),'Group movement preserves all bends');
for(const [start,end] of [[[0,0],[300,350]],[[150,80],[200,150]],[[10,20],[3,4]]]) {
  const result=G.moveEnds(original,start,end);
  assert.deepEqual(result[0],start);assert.deepEqual(result.at(-1),end);rightAngles(result);
}
assert.deepEqual(G.constrain([80,30],true),[80,0]);
assert.deepEqual(G.constrain([20,-90],true),[0,-90]);
assert.deepEqual(G.constrain([20,-90],false),[20,-90]);
assert.deepEqual(G.attachment({x:100,y:200,size:150},[250,275]),{side:'right',fraction:.5});
assert.deepEqual(G.attachment({x:100,y:200,size:150},[50,900]),{side:'left',fraction:1});
assert.deepEqual(G.midpoint([[0,0],[100,0],[100,200]]),[100,50]);
const elbow=[[0,0],[100,0],[100,200]];
assert.deepEqual(G.pathAnchor(elbow,[120,80]).point,[100,80]);
assert.equal(G.pathAnchor(elbow,[120,80]).fraction,.6);
assert.deepEqual(G.pointOnPath(elbow,.6),[100,80]);
for(const x of [42,58]){
  const fraction=G.pathAnchor([[0,0],[100,0]],[x,0]).fraction;
  const attached=G.pointOnPath([[0,0],[50,0],[50,60],[100,60]],fraction);
  assert.ok(G.pathAnchor([[0,0],[50,0],[50,60],[100,60]],attached).distance<1e-9,'Offset sibling stems must remain on a bent parent union');
}
assert.deepEqual(G.project({x:100,y:200,size:150},[240,275]),[250,275],'An attached endpoint must be projected before editing bends');
assert.deepEqual(G.moveEnds([[0,0],[100,100]],[10,20],[120,140],false),[[10,20],[120,140]],'Free routing must preserve a diagonal');

// The public renderer must honor an explicit position even for a child normally
// centered below its parents. It must also render saved free junctions verbatim.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Classes {
  constructor(){this.items=new Set();}
  add(...items){items.forEach(item=>this.items.add(item));}
  remove(...items){items.forEach(item=>this.items.delete(item));}
  contains(item){return this.items.has(item);}
  toggle(item,on=!this.contains(item)){on?this.add(item):this.remove(item);}
}
class Element {
  constructor(tag){this.tag=tag;this.style={};this.children=[];this.attrs={};this.classList=new Classes();this.clientWidth=1000;this.clientHeight=560;this.scrollLeft=0;this.scrollTop=0;}
  setAttribute(key,value){this.attrs[key]=value;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(){}
  querySelector(){return new Element("button");}
  getBoundingClientRect(){return {left:0,top:0,width:0,height:0};}
}
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const document={body:new Element('body'),addEventListener(){},querySelector(){return new Element('root');},createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag)};
const window={name:'family-tree-admin-preview'};
const context=vm.createContext({document,window,console,Uint8Array,Float64Array,Int32Array});
vm.runInContext(fs.readFileSync(path.join(root,'data/tree.js'),'utf8'),context);
vm.runInContext('treeData.charts.find(c=>c.id==="family").nodes.find(n=>n.id==="you").position=[4100,3400]',context);
vm.runInContext(fs.readFileSync(path.join(root,'assets/portrait.js'),'utf8'),context);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context,{timeout:30000});
const actual=vm.runInContext('charts.find(c=>c.id==="family").nodes.find(n=>n.id==="you")',context);
assert.equal(actual.x,4100);assert.equal(actual.y,3400);
const scene=window.familyTreeEditor.charts.get('family');
function onPortrait(point,rect) {
  if(!rect)return true;
  const [x,y]=point,eps=1e-6;
  return ((Math.abs(x-rect.x)<eps||Math.abs(x-rect.x-rect.size)<eps)&&y>=rect.y-eps&&y<=rect.y+rect.size+eps)
    ||((Math.abs(y-rect.y)<eps||Math.abs(y-rect.y-rect.size)<eps)&&x>=rect.x-eps&&x<=rect.x+rect.size+eps);
}
const reversedGodparent=scene.models.find(m=>m.key.includes('para_sis')&&m.key.includes('aga_sis'));
assert.ok(onPortrait(reversedGodparent.pointsFor(null)[0],reversedGodparent.start),'The recorded godparent line must start on its actual bound portrait before any edit');
for(const chart of window.familyTreeEditor.charts.values())for(const model of chart.models){
  const override=vm.runInContext('routes',context)[model.chart]?.[model.key];
  const points=model.pointsFor(override);
  assert.ok(onPortrait(points[0],model.start),model.key+': start binding differs from the visible line');
  assert.ok(onPortrait(points.at(-1),model.end),model.key+': end binding differs from the visible line');
}

const free=scene.models.find(m=>!m.start&&!m.end);
const saved={points:[[50,400]],startPoint:[50,60],endPoint:[300,400],radius:8,hidden:true};
free.update(saved);
assert.deepEqual(JSON.parse(JSON.stringify(free.pointsFor(saved))),[[50,60],[50,400],[300,400]]);
assert.equal(free.group.style.display,'none');
free.update(null);assert.equal(free.group.style.display,'');
const source=fs.readFileSync(path.join(root,'data/tree.js'),'utf8').trim();
const savedData=JSON.parse(source.slice('const treeData = '.length,-1));
savedData.routes.family=Object.fromEntries(scene.models.map(model=>{
  const points=model.pointsFor(null),value={points:G.copy(points.slice(1,-1)),startPoint:[...points[0]],endPoint:[...points.at(-1)],radius:8,frozen:true};
  if(model.start){value.start=G.attachment(model.start,points[0]);value.startNode=model.startNode;}
  if(model.end){value.end=G.attachment(model.end,points.at(-1));value.endNode=model.endNode;}
  if(model.role==='bus')value.children=[...model.routeChildren];
  return [model.key,value];
}));
const savedFamily=savedData.charts.find(c=>c.id==='family');
const sergey=scene.nodes.find(n=>n.id==='ser');
// Even when portraits overlap and automatic routing cannot find a path,
// an existing manual connector must remain present after reopening.
savedFamily.nodes.find(n=>n.id==='ol').position=[sergey.x-100,sergey.y];
const reopenedWindow={name:'family-tree-admin-preview'};
const reopened=vm.createContext({document,window:reopenedWindow,console,Uint8Array,Float64Array,Int32Array});
vm.runInContext('const treeData = '+JSON.stringify(savedData),reopened);
vm.runInContext(fs.readFileSync(path.join(root,'assets/portrait.js'),'utf8'),reopened);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],reopened,{timeout:30000});
const reopenedScene=reopenedWindow.familyTreeEditor.charts.get('family');
for(const model of reopenedScene.models){
  const previous=scene.models.find(m=>m.key===model.key);
  assert.equal(model.startNode,previous.startNode,model.key+': start binding changed after reopening');
  assert.equal(model.endNode,previous.endNode,model.key+': end binding changed after reopening');
}
assert.equal(reopenedScene.models.map(m=>m.key).sort().join('\n'),scene.models.map(m=>m.key).sort().join('\n'),'Reopening must not add buses or drop saved connectors');
for(const bus of reopenedScene.models.filter(m=>m.role==='bus')) {
  const value=savedData.routes.family[bus.key];
  assert.deepEqual(JSON.parse(JSON.stringify(bus.pointsFor(value))),[value.startPoint,...value.points,value.endPoint]);
}
console.log('Canvas geometry: attachments, axis lock, shared junctions, group translation and saved card positions passed.');
