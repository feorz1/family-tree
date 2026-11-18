import interact from 'interactjs';
import G from '../admin/diagram-geometry.cjs';

window.CanvasGeometry = G;
const histories = new Map();
window.resetCanvasHistory = () => histories.clear();
const clone = value => structuredClone(value);
const input = target => target?.closest?.('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"],input,textarea,select,[contenteditable="true"],[role="slider"],[role="combobox"],[role="textbox"],.ui-popup');

window.mountCanvasEditor = function (options) {
  const {doc} = options;
  const $ = selector => document.querySelector(selector);
  const selected = new Set(), bindings = [];
  const scene = () => doc.defaultView.familyTreeEditor.charts.get(options.chart().id);
  const savedRoutes = () => options.data().routes[options.chart().id] ||= {};
  const history = () => {
    const id = options.chart().id;
    if (!histories.has(id)) histories.set(id,{undo:[],redo:[]});
    return histories.get(id);
  };
  let space = false, drag = null, suppressClick = 0, pan = null, box = null, gesture = null;
  const style = doc.createElement('style');
  style.textContent = `.canvas .node{touch-action:none;user-select:none;cursor:move}.canvas .node.canvas-selected{outline:3px solid #316cf4;outline-offset:5px;opacity:1!important}.canvas .node:focus{outline-offset:5px}.canvas .node img{pointer-events:none;-webkit-user-drag:none}.route-editor-overlay{z-index:4;pointer-events:none;overflow:visible}.editing-point{pointer-events:all;touch-action:none;cursor:move;fill:var(--panel,#fff);stroke:#316cf4;stroke-width:2}.editing-point.active{fill:#316cf4}.editing-segment{pointer-events:all;touch-action:none;fill:#fff;stroke:#316cf4;stroke-width:1.5}.edge.canvas-route-selected .edge-line{stroke:#316cf4!important}.canvas-guides{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:visible}.canvas-guides line{stroke:#e24c9b;stroke-width:1;vector-effect:non-scaling-stroke}.canvas-guides rect{fill:#316cf41a;stroke:#316cf4;vector-effect:non-scaling-stroke}body.canvas-hand .viewport,body.canvas-hand .node,body.canvas-hand .link-hit{cursor:grab!important}.selection-panel,.canvas-hint{display:none!important}`;
  doc.head.append(style);
  const overlay = doc.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.classList.add('canvas-guides');
  function guides(lines = []) {
    overlay.replaceChildren();
    const current = scene();
    current.canvas.append(overlay);
    overlay.setAttribute('width',current.canvas.offsetWidth);
    overlay.setAttribute('height',current.canvas.offsetHeight);
    for (const [axis,value] of lines) {
      const line = doc.createElementNS(overlay.namespaceURI,'line');
      line.setAttribute('x1',axis===0?value:0);line.setAttribute('x2',axis===0?value:current.canvas.offsetWidth);
      line.setAttribute('y1',axis===1?value:0);line.setAttribute('y2',axis===1?value:current.canvas.offsetHeight);
      overlay.append(line);
    }
  }
  function point(event) {
    const matrix = scene().svg.getScreenCTM().inverse();
    const p = new doc.defaultView.DOMPoint(event.clientX,event.clientY).matrixTransform(matrix);
    return [p.x,p.y];
  }
  const scale = () => scene().svg.getScreenCTM().a;
  const listen = (target,type,handler,capture = false) => {
    target.addEventListener(type,handler,capture);
    bindings.push(()=>target.removeEventListener(type,handler,capture));
  };
  function updateSelection() {
    const current = scene();
    current.clear();
    for(const model of current.models)model.group.classList.toggle('canvas-route-selected',options.route()?.model===model);
    for (const [id,el] of current.nodeElements) el.classList.toggle('canvas-selected',selected.has(id));
    $('#canvas-selection').textContent = selected.size ? `Карточек выбрано: ${selected.size}` : options.route() ? 'Выбрана линия · Delete — удалить' : 'Перетащите карточку, чтобы переместить';
    for (const button of document.querySelectorAll('[data-align]')) button.disabled = selected.size < 2;
    $('#canvas-undo').disabled = !history().undo.length;
    $('#canvas-redo').disabled = !history().redo.length;
  }
  function snapshot() {
    const current = scene();
    return {
      positions:Object.fromEntries(options.chart().nodes.map(n=>[n.id,{saved:n.position||null,rendered:current.nodes.find(m=>m.id===n.id) && [current.nodes.find(m=>m.id===n.id).x,current.nodes.find(m=>m.id===n.id).y]}])),
      routes:clone(savedRoutes())
    };
  }
  function begin() { gesture ||= snapshot(); }
  function commit() {
    if (!gesture) return;
    if (JSON.stringify(gesture) !== JSON.stringify(snapshot())) {
      history().undo.push(gesture);
      if (history().undo.length > 80) history().undo.shift();
      history().redo.length = 0;
      options.changed();
    }
    gesture = null;
    updateSelection();
  }
  function restore(state) {
    const positions = {};
    for (const n of options.chart().nodes) {
      const entry = state.positions[n.id];
      if (!entry) continue;
      if (entry.saved) n.position = clone(entry.saved); else delete n.position;
      positions[n.id] = entry.rendered;
    }
    scene().setPositions(positions);
    options.data().routes[options.chart().id] = clone(state.routes);
    for (const model of scene().models) model.update(state.routes[model.key] || null);
    options.clearRoute();
    guides();
    updateSelection();
  }
  function undo(redo = false) {
    if (drag || pan || box) return;
    const from = redo ? history().redo : history().undo, to = redo ? history().undo : history().redo;
    if (!from.length) return;
    to.push(snapshot());restore(from.pop());options.changed();
  }
  function store(model, points, base = savedRoutes()[model.key] || {}) {
    if (points.length > 62) return false;
    const value = {...clone(base),points:G.copy(points.slice(1,-1)),radius:base.radius??8,orthogonal:base.orthogonal??true};
    for (const [end,p] of [['start',points[0]],['end',points.at(-1)]]) {
      if (model[end]) value[end]=G.attachment(model[end],p);
      value[end+'Point']=[...p];
    }
    savedRoutes()[model.key] = value;
    model.update(value);
    if (options.route()?.model.key===model.key) options.route().override=clone(value);
    return true;
  }
  const pins = model => ({start:Boolean(model.start||model.parents?.length===2&&model.role==='stem'),end:Boolean(model.end)});
  function movePoint(points,index,next){const current=options.route();return G.moveVertex(points,index,next,current.override.orthogonal!==false,pins(current.model));}
  function setRoutePoints(points, propagate = true) {
    const current = options.route();
    if (!current) return;
    const model = current.model, previous = model.pointsFor(current.override);
    if (!store(model,points,current.override)) return;
    const actual = model.pointsFor(savedRoutes()[model.key]);
    // Shared family junctions stay shared when an endpoint is moved.
    if (propagate && model.familyId) for (const end of [0,previous.length-1]) {
      const side = end===0?'start':'end', next = end===0?actual[0]:actual.at(-1);
      if (model[side] || G.same(previous[end],next)) continue;
      for (const sibling of scene().models.filter(m=>m!==model&&m.familyId===model.familyId)) {
        let path = sibling.pointsFor(savedRoutes()[sibling.key]);
        path = path.map(p=>G.same(p,previous[end]) ? [...next] : [...p]);
        if (current.override.orthogonal!==false) path = G.orthogonal(path);
        store(sibling,path);
      }
    }
    if (model.union) followUnion(model,previous,actual);
    options.changed();
  }
  function followUnion(model,before,after) {
    const oldMid=G.midpoint(before),newMid=G.midpoint(after);
    for (const stem of scene().models.filter(m=>m.role==='stem'&&m.parents?.length===2&&m.parents.every(id=>model.union.includes(id)))) {
      const path=stem.pointsFor(savedRoutes()[stem.key]);
      const start=path[0].map((v,i)=>v+newMid[i]-oldMid[i]);
      store(stem,G.moveEnds(path,start,path.at(-1)));
    }
  }
  function movement() {
    return {
      nodes:Object.fromEntries(scene().nodes.map(n=>[n.id,[n.x,n.y]])),
      paths:scene().models.map(model=>({model,points:G.copy(model.pointsFor(savedRoutes()[model.key])),override:clone(savedRoutes()[model.key]||{})}))
    };
  }
  function moveNodes(positions, initial) {
    const delta = id => positions[id] ? positions[id].map((v,i)=>v-initial.nodes[id][i]) : [0,0];
    scene().setPositions(positions);
    for (const n of options.chart().nodes) if (positions[n.id]) n.position=[...positions[n.id]];
    const nextPaths = new Map();
    for (const {model,points} of initial.paths) {
      const ds=delta(model.startNode),de=delta(model.endNode);
      const groupDelta=delta(model.members[0]);
      let next;
      if (model.members.every(id=>positions[id]&&G.same(delta(id),groupDelta))) next=points.map(p=>p.map((v,i)=>v+groupDelta[i]));
      else next=G.moveEnds(points,points[0].map((v,i)=>v+ds[i]),points.at(-1).map((v,i)=>v+de[i]),savedRoutes()[model.key]?.orthogonal!==false);
      nextPaths.set(model,next);
    }
    for (const {model,points} of initial.paths.filter(item=>item.model.union)) {
      const oldMid=G.midpoint(points),newMid=G.midpoint(nextPaths.get(model));
      for (const stem of initial.paths.filter(item=>item.model.role==='stem'&&item.model.parents?.length===2&&item.model.parents.every(id=>model.union.includes(id)))) {
        const next=nextPaths.get(stem.model),start=stem.points[0].map((v,i)=>v+newMid[i]-oldMid[i]);
        nextPaths.set(stem.model,G.moveEnds(next,start,next.at(-1)));
      }
    }
    // Freeze the visible routes before the next save, avoiding a fresh auto-layout.
    for (const {model,override} of initial.paths) store(model,nextPaths.get(model),{...override,frozen:true,...(model.role==='bus'?{children:[...model.routeChildren]}:{})});
    options.changed();
  }
  function snappedDelta(delta, initial, event) {
    let next=G.constrain(delta,event.shiftKey),lines=[];
    if ($('#canvas-snap').checked&&!event.altKey) {
      const threshold=6/scale(), moving=[...selected], others=scene().nodes.filter(n=>!selected.has(n.id));
      for (const axis of [0,1]) {
        if (event.shiftKey && next[axis]===0) continue;
        let best=threshold,correction=0,guide;
        const offsets=axis===0?[0,98,196]:[0,110,220];
        for(const id of moving)for(const offset of offsets)for(const n of others)for(const other of offsets){
          const target=(axis===0?n.x:n.y)+other,difference=target-(initial.nodes[id][axis]+next[axis]+offset);
          if(Math.abs(difference)<best){best=Math.abs(difference);correction=difference;guide=target;}
        }
        next[axis]+=correction;
        if(guide!==undefined)lines.push([axis,guide]);
      }
    }
    for(const axis of [0,1]) {
      const minimum=Math.min(...[...selected].map(id=>initial.nodes[id][axis]));
      const maximum=Math.max(...[...selected].map(id=>initial.nodes[id][axis]));
      next[axis]=Math.max(-minimum,Math.min(99000-maximum,next[axis]));
    }
    guides(lines);
    return next;
  }
  function snapPoint(next, initial, index, event) {
    const start=initial[index];
    let result=G.constrain(next.map((v,i)=>v-start[i]),event.shiftKey).map((v,i)=>v+start[i]);
    const lines=[];
    if($('#canvas-snap').checked&&!event.altKey)for(const axis of [0,1]) {
      if(event.shiftKey&&result[axis]===start[axis])continue;
      const candidates=initial.filter((_,i)=>i!==index).map(p=>p[axis]);
      const best=candidates.sort((a,b)=>Math.abs(a-result[axis])-Math.abs(b-result[axis]))[0];
      if(best!==undefined&&Math.abs(best-result[axis])<6/scale()){result[axis]=best;lines.push([axis,best]);}
    }
    guides(lines);
    return result.map(v=>Math.max(0,Math.min(100000,v)));
  }
  function drawHandles() {
    const current=options.route();
    if(!current)return;
    const points=current.model.pointsFor(current.override),doc=current.svg.ownerDocument;
    current.svg.setAttribute('width',scene().canvas.offsetWidth);current.svg.setAttribute('height',scene().canvas.offsetHeight);
    current.handles.replaceChildren();
    const size=Math.max(5,Math.min(24,5/scale()));
    for(const [index,p] of points.entries()) {
      const circle=doc.createElementNS(current.svg.namespaceURI,'circle');
      circle.setAttribute('class','editing-point'+(options.selectedPoint()===index?' active':''));
      circle.setAttribute('cx',p[0]);circle.setAttribute('cy',p[1]);circle.setAttribute('r',size);
      circle.dataset.point=index;circle.setAttribute('tabindex','0');circle.setAttribute('role','button');circle.setAttribute('aria-label',index===0?'Начало линии':index===points.length-1?'Конец линии':`Точка ${index}`);
      current.handles.append(circle);
      if(index===points.length-1)continue;
      const q=points[index+1];
      if(Math.hypot(p[0]-q[0],p[1]-q[1])*scale()<24)continue;
      const mid=doc.createElementNS(current.svg.namespaceURI,'rect');
      mid.setAttribute('class','editing-segment');mid.setAttribute('x',(p[0]+q[0])/2-size*.7);mid.setAttribute('y',(p[1]+q[1])/2-size*.7);mid.setAttribute('width',size*1.4);mid.setAttribute('height',size*1.4);mid.setAttribute('rx',size*.3);
      mid.dataset.segment=index;mid.style.cursor=p[1]===q[1]?'ns-resize':'ew-resize';current.handles.append(mid);
    }
    options.syncRouteControls();
  }
  const cards=interact('.node',{context:doc}).draggable({
    inertia:false,autoScroll:false,
    listeners:{
      start(event){
        const id=event.target.dataset.person;
        if(space){event.interaction.stop();return;}
        if(!selected.has(id)){selected.clear();selected.add(id);}
        options.clearRoute();begin();
        drag={kind:'cards',start:[event.x0,event.y0],initial:movement()};
        updateSelection();
      },
      move(event){
        if(drag?.kind!=='cards')return;
        const original=event.originalEvent||event;
        const d=snappedDelta([(event.clientX-drag.start[0])/scale(),(event.clientY-drag.start[1])/scale()],drag.initial,original);
        moveNodes(Object.fromEntries([...selected].map(id=>[id,drag.initial.nodes[id].map((v,i)=>Math.round(v+d[i]))])),drag.initial);
      },
      end(){if(drag?.kind!=='cards')return;drag=null;suppressClick=Date.now()+250;guides();commit();}
    }
  });
  const handles=interact('.editing-point,.editing-segment',{context:doc}).draggable({
    inertia:false,
    listeners:{
      start(event){
        if(!options.route())return;
        begin();const points=G.copy(options.route().model.pointsFor(options.route().override));
        const vertex=event.target.dataset.point;
        drag={kind:'route',points,index:Number(vertex??event.target.dataset.segment),segment:vertex===undefined,start:point({clientX:event.x0,clientY:event.y0})};
        options.setSelectedPoint(drag.segment?null:drag.index);
      },
      move(event){
        if(drag?.kind!=='route'||!options.route())return;
        const p=point(event),original=event.originalEvent||event;
        let next;
        if(!drag.segment){
          const position=snapPoint(p,drag.points,drag.index,original);
          next=movePoint(drag.points,drag.index,position);
          options.setSelectedPoint(next.findIndex(v=>G.same(v,position)));
        }else{
          const i=drag.index,a=drag.points[i],b=drag.points[i+1],axis=a[1]===b[1]?1:0;
          const delta=p[axis]-drag.start[axis];
          next=G.copy(drag.points);
          const movedA=[...a],movedB=[...b];movedA[axis]=Math.max(0,a[axis]+delta);movedB[axis]=Math.max(0,b[axis]+delta);
          next.splice(i,2,...(i===0?[a,movedA]:[movedA]),...(i+1===drag.points.length-1?[movedB,b]:[movedB]));
          next=G.orthogonal(next);
        }
        setRoutePoints(next);
        // Keep the grabbed DOM element alive until interact.js releases it.
        const markers=[...options.route().handles.querySelectorAll('.editing-point')];
        next.forEach((v,i)=>{markers[i]?.setAttribute('cx',v[0]);markers[i]?.setAttribute('cy',v[1]);});
      },
      end(){if(drag?.kind!=='route')return;drag=null;suppressClick=Date.now()+250;guides();drawHandles();commit();}
    }
  });
  function selectCard(id,add = false) {
    options.clearRoute();
    if(add&&selected.has(id))selected.delete(id);else{if(!add)selected.clear();selected.add(id);}
    options.selectPerson(id);updateSelection();
  }
  listen(doc,'click',event=>{
    if(!event.target.closest('.viewport'))return;
    if(suppressClick>Date.now()){suppressClick=0;event.preventDefault();event.stopImmediatePropagation();return;}
    if(event.target.closest('.floating-controls')){requestAnimationFrame(drawHandles);return;}
    const marker=event.target.closest('.editing-point,.editing-segment');
    if(marker){event.preventDefault();event.stopImmediatePropagation();options.setSelectedPoint(marker.dataset.point===undefined?null:Number(marker.dataset.point));drawHandles();return;}
    if(options.isAddingPoint()&&options.route()){event.preventDefault();event.stopImmediatePropagation();begin();options.insertPoint(event);commit();return;}
    const card=event.target.closest('[data-person]'),hit=event.target.closest('.link-hit');
    if(card){event.preventDefault();event.stopImmediatePropagation();selectCard(card.dataset.person,event.shiftKey);return;}
    if(hit?.treeRoute){event.preventDefault();event.stopImmediatePropagation();selected.clear();options.setMode('routes');options.selectRoute(hit);updateSelection();return;}
    if(!pan&&!box){options.clearRoute();selected.clear();updateSelection();}
  },true);
  listen(doc,'focusin',event=>{
    const marker=event.target.closest('.editing-point');
    if(!marker||!options.route())return;
    options.setSelectedPoint(Number(marker.dataset.point));
    for(const handle of options.route().handles.querySelectorAll('.editing-point'))handle.classList.toggle('active',handle===marker);
    options.syncRouteControls();
  });
  listen(doc,'dblclick',event=>{
    const hit=event.target.closest('.link-hit');if(!hit?.treeRoute)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(options.route()?.model.key!==hit.treeRoute.key)options.selectRoute(hit);
    begin();options.insertPoint(event);commit();
  },true);
  listen(doc,'pointerdown',event=>{
    if(!event.target.closest('.viewport')||event.target.closest('.floating-controls'))return;
    if(space||event.button===1){event.preventDefault();event.stopImmediatePropagation();scene().view.setPointerCapture(event.pointerId);pan={x:event.clientX,y:event.clientY,left:scene().view.scrollLeft,top:scene().view.scrollTop};return;}
    if(event.shiftKey&&event.button===0&&!event.target.closest('.node,.link-hit,.editing-point,.editing-segment')){
      event.preventDefault();event.stopImmediatePropagation();scene().view.setPointerCapture(event.pointerId);box={start:point(event),base:new Set(selected)};return;
    }
  },true);
  listen(doc,'pointermove',event=>{
    if(pan){scene().view.scrollLeft=pan.left-event.clientX+pan.x;scene().view.scrollTop=pan.top-event.clientY+pan.y;event.preventDefault();return;}
    if(!box)return;
    const p=point(event),left=Math.min(p[0],box.start[0]),top=Math.min(p[1],box.start[1]),right=Math.max(p[0],box.start[0]),bottom=Math.max(p[1],box.start[1]);
    guides();const rect=doc.createElementNS(overlay.namespaceURI,'rect');
    for(const [key,value] of Object.entries({x:left,y:top,width:right-left,height:bottom-top}))rect.setAttribute(key,value);overlay.append(rect);
    selected.clear();box.base.forEach(id=>selected.add(id));
    for(const n of scene().nodes)if(n.x<right&&n.x+196>left&&n.y<bottom&&n.y+220>top)selected.add(n.id);
    updateSelection();
  },true);
  listen(doc,'pointerup',()=>{if(pan||box){pan=null;box=null;suppressClick=Date.now()+250;guides();}},true);
  listen(doc,'pointercancel',()=>{pan=null;box=null;if(gesture){restore(gesture);gesture=null;}drag=null;guides();},true);
  function deleteSelection(){
    if(!options.route())return;
    begin();const current=options.route(),points=current.model.pointsFor(current.override),index=options.selectedPoint();
    if(index!==null&&index>0&&index<points.length-1){points.splice(index,1);setRoutePoints(points);options.setSelectedPoint(null);drawHandles();}
    else if(index===null){current.override.hidden=true;options.applyRoute();options.clearRoute();}
    commit();
  }
  function keydown(event){
    if(input(event.target))return;
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopImmediatePropagation();undo(event.shiftKey);return;}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='y'){event.preventDefault();event.stopImmediatePropagation();undo(true);return;}
    if(event.key===' '){event.preventDefault();space=true;doc.body.classList.add('canvas-hand');return;}
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();
      if(gesture){const previous=gesture;gesture=null;drag=null;interact.stop();restore(previous);}
      options.clearRoute();selected.clear();guides();updateSelection();return;
    }
    if(event.key==='Delete'||event.key==='Backspace'){if(options.route()){event.preventDefault();event.stopImmediatePropagation();deleteSelection();}return;}
    const hit=event.target.closest?.('.link-hit');
    if(hit?.treeRoute&&event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();options.setMode('routes');selected.clear();options.selectRoute(hit);updateSelection();return;}
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(!delta||(!selected.size&&!options.route()))return;
    event.preventDefault();event.stopImmediatePropagation();const d=delta.map(v=>v*(event.shiftKey?10:1));begin();
    if(selected.size){const initial=movement();moveNodes(Object.fromEntries([...selected].map(id=>[id,initial.nodes[id].map((v,i)=>Math.max(0,Math.min(99000,v+d[i])))])),initial);}
    else{const current=options.route(),points=current.model.pointsFor(current.override),index=options.selectedPoint();
      if(index!==null){const next=points[index].map((v,i)=>Math.max(0,v+d[i]));setRoutePoints(movePoint(points,index,next));}
      else setRoutePoints(points.map((p,i)=>i===0||i===points.length-1?p:p.map((v,axis)=>Math.max(0,v+d[axis]))));drawHandles();}
    commit();
  }
  listen(doc,'wheel',()=>{if(!drag)requestAnimationFrame(drawHandles);},{passive:true});
  listen(doc,'keydown',keydown,true);listen(document,'keydown',keydown,true);
  const releaseSpace=event=>{if(event.key===' '){space=false;doc.body.classList.remove('canvas-hand');}};
  listen(doc,'keyup',releaseSpace,true);listen(document,'keyup',releaseSpace,true);
  listen(doc.defaultView,'blur',()=>{space=false;doc.body.classList.remove('canvas-hand');pan=null;});
  listen($('#canvas-undo'),'click',()=>undo());listen($('#canvas-redo'),'click',()=>undo(true));
  listen($('#delete-line'),'click',()=>{options.setSelectedPoint(null);deleteSelection();});
  listen($('#restore-lines'),'click',()=>{begin();for(const model of scene().models){const override=savedRoutes()[model.key];if(override?.hidden){delete override.hidden;model.update(override);}}options.changed();commit();});
  for(const button of document.querySelectorAll('[data-align]'))listen(button,'click',()=>{
    if(selected.size<2)return;
    const initial=movement(),axis=['left','center','right'].includes(button.dataset.align)?0:1;
    const values=[...selected].map(id=>initial.nodes[id][axis]);
    const value=['left','top'].includes(button.dataset.align)?Math.min(...values):['right','bottom'].includes(button.dataset.align)?Math.max(...values):(Math.min(...values)+Math.max(...values))/2;
    begin();moveNodes(Object.fromEntries([...selected].map(id=>{const p=[...initial.nodes[id]];p[axis]=Math.round(value);return[id,p];})),initial);commit();
  });
  for(const [id,axis] of [['align-point-x',0],['align-point-y',1]])listen($('#'+id),'click',()=>{
    const current=options.route();if(!current)return;
    const points=current.model.pointsFor(current.override),index=options.selectedPoint()??Number($('#route-point').value);
    const neighbor=index>0?index-1:1,next=[...points[index]];next[axis]=points[neighbor][axis];
    begin();setRoutePoints(movePoint(points,index,next));drawHandles();commit();
  });
  listen($('#route-orthogonal'),'change',event=>{
    if(!options.route())return;begin();options.route().override.orthogonal=event.target.checked;
    const points=options.route().model.pointsFor(options.route().override);setRoutePoints(event.target.checked?G.orthogonal(points):points);drawHandles();commit();
  });
  // Legacy sidebar controls participate in the same geometry undo history.
  for(const id of ['remove-point','add-midpoint','reset-route']){
    const target=$('#'+id);listen(target,'click',begin,true);listen(target,'click',commit);
  }
  for(const button of document.querySelectorAll('[data-nudge]')){listen(button,'click',begin,true);listen(button,'click',commit);}
  const radiusLabel=$('#radius').closest('label');
  for(const type of ['pointerdown','keydown'])listen(radiusLabel,type,begin,true);
  for(const type of ['pointerup','keyup'])listen(radiusLabel,type,commit);
  updateSelection();
  return {drawHandles,begin,commit,setRoutePoints,movePoint,undo,selectPerson:id=>selectCard(id),clearSelection(){selected.clear();updateSelection();},
    destroy(){cards.unset();handles.unset();bindings.forEach(off=>off());/* interact.js releases iframe documents on unload. */style.remove();overlay.remove();}
  };
};
