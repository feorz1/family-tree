// Obstacle-aware orthogonal routing for the editable family graph.
// A gesture always starts from one snapshot: generated bends never become
// constraints for its next frame. Manual routes outside the affected area stay put.
const G = require('./diagram-geometry.cjs');
const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
function intersects(a,b,n,pad=0) {
  let lo=0,hi=1;
  for(let k=0;k<2;k++) {
    const min=(k?n.y:n.x)-pad+.01,max=(k?n.y+220:n.x+196)+pad-.01,d=b[k]-a[k];
    if(Math.abs(d)<1e-8){if(a[k]<=min||a[k]>=max)return false;}
    else {const t=(min-a[k])/d,u=(max-a[k])/d;lo=Math.max(lo,Math.min(t,u));hi=Math.min(hi,Math.max(t,u));}
  }
  return hi>lo+1e-7;
}
const blocked = (path,nodes,except=[]) => nodes.some(n=>!except.includes(n.id)&&path.slice(1).some((p,i)=>intersects(path[i],p,n)));
function overlap(a,b) {
  for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++) {
    const p=a[i-1],q=a[i],s=b[j-1],t=b[j];
    for(const axis of [0,1])if(Math.abs(p[axis]-q[axis])<.01&&Math.abs(s[axis]-t[axis])<.01&&Math.abs(p[axis]-s[axis])<.01) {
      const k=1-axis,len=Math.min(Math.max(p[k],q[k]),Math.max(s[k],t[k]))-Math.max(Math.min(p[k],q[k]),Math.min(s[k],t[k]));
      if(len>.1)return true;
    }
  }
  return false;
}
function createAutoRouter() {
  const {createGrid}=require('./routing-grid.cjs');
  const D={ConnDirUp:1,ConnDirDown:2,ConnDirLeft:4,ConnDirRight:8};
  const direction=value=>({1:'up',2:'down',4:'left',8:'right'}[value]);
  function solve(nodes,paths,specs,active,roots=new Map(),endpointPaths=paths) {
    const byId=new Map(nodes.map(n=>[n.id,n])),endpoints=new Map();
    for(const p of endpointPaths)for(const side of ['start','end'])if(p.model[side+'Node']){
      const id=p.model[side+'Node'];if(!endpoints.has(id))endpoints.set(id,[]);endpoints.get(id).push(p.model.key+':'+side);
    }
    for(const list of endpoints.values())list.sort((a,b)=>Number(!a.startsWith('group:'))-Number(!b.startsWith('group:'))||a.localeCompare(b));
    const portFraction=(id,key)=>{const list=endpoints.get(id),i=list.indexOf(key);return i===0?.5:.5+(i%2?-1:1)*Math.ceil(i/2)*.8/(list.length+1);};
    function end(id,p,other,auto,key){
      if(!id)return {p};
      const n=byId.get(id),fraction=portFraction(id,key);
      const anchor=auto?['top','left','right'].map(side=>({side,fraction})).filter(anchor=>{const p=at(anchor),escape=anchor.side==='top'?[p[0],p[1]-14]:[p[0]+(anchor.side==='left'?-14:14),p[1]];return escape.every(v=>v>=12&&v<=99988);}).sort((a,b)=>{
        const score=a=>{const p=at(a);return Math.abs(p[0]-other[0])+Math.abs(p[1]-other[1])+(a.side==='top'&&other[1]>=n.y?70:0);};return score(a)-score(b);
      })[0]:G.attachment({x:n.x+23,y:n.y,size:150},p);
      function at(a){return a.side==='top'?[n.x+23+150*a.fraction,n.y]:a.side==='bottom'?[n.x+23+150*a.fraction,n.y+150]:[n.x+(a.side==='left'?23:173),n.y+150*a.fraction];}
      return {p:at(anchor),dir:anchor.side,id};
    }
    const descriptors=paths.map(p=>{
      const m=p.model,s=specs.get(m.key)||{},auto=active.has(m.key),ends=s.ends||[p.points[0],p.points.at(-1)];
      const a=end(m.startNode,ends[0],ends[1],auto,m.key+':start'),b=end(m.endNode,ends[1],ends[0],auto,m.key+':end');
      const dir={right:0,left:1,down:2,up:3,top:3,bottom:2};
      for(const [ep,index] of [[a,0],[b,1]]){
        ep.dir=ep.id?dir[ep.dir]:dir[direction(s.directions?.[index])];
        ep.escape=ep.id?ep.p.map((v,k)=>v+(k===0?(ep.dir===0?14:ep.dir===1?-14:0):(ep.dir===2?14:ep.dir===3?-14:0))):ep.p;
      }
      return {p,s,a,b,auto,fixed:!auto?p.points:m.union&&s.unionPath?s.unionPath:null};
    });
    for(const stem of descriptors.filter(d=>d.auto&&d.p.model.role==='stem')){
      const siblings=descriptors.filter(d=>d.p.model.familyId===stem.p.model.familyId);
      const branches=siblings.filter(d=>d.p.model.role==='branch');
      if(branches.length===1&&!siblings.some(d=>d.p.model.role==='bus')){
        stem.pair=branches[0];stem.b=stem.pair.b;stem.pair.skip=true;
        if(!stem.a.id)stem.a.dir=stem.a.dir<2?(stem.b.p[0]>stem.a.p[0]?0:1):(stem.b.p[1]>stem.a.p[1]?2:3);
      }
    }
    const boxes=nodes.flatMap(n=>[[n.x+11,n.y-12,n.x+185,n.y+162],[n.x-12,n.y+143,n.x+208,n.y+232]]).map(b=>b.map(v=>Math.max(12,Math.min(99988,v))));
    const fixed=descriptors.filter(d=>d.fixed).map(d=>d.fixed);
    const escapes=descriptors.filter(d=>!d.fixed&&!d.skip).flatMap(d=>[...(d.a.id?[[d.a.p,d.a.escape]]:[]),...(d.b.id?[[d.b.escape,d.b.p]]:[])]);
    const grid=createGrid(boxes,descriptors.flatMap(d=>[d.a.p,d.a.escape,d.b.p,d.b.escape]),[...fixed,...escapes]);
    const result=new Map();
    const ordered=descriptors.filter(d=>!d.skip).sort((a,b)=>({bus:0,stem:1,branch:2}[a.p.model.role]??3)-({bus:0,stem:1,branch:2}[b.p.model.role]??3));
    for(const d of ordered){
      const {p,s,a,b,auto}=d;let points=d.fixed;
      if(!points){
        const path=grid.find(a.escape,b.escape,a.id?null:a.dir??null,b.id?null:b.dir===undefined?null:b.dir^1,a.id?a.dir^1:null,b.id?b.dir:null);
        if(!path){const error=Error('Недостаточно места для линии. Раздвиньте перекрывающиеся карточки.');error.routeKey=p.model.key;throw error;}
        points=G.normalize([a.p,...path,b.p]);grid.occupy(points);
      }
      if(points.length<2||points.length>62||!G.isOrthogonal(points)||points.some(p=>p.some(v=>!Number.isFinite(v)||v<0||v>100000)))throw Error('Недостаточно места для линии. Раздвиньте перекрывающиеся карточки.');
      if(d.pair){
        const middle=G.pointOnPath(points,.5);
        // Locate by distance rather than a stored corner index.
        let segment=0;
        for(let j=1;j<points.length;j++)if(G.pathAnchor([points[j-1],points[j]],middle).distance<.01){segment=j-1;break;}
        result.set(p.model.key,{points:G.normalize([...points.slice(0,segment+1),middle]),automatic:true});
        result.set(d.pair.p.model.key,{points:G.normalize([middle,...points.slice(segment+1)]),automatic:true});
      }else result.set(p.model.key,{points,children:s.children,automatic:auto});
    }
    return result;
  }

  return function route(nodes,initial) {
    const paths=initial.paths,old=initial.nodes;
    const moved=nodes.filter(n=>!G.same([n.x,n.y],old[n.id]));
    if(!moved.length)return new Map(paths.map(p=>[p.model.key,{points:G.copy(p.points),children:p.override.children}]));
    const active=new Set(),families=new Map();
    for(const p of paths) {
      if(p.model.familyId){if(!families.has(p.model.familyId))families.set(p.model.familyId,[]);families.get(p.model.familyId).push(p);}
      if(p.model.members.some(id=>moved.some(n=>n.id===id))||blocked(p.points,moved,[p.model.startNode,p.model.endNode]))active.add(p.model.key);
    }
    const activateFamily=id=>{for(const p of families.get(id)||[])active.add(p.model.key);};
    const expand=()=>{
      for(const [id,group] of families)if(group.some(p=>active.has(p.model.key)))activateFamily(id);
      for(const p of paths.filter(p=>p.model.union&&active.has(p.model.key)))for(const [id,group] of families)if(group[0].model.parents.every(id=>p.model.union.includes(id)))activateFamily(id);
    };
    // Include any pre-existing overlap in the same routing transaction.
    for(const a of paths.filter(p=>active.has(p.model.key)))for(const b of paths)if(!b.override.hidden&&overlap(a.points,b.points))active.add(b.model.key);
    expand();
    let result;
    for(let pass=0;pass<2;pass++) {
      const specs=new Map(),roots=new Map(),byId=new Map(nodes.map(n=>[n.id,n]));
      const unions=paths.filter(p=>p.model.union),unionPaths=solve(nodes,unions,new Map(),active,new Map(),paths);
      for(const p of unions)specs.set(p.model.key,{unionPath:unionPaths.get(p.model.key).points});
      const lanes=[];
      for(const [id,group] of families) {
        if(!group.some(p=>active.has(p.model.key)))continue;
        const stem=group.find(p=>p.model.role==='stem'),branches=group.filter(p=>p.model.role==='branch'),buses=group.filter(p=>p.model.role==='bus').sort((a,b)=>Number(a.model.key.split(':').at(-1))-Number(b.model.key.split(':').at(-1)));
        if(!stem||!branches.length)continue;
        const parents=stem.model.parents.map(id=>byId.get(id)),children=branches.map(p=>byId.get(p.model.endNode));
        const union=unions.find(p=>parents.length===2&&parents.every(n=>p.model.union.includes(n.id)));
        let root=stem.points[0],tangent=D.ConnDirLeft|D.ConnDirRight;
        if(union) {
          const path=unionPaths.get(union.model.key).points;root=G.pointOnPath(path,.5);
          // Prefer the centre of a long, unobstructed union segment. An old
          // detour's arclength fraction is not a meaningful family attachment.
          const candidates=path.slice(1).map((q,i)=>{const p=path[i],len=Math.hypot(q[0]-p[0],q[1]-p[1]);return {point:p.map((v,k)=>(v+q[k])/2),len,tangent:p[1]===q[1]?D.ConnDirLeft|D.ConnDirRight:D.ConnDirUp|D.ConnDirDown};}).filter(c=>!nodes.some(n=>{const [x,y]=c.point;return x>n.x+11&&x<n.x+185&&y>n.y-12&&y<n.y+162||x>n.x-12&&x<n.x+208&&y>n.y+143&&y<n.y+232;}));
          const best=candidates.sort((a,b)=>b.len-a.len)[0];
          if(best){root=best.point;tangent=best.tangent;}
          if(!roots.has(union.model.key))roots.set(union.model.key,[]);
          const used=roots.get(union.model.key);if(used.length)root=G.pointOnPath(path,.5+used.length*.08);
          used.push({point:root,tangent});specs.set(union.model.key,{unionPath:path});
        }
        const middle=median(children.map(n=>n.x+98));
        const rootX=union?root[0]:(middle<parents[0].x+98?parents[0].x-28:parents[0].x+224);
        const items=children.map(n=>({id:n.id,x:n.x+98}));
        // A bus with N children has N+1 junctions, including its root. Keep the
        // saved bus model IDs, but rebuild their order after children cross.
        if(buses.length>=items.length)items.push({id:null,x:rootX});
        items.sort((a,b)=>a.x-b.x||String(a.id).localeCompare(String(b.id)));
        for(let i=1;i<items.length;i++)items[i].x=Math.max(items[i].x,items[i-1].x+18);
        const rx=items.find(i=>i.id===null)?.x||items.reduce((a,b)=>Math.abs(a.x-rootX)<Math.abs(b.x-rootX)?a:b).x;
        const floor=Math.max(...parents.map(n=>n.y+220)),childY=median(children.map(n=>n.y)),ideal=(floor+childY)/2;
        const xs=items.map(i=>i.x),left=Math.min(...xs),right=Math.max(...xs);
        const candidates=[ideal,...nodes.flatMap(n=>[n.y-28,n.y+248]),...lanes.flatMap(l=>[l.y-24,l.y+24])].filter(y=>y>=24&&y<99960);
        const score=y=>Math.abs(y-ideal)+nodes.reduce((sum,n)=>sum+(intersects([left,y],[right,y],n,12)?10000:0)+xs.reduce((s,x)=>s+(x>n.x-14&&x<n.x+210&&y>n.y-14&&y<n.y+234?1e7:0),0),0)+lanes.reduce((s,l)=>s+(right>l.left&&left<l.right&&Math.abs(y-l.y)<20?1e5:0),0);
        const busY=candidates.sort((a,b)=>score(a)-score(b))[0];lanes.push({left,right,y:busY});
        const stemEnd=[rx,busY],sourceY=union?root[1]:parents[0].y+75;
        const stemDir=tangent===(D.ConnDirLeft|D.ConnDirRight)?(busY>sourceY?D.ConnDirDown:D.ConnDirUp):(rx>root[0]?D.ConnDirRight:D.ConnDirLeft);
        specs.set(stem.model.key,{ends:[root,stemEnd],directions:[union?stemDir:null,busY>sourceY?D.ConnDirUp:D.ConnDirDown]});
        for(const branch of branches) {
          const item=items.find(i=>i.id===branch.model.endNode),n=byId.get(branch.model.endNode);
          specs.set(branch.model.key,{ends:[[item.x,busY],branch.points.at(-1)],directions:[n.y>=busY?D.ConnDirDown:D.ConnDirUp,null]});
        }
        for(let i=0;i<buses.length;i++) {
          // Initial generated diagrams can coalesce equal-X child junctions.
          // The last available span covers the remaining junctions in that case.
          const a=items[Math.min(i,items.length-2)],b=items[i===buses.length-1?items.length-1:Math.min(i+1,items.length-1)];
          const mid=(a.x+b.x)/2,reachable=items.filter(c=>c.id&&mid>Math.min(rx,c.x)&&mid<Math.max(rx,c.x)).map(c=>c.id);
          specs.set(buses[i].model.key,{ends:[[a.x,busY],[b.x,busY]],directions:[D.ConnDirRight,D.ConnDirLeft],children:reachable});
        }
      }
      result=solve(nodes,paths,specs,active,roots);
      let more=false;
      for(const a of paths.filter(p=>active.has(p.model.key)))for(const b of paths.filter(p=>!active.has(p.model.key)&&!p.override.hidden))if(overlap(result.get(a.model.key).points,b.points)){active.add(b.model.key);more=true;}
      if(!more)break;expand();
    }
    return result;
  };
}
module.exports={createAutoRouter,intersects,overlap};
