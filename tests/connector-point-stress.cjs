// Run canvasAudit(page, {stage:'setup'}) first, then each stress stage against
// the same disposable editor. This deliberately edits private test fixtures.
module.exports=async function connectorPointStress(page,{stage='junction'}={}){
 if(new URL(page.url()).port!=='18150')throw Error('Use the isolated audit editor on port 18150');
 await page.waitForFunction(()=>!!canvasEditor&&!!frame.contentWindow.familyTreeEditor);
 if(!await page.evaluate(()=>!!window.__canvasAudit))throw Error('Run the canvasAudit setup stage first');
 await page.evaluate(()=>{const field=document.querySelector('#chart');field.value='family';field.dispatchEvent(new Event('change',{bubbles:true}));syncSelect(field);});
 await page.waitForFunction(()=>frame.contentWindow.location.hash==='#family');
 const result=await page.evaluate(stage=>{
  const h=__canvasAudit,id='family';h.reset(id);setMode('routes');const scene=frame.contentWindow.familyTreeEditor.charts.get(id);
  const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5;
  const points=m=>m.pointsFor(data.routes[id]?.[m.key]);
  const stem=scene.models.find(m=>m.role==='stem'&&m.parents.length===2&&points(m).length===2&&scene.models.some(b=>b.familyId===m.familyId&&b.role==='bus'&&[points(b)[0],points(b).at(-1)].some(p=>same(p,points(m).at(-1)))));
  if(!stem)throw Error('No shared-junction fixture');
  const bus=scene.models.find(m=>m.familyId===stem.familyId&&m.role==='bus'&&[points(m)[0],points(m).at(-1)].some(p=>same(p,points(stem).at(-1))));
  const [a,b]=points(stem),dense=Array.from({length:62},(_,i)=>a.map((v,k)=>v+(b[k]-v)*i/61));
  if(stage==='insert'){
    h.select(stem.key,null);const failures=[];
    const field=document.querySelector('#route-point');field.value='0';field.dispatchEvent(new Event('change',{bubbles:true}));
    for(let i=0;i<10;i++){
      document.querySelector('#add-midpoint').click();
      if(points(stem).length!==3||selectedPoint!==1){failures.push({kind:'inserted-point-lost-or-accumulated',iteration:i,count:points(stem).length,selectedPoint});break;}
    }
    document.querySelector('[data-nudge="10,0"]').click();
    failures.push(...h.validate(id,stem.key));
    h.reset(id);return {stage,failures};
  }
  if(stage==='drag'){
    // Simulate an already-open or saved route made by the old editor. Going
    // through the new writer here would clean it before the real mouse drag.
    h.select(stem.key,null);route.override.points=dense.slice(1,-1);route.override.startPoint=a;route.override.endPoint=b;applyRoute();drawHandles();
    const field=document.querySelector('#route-point');field.value='30';field.dispatchEvent(new Event('change',{bubbles:true}));
    window.__pointStressGrabbed=route.handles.querySelector('[data-point="30"]');
    return {key:stem.key};
  }
  if(stage==='growth'||stage==='capacity'){
    const genuine=[a];
    for(let i=0;i<61;i++){
      const p=[...genuine.at(-1)];
      if(i%2===0)p[1]=a[1]+(b[1]-a[1])*(Math.floor(i/2)+1)/31;
      else p[0]=a[0]+(p[0]===a[0]?20:0);
      genuine.push(p);
    }
    genuine[genuine.length-1]=b;
    h.select(stem.key,null);canvasEditor.setRoutePoints(genuine);drawHandles();
    if(points(stem).length!==62)throw Error('The genuine 60-bend fixture was simplified unexpectedly');
    if(stage==='capacity'){
      const before=JSON.stringify(data.routes[id]),next=points(stem).map(p=>[...p]);
      const p=next[10],q=next[11];
      next.splice(11,0,[p[0]+7,p[1]+3],[q[0]+7,q[1]+3]);
      const accepted=canvasEditor.setRoutePoints(next),failures=[];
      if(accepted||JSON.stringify(data.routes[id])!==before)failures.push({kind:'partial-over-limit-edit'});
      h.reset(id);return {stage,failures};
    }
    const field=document.querySelector('#route-point');field.value='30';field.dispatchEvent(new Event('change',{bubbles:true}));
    if(selectedPoint!==30)throw Error('The 60-bend fixture did not select its middle point');
    const failures=[];let maximum=0;
    for(let i=0;i<1000;i++){
      frame.contentDocument.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'][i%4],bubbles:true,cancelable:true}));
      const ps=points(stem);maximum=Math.max(maximum,ps.length);
      if(ps.length>62||selectedPoint===null||!ps[selectedPoint]){failures.push({kind:'point-growth-or-selection-loss',iteration:i,count:ps.length,selectedPoint});break;}
      if(!points(bus).some(p=>same(p,ps.at(-1)))){failures.push({kind:'junction-lost-after-repeated-edit',iteration:i});break;}
    }
    h.reset(id);return {stage,operations:1000,maximum,failures};
  }
  h.select(stem.key,null);canvasEditor.setRoutePoints(dense);
  h.select(bus.key,null);const end=same(points(bus)[0],b)?0:points(bus).length-1;
  const field=document.querySelector('#route-point');field.value=String(end);field.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('[data-nudge="10,0"]').click();
  const after=points(stem),junction=points(bus)[end];
  const failures=[];
  if(!same(after.at(-1),junction))failures.push({kind:'disconnected-junction',stemEnd:after.at(-1),busEnd:junction});
  if(after.length>6)failures.push({kind:'redundant-points',count:after.length});
  h.reset(id);return {stage,failures};
 },stage);
 if(stage!=='drag')return result;
 const preview=page.frames().find(f=>f.name()==='family-tree-admin-preview');
 const marker=preview.locator('#chart-family .editing-point[data-point="30"]');
 await marker.scrollIntoViewIfNeeded();const box=await marker.boundingBox();
 await page.evaluate(()=>{window.__pointStressGrabbed=route.handles.querySelector('[data-point="30"]');});
 await page.keyboard.down('Alt');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+29,box.y+box.height/2+19,{steps:5});
 const active=await page.evaluate(()=>({connected:__pointStressGrabbed.isConnected,index:__pointStressGrabbed.dataset.point,selectedPoint,same:__pointStressGrabbed===route.handles.querySelector('.editing-point[data-point="'+selectedPoint+'"]')}));
 await page.mouse.up();await page.keyboard.up('Alt');
 return page.evaluate(({key,active})=>{
  const failures=[],m=route.model,p=m.pointsFor(route.override),after=JSON.stringify(p);
  if(!active.connected||!active.same)failures.push({kind:'grabbed-element-replaced',active});
  if(p.length>8||selectedPoint===null||!p[selectedPoint])failures.push({kind:'legacy-route-not-cleaned',count:p.length,selectedPoint});
  failures.push(...__canvasAudit.validate('family',key));
  canvasEditor.undo();canvasEditor.undo(true);
  const redo=frame.contentWindow.familyTreeEditor.charts.get('family').models.find(m=>m.key===key);
  if(JSON.stringify(redo.pointsFor(data.routes.family[key]))!==after)failures.push({kind:'redo-drift'});
  __canvasAudit.reset('family');delete window.__pointStressGrabbed;
  return {stage:'drag',pointsAfter:p.length,failures};
 },{key:result.key,active});
};
