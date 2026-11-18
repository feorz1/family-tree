// Browser regression for the attached recording. Run this exported function via
// playwright-cli run-code against an isolated editor on localhost:18149.
module.exports = async function checkConnectorInteractions(page) {
  if(new URL(page.url()).port !== '18149')throw Error('Use an isolated test editor on port 18149; this check saves its fixture.');
  const check=(ok,message)=>{if(!ok)throw Error(message)};
  await page.evaluate(()=>{localDirty=false});await page.reload();
  await page.waitForFunction(()=>!!canvasEditor);
  let preview=page.frames().find(f=>f.name()==='family-tree-admin-preview');
  const recordedName='Параскева Перикова — Агафия Артемиева Перикова: восприемница Параскевы';
  async function choose(name,reset=false) {
    if(reset)await page.evaluate(name=>{
      const scene=frame.contentWindow.familyTreeEditor.charts.get('family');
      const model=scene.models.find(m=>m.hit.getAttribute('aria-label')===name);
      delete data.routes.family[model.key];model.update(null);
    },name);
    await preview.getByRole('button',{name,exact:true}).focus();await page.keyboard.press('Enter');
  }
  async function state() {
    return page.evaluate(()=>{
      const points=route.model.pointsFor(route.override),model=route.model;
      const onPortrait=(p,r)=>!r||(((Math.abs(p[0]-r.x)<1e-6||Math.abs(p[0]-r.x-r.size)<1e-6)&&p[1]>=r.y-1e-6&&p[1]<=r.y+r.size+1e-6)||((Math.abs(p[1]-r.y)<1e-6||Math.abs(p[1]-r.y-r.size)<1e-6)&&p[0]>=r.x-1e-6&&p[0]<=r.x+r.size+1e-6));
      return {key:model.key,points,index:selectedPoint,start:model.startNode,end:model.endNode,
        choice:document.querySelector('#route-point').selectedOptions[0].textContent,
        orthogonal:points.slice(1).every((p,i)=>Math.abs(p[0]-points[i][0])<1e-6||Math.abs(p[1]-points[i][1])<1e-6),
        attached:onPortrait(points[0],model.start)&&onPortrait(points.at(-1),model.end)};
    });
  }
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  await choose(recordedName,true);
  const initial=await state();check(initial.start==='aga_sis'&&initial.end==='para_sis','Graphical endpoints must follow the drawn route, not relationship ordering.');
  const untouched=await preview.evaluate(key=>Object.fromEntries(window.familyTreeEditor.charts.get('family').models.filter(m=>m.key!==key).map(m=>[m.key,m.hit.getAttribute('d')])),initial.key);
  for(const end of ['Конец','Начало']){
    await page.locator('#route-point').selectOption({label:end},{force:true});
    const before=await state(),fixed=end==='Конец'?before.points[0]:before.points.at(-1);
    for(const name of ['Сдвинуть точку влево','Сдвинуть точку влево','Сдвинуть точку вниз','Сдвинуть точку вниз','Сдвинуть точку вверх','Сдвинуть точку вправо']){
      await page.getByRole('button',{name,exact:true}).click();const actual=await state();
      check(actual.orthogonal&&actual.attached,'Endpoint nudge produced a diagonal or detached end: '+JSON.stringify(actual));
      check(actual.choice===end&&actual.index===(end==='Конец'?actual.points.length-1:0),'Nudge changed the selected endpoint after inserting a bend.');
      check(same(fixed,end==='Конец'?actual.points[0]:actual.points.at(-1)),'Nudge changed the opposite endpoint.');
    }
  }
  const others=await preview.evaluate(key=>Object.fromEntries(window.familyTreeEditor.charts.get('family').models.filter(m=>m.key!==key).map(m=>[m.key,m.hit.getAttribute('d')])),initial.key);
  check(same(others,untouched),'Editing the individual godparent connector changed unrelated lines.');
  await choose(recordedName);
  const body=await state();
  for(const key of ['ArrowDown','ArrowRight','Shift+ArrowUp']){
    await page.keyboard.press(key);const actual=await state();
    check(actual.orthogonal&&actual.attached,'Keyboard movement corrupted the connector.');
    check(same(actual.points[0],body.points[0])&&same(actual.points.at(-1),body.points.at(-1)),'Moving a connector body must preserve its attached ends.');
  }
  const unionName='Ольга Фитисова — Сергей Бойко: супруги';
  await choose(unionName,true);const straight=await state();check(straight.points.length===2,'The fixture must include a straight two-point connector.');
  await page.locator('#route-point').selectOption({label:'Конец'},{force:true});
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'Сдвинуть точку вверх',exact:true}).click();const actual=await state();
    check(actual.points.length>2&&actual.points.length<=4,'A shifted endpoint must add bounded bends rather than grow points on every click.');
    check(actual.index===actual.points.length-1&&actual.choice==='Конец','The selected endpoint became an interior point after adding a bend.');
    check(actual.orthogonal&&actual.attached&&same(actual.points[0],straight.points[0]),'Adding a bend corrupted a bound end.');
  }
  await choose(recordedName);
  await preview.evaluate(()=>{
    const scene=window.familyTreeEditor.charts.get('family'),scale=scene.svg.getScreenCTM().a;
    scene.view.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-Math.log(.87/scale)/.003,clientX:300,clientY:240,bubbles:true,cancelable:true}));
  });
  await preview.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const endpoint=preview.locator('.editing-point').last();await endpoint.scrollIntoViewIfNeeded();const bounds=await endpoint.boundingBox(),beforeDrag=await state();
  await page.keyboard.down('Alt');await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width/2+26,bounds.y+bounds.height/2+18,{steps:8});await page.mouse.up();await page.keyboard.up('Alt');
  const dragged=await state();check(dragged.orthogonal&&dragged.attached&&same(dragged.points[0],beforeDrag.points[0]),'Dragging an endpoint at 87% zoom corrupted the connector.');
  check(dragged.index===dragged.points.length-1,'Dragging lost the selected endpoint.');
  const displayed=await preview.evaluate(()=>Object.fromEntries(window.familyTreeEditor.charts.get('family').models.map(m=>[m.key,m.hit.getAttribute('d')])));
  await page.locator('#save').click();await page.waitForFunction(()=>!localDirty&&route===null&&!!canvasEditor);
  preview=page.frames().find(f=>f.name()==='family-tree-admin-preview');
  const reopened=await preview.evaluate(()=>Object.fromEntries(window.familyTreeEditor.charts.get('family').models.map(m=>[m.key,m.hit.getAttribute('d')])));
  check(same(displayed,reopened),'Connector geometry changed after saving/reopening.');
  await choose(recordedName);const saved=await state();
  check(saved.start===initial.start&&saved.end===initial.end&&saved.orthogonal&&saved.attached,'Saving lost the explicit graphical endpoint bindings.');
  await page.locator('#route-point').selectOption({label:'Конец'},{force:true});
  await page.getByRole('button',{name:'Сдвинуть точку влево',exact:true}).click();
  const final=await state();check(final.orthogonal&&final.attached&&final.choice==='Конец','Editing after save corrupted the connector.');
  await page.keyboard.press('Meta+z');
  return {passed:['recorded endpoint nudges','both ends and all arrow directions','unrelated lines unchanged','keyboard body movement','new bend selection','drag at 87% zoom','save/reopen geometry','bindings persisted','edit after save'],key:initial.key};
};
