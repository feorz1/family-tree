// Exhaustive UI audit. The dedicated port guard prevents writes to the real editor.
module.exports = async function canvasAudit(page, options = {}) {
  if(new URL(page.url()).port!=='18150')throw Error('Use the isolated audit editor on localhost:18150.');
  const stage=options.stage||'setup';
  await page.waitForFunction(()=>!!canvasEditor&&!!frame.contentWindow.familyTreeEditor);
  if(stage==='setup')return page.evaluate(()=>{
    const scene=id=>frame.contentWindow.familyTreeEditor.charts.get(id);
    const clone=value=>structuredClone(value),eps=1e-5;
    const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<eps;
    const onSegment=(p,a,b)=>{
      const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
      return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<eps;
    };
    const onPath=(p,path)=>path.slice(1).some((b,i)=>onSegment(p,path[i],b));
    const touching=(a,b)=>onPath(a[0],b)||onPath(a.at(-1),b)||onPath(b[0],a)||onPath(b.at(-1),a);
    const onPortrait=(p,r)=>!r||((Math.abs(p[0]-r.x)<eps||Math.abs(p[0]-r.x-r.size)<eps)&&p[1]>=r.y-eps&&p[1]<=r.y+r.size+eps)||((Math.abs(p[1]-r.y)<eps||Math.abs(p[1]-r.y-r.size)<eps)&&p[0]>=r.x-eps&&p[0]<=r.x+r.size+eps);
    const ortho=points=>points.slice(1).every((p,i)=>Math.abs(p[0]-points[i][0])<eps||Math.abs(p[1]-points[i][1])<eps);
    const original=clone(data),baselines={};
    for(const [id,s] of frame.contentWindow.familyTreeEditor.charts){
      const paths=Object.fromEntries(s.models.map(m=>[m.key,clone(m.pointsFor(data.routes[id]?.[m.key]))]));
      const joins=[],unions=[];
      for(let i=0;i<s.models.length;i++)for(let j=i+1;j<s.models.length;j++){
        const a=s.models[i],b=s.models[j];
        if(a.familyId&&a.familyId===b.familyId&&touching(paths[a.key],paths[b.key]))joins.push([a.key,b.key]);
      }
      for(const stem of s.models.filter(m=>m.role==='stem'&&m.parents?.length===2))for(const union of s.models.filter(m=>m.union&&stem.parents.every(p=>m.union.includes(p)))){
        if(onPath(paths[stem.key][0],paths[union.key]))unions.push([stem.key,union.key]);
      }
      baselines[id]={paths,joins,unions,nodes:Object.fromEntries(s.nodes.map(n=>[n.id,[n.x,n.y]]))};
    }
    function reset(id){
      clearRoute();data=clone(original);resetCanvasHistory();
      scene(id).setPositions(baselines[id].nodes);
      for(const m of scene(id).models)m.update(data.routes[id]?.[m.key]||null);
      canvasEditor.clearSelection();localDirty=false;buttons();
    }
    function select(key,index){
      const s=scene(chart().id),m=s.models.find(m=>m.key===key);
      setMode('routes');selectRoute(m.hit);
      if(index!==null){const field=document.querySelector('#route-point');field.value=String(index);field.dispatchEvent(new Event('change',{bubbles:true}));}
      return m;
    }
    function paths(id){return Object.fromEntries(scene(id).models.map(m=>[m.key,clone(m.pointsFor(data.routes[id]?.[m.key]))]));}
    function validate(id,key,movingNodes=[]){
      const s=scene(id),base=baselines[id],now=paths(id),errors=[],selectedModel=s.models.find(m=>m.key===key);
      for(const m of s.models){
        const p=now[m.key],old=base.paths[m.key];
        if(!p.every(v=>v.length===2&&v.every(Number.isFinite)))errors.push({type:'invalid-coordinates',key:m.key});
        if(ortho(old)&&data.routes[id]?.[m.key]?.orthogonal!==false&&!ortho(p))errors.push({type:'diagonal',key:m.key,points:p});
        if(!onPortrait(p[0],m.start)||!onPortrait(p.at(-1),m.end))errors.push({type:'detached-portrait',key:m.key,points:p});
        if(p.length>Math.max(12,old.length+6))errors.push({type:'point-growth',key:m.key,before:old.length,after:p.length});
      }
      for(const [a,b] of base.joins)if(!touching(now[a],now[b]))errors.push({type:'broken-family-junction',a,b});
      for(const [stem,union] of base.unions)if(!onPath(now[stem][0],now[union]))errors.push({type:'detached-parent-union',stem,union,start:now[stem][0]});
      if(selectedModel&&!movingNodes.length){
        const allowed=new Set([key]);
        if(selectedModel.familyId)s.models.filter(m=>m.familyId===selectedModel.familyId).forEach(m=>allowed.add(m.key));
        if(selectedModel.union)for(const m of s.models)if(m.parents?.length===2&&m.parents.every(p=>selectedModel.union.includes(p)))s.models.filter(n=>n.familyId===m.familyId).forEach(n=>allowed.add(n.key));
        for(const m of s.models)if(!allowed.has(m.key)&&JSON.stringify(now[m.key])!==JSON.stringify(base.paths[m.key]))errors.push({type:'unrelated-line-moved',key:m.key});
      }
      if(movingNodes.length)for(const m of s.models)for(const [end,index] of [['start',0],['end',now[m.key].length-1]]){
        if(!m[end])continue;const uid=m[end+'Node'],old=end==='start'?base.paths[m.key][0]:base.paths[m.key].at(-1);
        const n=s.nodes.find(n=>n.id===uid),delta=movingNodes.includes(uid)?[n.x-base.nodes[uid][0],n.y-base.nodes[uid][1]]:[0,0];
        if(!same(now[m.key][index],old.map((v,i)=>v+delta[i])))errors.push({type:'port-drift-after-card-move',key:m.key,end,uid});
      }
      return errors;
    }
    window.__canvasAudit={original,baselines,reset,select,validate,paths};
    return {charts:Object.entries(baselines).map(([id,b])=>({id,lines:Object.keys(b.paths).length,points:Object.values(b.paths).reduce((n,p)=>n+p.length,0),nodes:Object.keys(b.nodes).length,joins:b.joins.length,unions:b.unions.length})),initialFailures:Object.keys(baselines).flatMap(id=>validate(id,null).map(e=>({chart:id,...e})))};
  });
  if(stage==='persistence'){
    const ids=await page.evaluate(()=>Object.keys(__canvasAudit.baselines));
    await page.evaluate(ids=>ids.forEach(id=>__canvasAudit.reset(id)),ids);
    const failures=[],checked=[];
    for(const id of ids){
      await page.evaluate(id=>{const field=document.querySelector('#chart');field.value=id;field.dispatchEvent(new Event('change',{bubbles:true}));syncSelect(field);setMode('people')},id);
      await page.waitForFunction(id=>frame.contentWindow.location.hash==='#'+id,id);
      await page.evaluate(id=>{
        const s=frame.contentWindow.familyTreeEditor.charts.get(id);canvasEditor.clearSelection();
        for(const card of s.nodeElements.values())card.dispatchEvent(new frame.contentWindow.MouseEvent('click',{shiftKey:true,bubbles:true,cancelable:true}));
        for(const key of ['ArrowRight','ArrowDown'])frame.contentDocument.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key,shiftKey:true,bubbles:true,cancelable:true}));
      },id);
      const group=await page.evaluate(id=>{
        const h=__canvasAudit,s=frame.contentWindow.familyTreeEditor.charts.get(id),uids=s.nodes.map(n=>n.id),errors=h.validate(id,null,uids);
        for(const n of s.nodes){const before=h.baselines[id].nodes[n.id];if(Math.abs(n.x-before[0]-10)>1e-5||Math.abs(n.y-before[1]-10)>1e-5)errors.push({type:'group-selection-or-movement-failed',uid:n.id});}
        const current=JSON.stringify(h.paths(id));
        frame.contentDocument.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true}));
        frame.contentDocument.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:'z',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}));
        if(JSON.stringify(h.paths(id))!==current)errors.push({type:'group-undo-redo-drift'});
        const union=s.models.find(m=>m.union),uid=union?.startNode||s.nodes[0].id;
        s.nodeElements.get(uid).dispatchEvent(new frame.contentWindow.MouseEvent('click',{bubbles:true,cancelable:true}));
        frame.contentDocument.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
        errors.push(...h.validate(id,null,uids));
        const baseline=h.baselines[id];
        h.baselines[id]={...baseline,paths:h.paths(id),nodes:Object.fromEntries(s.nodes.map(n=>[n.id,[n.x,n.y]]))};
        const model=union||s.models.find(m=>m.start&&m.end)||s.models[0];
        h.select(model.key,model.pointsFor(data.routes[id]?.[model.key]).length-1);
        document.querySelector('[data-nudge="0,-10"]').click();
        errors.push(...h.validate(id,model.key));h.baselines[id]=baseline;
        return {nodes:uids.length,lines:s.models.length,errors};
      },id);
      checked.push({chart:id,nodes:group.nodes,lines:group.lines});
      failures.push(...group.errors.map(e=>({chart:id,...e})));
    }
    if(failures.length)return {stage,checked,failures};
    const displayed=await page.evaluate(()=>Object.fromEntries([...frame.contentWindow.familyTreeEditor.charts].map(([id,s])=>[id,Object.fromEntries(s.models.map(m=>[m.key,{path:m.hit.getAttribute('d'),start:m.startNode,end:m.endNode}]))])));
    const origin=await page.evaluate(()=>frame.contentWindow.performance.timeOrigin);
    await page.locator('#save').click();
    await page.waitForFunction(previous=>!localDirty&&frame.contentWindow.performance.timeOrigin!==previous&&frame.contentDocument.readyState==='complete'&&!!frame.contentWindow.familyTreeEditor,origin);
    const reopened=await page.evaluate(()=>Object.fromEntries([...frame.contentWindow.familyTreeEditor.charts].map(([id,s])=>[id,Object.fromEntries(s.models.map(m=>[m.key,{path:m.hit.getAttribute('d'),start:m.startNode,end:m.endNode}]))])));
    if(JSON.stringify(displayed)!==JSON.stringify(reopened)){
      for(const id of ids)for(const key of new Set([...Object.keys(displayed[id]),...Object.keys(reopened[id])]))if(JSON.stringify(displayed[id][key])!==JSON.stringify(reopened[id][key]))failures.push({type:'save-reopen-drift',chart:id,key,before:displayed[id][key],after:reopened[id][key]});
    }
    return {stage,checked,savedAndReopened:true,failures};
  }
  const id=options.chart;
  await page.evaluate(id=>{
    if(document.querySelector('#chart').value===id)return;
    const field=document.querySelector('#chart');field.value=id;field.dispatchEvent(new Event('change',{bubbles:true}));syncSelect(field);
  },id);
  await page.waitForFunction(id=>frame.contentWindow.location.hash==='#'+id&&!!frame.contentWindow.familyTreeEditor.charts.get(id),id);
  let preview=page.frames().find(f=>f.name()==='family-tree-admin-preview');
  await preview.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const inventory=await page.evaluate(id=>{const b=__canvasAudit.baselines[id];return {keys:Object.keys(b.paths),nodes:Object.keys(b.nodes)}},id);
  const from=options.from||0,to=Math.min(options.to??inventory.keys.length,inventory.keys.length);
  if(stage==='arrows'||stage==='keys')return page.evaluate(({id,from,to,keys,stage})=>{
    const h=__canvasAudit,failures=[];let points=0,actions=0;
    for(const key of keys.slice(from,to)){
      const count=h.baselines[id].paths[key].length;
      for(let index=0;index<count;index++){
        h.reset(id);h.select(key,index);
        for(const [step,delta] of ['10,0','0,10','-10,0','0,-10'].entries()){
          if(stage==='keys'){
            const target=route.handles.querySelector('.editing-point.active');
            target.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'][step],shiftKey:step%2===1,bubbles:true,cancelable:true}));
          }else document.querySelector('[data-nudge="'+delta+'"]').click();
          actions++;
          const errors=h.validate(id,key);
          const length=route.model.pointsFor(route.override).length;
          if((index===0&&selectedPoint!==0)||(index===count-1&&selectedPoint!==length-1))errors.push({type:'selection-drift',key,index,selected:selectedPoint,length});
          if(errors.length){failures.push({key,index,delta,errors});break;}
        }
        points++;
        if(failures.length>=12)break;
      }
      if(failures.length>=12)break;
    }
    h.reset(id);return {stage,chart:id,from,to,points,actions,failures};
  },{id,from,to,keys:inventory.keys,stage});
  async function center(target){
    await target.scrollIntoViewIfNeeded();
    await target.evaluate(element=>{
      const view=element.closest('.viewport'),r=element.getBoundingClientRect(),v=view.getBoundingClientRect();
      view.scrollLeft+=r.left+r.width/2-v.left-view.clientWidth/2;
      view.scrollTop+=r.top+r.height/2-v.top-view.clientHeight/2;
    });
  }
  if(stage==='drag'){
    let count=0,failures=[];
    for(const key of inventory.keys.slice(from,to)){
      const n=await page.evaluate(({id,key})=>__canvasAudit.baselines[id].paths[key].length,{id,key});
      for(let index=0;index<n;index++){
        await page.evaluate(({id,key,index})=>{__canvasAudit.reset(id);__canvasAudit.select(key,index)},{id,key,index});
        const marker=preview.locator('.editing-point[data-point="'+index+'"]');
        await center(marker);const b=await marker.boundingBox();
        await page.keyboard.down('Alt');await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
        await page.mouse.move(b.x+b.width/2+23,b.y+b.height/2+17,{steps:3});await page.mouse.up();await page.keyboard.up('Alt');
        const errors=await page.evaluate(({id,key,index,n})=>{
          const errors=__canvasAudit.validate(id,key);
          if(!localDirty)errors.push({type:'drag-did-not-start',key,index});
          const length=route.model.pointsFor(route.override).length;
          if((index===0&&selectedPoint!==0)||(index===n-1&&selectedPoint!==length-1))errors.push({type:'selection-drift',key,index,selected:selectedPoint,length});
          return errors;
        },{id,key,index,n});
        if(errors.length)failures.push({key,index,errors});count++;
        if(failures.length>=12)break;
      }
      if(failures.length>=12)break;
    }
    await page.evaluate(id=>__canvasAudit.reset(id),id);
    return {stage,chart:id,from,to,points:count,failures};
  }
  if(stage==='segments'){
    let count=0,skipped=0,failures=[];
    for(const key of inventory.keys.slice(from,to)){
      const n=await page.evaluate(({id,key})=>__canvasAudit.baselines[id].paths[key].length-1,{id,key});
      for(let index=0;index<n;index++){
        const horizontal=await page.evaluate(({id,key,index})=>{
          __canvasAudit.reset(id);__canvasAudit.select(key,null);
          const p=route.model.pointsFor(route.override);return Math.abs(p[index][1]-p[index+1][1])<1e-6;
        },{id,key,index});
        const marker=preview.locator('.editing-segment[data-segment="'+index+'"]');
        if(!await marker.count()){skipped++;continue;}
        await center(marker);const b=await marker.boundingBox();
        await page.keyboard.down('Alt');await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
        await page.mouse.move(b.x+b.width/2+(horizontal?0:19),b.y+b.height/2+(horizontal?19:0),{steps:3});await page.mouse.up();await page.keyboard.up('Alt');
        const errors=await page.evaluate(({id,key})=>{
          const errors=__canvasAudit.validate(id,key);if(!localDirty)errors.push({type:'segment-drag-did-not-start',key});return errors;
        },{id,key});
        if(errors.length)failures.push({key,index,errors});count++;
        if(failures.length>=12)break;
      }
      if(failures.length>=12)break;
    }
    await page.evaluate(id=>__canvasAudit.reset(id),id);
    return {stage,chart:id,from,to,segments:count,withoutHandle:skipped,failures};
  }
  if(stage==='cards'){
    let count=0,failures=[];
    const start=options.from||0,end=Math.min(options.to??inventory.nodes.length,inventory.nodes.length);
    for(const uid of inventory.nodes.slice(start,end)){
      await page.evaluate(id=>{__canvasAudit.reset(id);setMode('people')},id);
      const card=preview.locator('#chart-'+id+' [data-person="'+uid+'"]');await center(card);const b=await card.boundingBox();
      await page.keyboard.down('Alt');await page.mouse.move(b.x+b.width/2,b.y+45);await page.mouse.down();
      await page.mouse.move(b.x+b.width/2+31,b.y+68,{steps:4});await page.mouse.up();await page.keyboard.up('Alt');
      const errors=await page.evaluate(({id,uid})=>{
        const errors=__canvasAudit.validate(id,null,[uid]),before=__canvasAudit.baselines[id].nodes[uid];
        const after=frame.contentWindow.familyTreeEditor.charts.get(id).nodes.find(n=>n.id===uid);
        if(!localDirty||Math.hypot(after.x-before[0],after.y-before[1])<5)errors.push({type:'card-drag-did-not-start',uid});
        return errors;
      },{id,uid});
      if(errors.length)failures.push({uid,errors});count++;
      if(failures.length>=12)break;
    }
    await page.evaluate(id=>__canvasAudit.reset(id),id);
    return {stage,chart:id,from:start,to:end,nodes:count,failures};
  }
  throw Error('Unknown audit stage: '+stage);
};
