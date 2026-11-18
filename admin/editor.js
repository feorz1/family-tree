"use strict";
const $ = selector => document.querySelector(selector);
const titles = {
  family:"Наша семья", khramov:"Храмовы", boyko:"Семья Сергея", perikov:"Периковы в метриках",
  leviny:"Левины в метриках", nikiforov:"Никифоровы в метриках", korkota:"Коркота"
};
const frame = $("#preview");
const personForm = $("#person-form");
const relationForm = $("#relation-form");
let data, revision, publicDirty, localDirty = false, busy = false, currentRole, reviewContext = null;
let mode = "people", selectedPerson = "", route = null;
let selectedPoint = null, addingPoint = false, canvasEditor = null;
let stopContrastSync = () => {};

function element(tag, text, attributes = {}) {
  if (tag === "button") return editorControl(tag,text,{"data-size":"sm",...attributes});
  if (tag === "input" || tag === "textarea") return editorControl(tag,text,attributes);
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function status(message, error = false) {
  $("#status").textContent = message;
  $("#status").classList.toggle("error", error);
}

function buttons() {
  $("#save").disabled = busy || !(localDirty || reviewContext);
  $("#save").textContent = reviewContext ? "Сохранить и принять" : "Сохранить черновик";
  $("#publish").disabled = currentRole !== "admin" || busy || !(localDirty || publicDirty);
}

function changed() {
  localDirty = true;
  status("Есть несохранённые правки");
  buttons();
}

async function api(path, body) {
  const response = await fetch("/api/" + path, body === undefined ? {} : {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Не удалось выполнить запрос");
  return result;
}

function chart() {
  return data.charts.find(item => item.id === $("#chart").value);
}

function person() {
  return chart().nodes.find(item => item.id === selectedPerson);
}

function inChart(property, chartId = chart().id) {
  return data[property][chartId] ??= {};
}

function displayName(node) {
  return data.cardLabels[chart().id]?.[node.id]?.[0] || node.name;
}

function createLabel(title, input) {
  const label = element("label", title);
  label.append(controlHost(input));
  return label;
}

function redrawPeople() {
  const search = $("#search").value.trim().toLocaleLowerCase("ru");
  const options = chart().nodes.filter(n => (displayName(n) + " " + n.name).toLocaleLowerCase("ru").includes(search));
  options.sort((a,b) => displayName(a).localeCompare(displayName(b), "ru"));
  if (!options.some(n => n.id === selectedPerson)) selectedPerson = options[0]?.id || "";
  $("#person").replaceChildren(...options.map(n => element("option", displayName(n), {value:n.id})));
  $("#person").value = selectedPerson;
  showPerson();
}

function showPerson() {
  const node = person();
  personForm.hidden = !node;
  if (!node) return;
  const label = data.cardLabels[chart().id]?.[node.id];
  const modal = data.modalNames[chart().id]?.[node.id];
  const date = data.births[chart().id]?.[node.id];
  const values = {
    cardName:label?.[0] || "", role:label?.[1] || "", name:modal?.[0] || node.name, maiden:modal?.[1] || "",
    dates:date?.[0] || "", year:date?.[1] || "", yearLabel:date?.[2] || "",
    kind:node.kind ?? "", info:node.info ?? "", source:node.source ?? "", sourceLabel:node.sourceLabel ?? ""
  };
  personForm.elements.cardName.placeholder = node.name;
  personForm.elements.role.placeholder = node.sub || "Например, бабушка";
  for (const [field,value] of Object.entries(values)) personForm.elements[field].value = value;
  syncSelect(personForm.elements.kind);
  $("#sync-label").hidden = !linkedPeople().length;
  showPhotos();
  showFacts();
}

function linkedPeople() {
  const ref = chart().id + ":" + selectedPerson;
  return data.identities.find(group => group.includes(ref))?.filter(item => item !== ref) || [];
}

function updatePersonField(event) {
  const field = event.target.name;
  const node = person();
  if (!field || !node) return;
  const values = personForm.elements;
  if (["cardName","role"].includes(field)) {
    const labels = inChart("cardLabels");
    if (values.cardName.value || values.role.value) labels[node.id] = [values.cardName.value || node.name, values.role.value];
    else delete labels[node.id];
  } else if (["name","maiden","dates","year","yearLabel"].includes(field)) {
    const targets = [chart().id + ":" + node.id, ...($("#sync").checked ? linkedPeople() : [])];
    for (const ref of targets) {
      const [chartId, id] = ref.split(":");
      const target = data.charts.find(item => item.id === chartId).nodes.find(item => item.id === id);
      if (field === "name" || field === "maiden") {
        const names = inChart("modalNames", chartId);
        const former = names[id] || [target.name, ""];
        if (field === "name") {
          if (!names[id] || target.name === former[0]) target.name = values.name.value;
          names[id] = [values.name.value, former[1]];
        } else names[id] = [former[0], values.maiden.value];
      } else {
        const births = inChart("births", chartId), date = [...(births[id] || ["", null])];
        date[{dates:0,year:1,yearLabel:2}[field]] = values[field].value || (field === "year" ? null : "");
        if (date.some(Boolean)) births[id] = date; else delete births[id];
      }
    }
  } else {
    node[field] = event.target.value;
  }
  changed();
}
personForm.addEventListener("input", event => {if (event.target.tagName !== "SELECT") updatePersonField(event);});
personForm.addEventListener("change", event => {if (event.target.tagName === "SELECT") updatePersonField(event);});

$("#search").addEventListener("input", redrawPeople);
$("#person").addEventListener("change", event => {
  selectedPerson = event.target.value;
  showPerson();
  canvasEditor?.selectPerson(selectedPerson);
  centerPreviewOnPerson();
});

$("#new-person").addEventListener("click", () => {
  const current = chart();
  const reference = person() || current.nodes.at(-1);
  selectedPerson = newId("p");
  let x = reference.x + 120, y = reference.y;
  while (current.nodes.some(n => Math.abs(n.x - x) < 115 && Math.abs(n.y - y) < 90)) y += 100;
  current.nodes.push({id:selectedPerson,x,y,name:"Новый человек",sub:"",info:"",kind:"",source:"",sourceLabel:""});
  $("#search").value = "";
  redrawPeople();
  personForm.elements.name.select();
  changed();
});

function newId(prefix) {
  return prefix + Array.from(crypto.getRandomValues(new Uint32Array(2)), value => value.toString(16)).join("");
}

$("#remove-person").addEventListener("click", async event => {
  const current = chart(), id = selectedPerson, ref = current.id + ":" + id;
  if (current.nodes.length === 1) return status("В схеме должна остаться хотя бы одна карточка", true);
  if (!await confirmEditorAction({title:"Убрать карточку и её связи из этой схемы?",action:"Убрать карточку",trigger:event.currentTarget})) return;
  current.nodes = current.nodes.filter(node => node.id !== id);
  current.groups = current.groups
    .map(group => ({...group, parents:group.parents.filter(parent => parent !== id),
      children:group.children.filter(child => child !== id),
      ...(group.uncertainChildren ? {uncertainChildren:group.uncertainChildren.filter(child => child !== id)} : {})}))
    .filter(group => group.parents.length && (group.children.length || group.parents.length === 2));
  current.extra = (current.extra || []).filter(edge => edge.a !== id && edge.b !== id);
  data.marriedPairs[current.id] = (data.marriedPairs[current.id] || []).filter(pair => !pair.includes(id));
  data.identities = data.identities.map(group => group.filter(member => member !== ref)).filter(group => group.length >= 2);
  data.documentaryFacts = data.documentaryFacts.map(fact => ({
    ...fact, people:fact.people.filter(member => member !== ref),
    ...(fact.birthChild ? {birthChild:fact.birthChild.filter(member => member !== ref)} : {})
  })).filter(fact => fact.people.length);
  for (const key of ["cardLabels","modalNames","births","photoCatalog"]) delete inChart(key)[id];
  delete data.routes[current.id];
  redrawPeople();
  redrawRelations();
  changed();
});

function showPhotos() {
  const photos = data.photoCatalog[chart().id]?.[selectedPerson] || [];
  $("#photos").replaceChildren(...photos.map((photo,index) => {
    const item = element("div", "", {class:"editor-item"});
    const image = element("img", "", {alt:photo.alt || "Фотография",src:"/preview/"+photo.src});
    const caption = element("input", "", {value:photo.caption || ""});
    caption.addEventListener("input", () => {photo.caption = caption.value; changed();});
    const alt = element("input", "", {value:photo.alt || ""});
    alt.addEventListener("input", () => {photo.alt = alt.value; image.alt = alt.value; changed();});
    const portraitLabelText = "Портрет на схеме";
    const portrait = element("input", "", {
      type:"checkbox", "aria-label":portraitLabelText, ...(photo.portrait ? {checked:""} : {})
    });
    portrait.addEventListener("change", () => {
      if (portrait.checked) photos.forEach(p => {p.portrait = false;});
      photo.portrait = portrait.checked;
      showPhotos();
      changed();
    });
    const remove = element("button", "Убрать фото", {type:"button","data-variant":"destructive"});
    remove.addEventListener("click", () => {photos.splice(index,1);showPhotos();changed();});
    const portraitLabel = createLabel(portraitLabelText, portrait);
    portraitLabel.className = "check";
    item.append(image,createLabel("Подпись",caption),createLabel("Описание фотографии",alt),portraitLabel);
    if (photo.portrait) {
      const crop = element("button","Кадрировать для схемы",{type:"button"});
      crop.addEventListener("click", () => openCrop(photo, person(), null, crop));
      item.append(controlHost(crop));
    }
    item.append(controlHost(remove));
    return item;
  }));
}

$("#photo-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  const target = person(), chartId = chart().id;
  if (!file || !target) return;
  if (file.size > 8*1024*1024) return status("Выбери фотографию до 8 МБ", true);
  try {
    const base64 = await new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await api("photo", {base64});
    const photos = inChart("photoCatalog",chartId)[target.id] ??= [];
    if (!photos.some(photo => photo.src === result.path)) {
      photos.push({src:result.path,alt:target.name,caption:"",portrait:!photos.some(photo => photo.portrait)});
      changed();
    }
    if (person() === target) showPhotos();
  } catch (error) {status(error.message || "Не удалось загрузить фото", true);}
  finally {event.target.value = "";}
});

function showFacts() {
  const ref = chart().id + ":" + selectedPerson;
  const facts = data.documentaryFacts.filter(fact => fact.people.includes(ref));
  $("#facts").replaceChildren(...facts.map(fact => {
    const item = element("div", "", {class:"editor-item"});
    if (fact.people.length > 1) item.append(element("p", "Это событие также показано у других участников."));
    const year = element("input", "", {value:fact.year || "",inputmode:"numeric"});
    year.addEventListener("input", () => {fact.year = Number(year.value) || null; changed();});
    const text = element("textarea", fact.text, {rows:"3"});
    text.addEventListener("input", () => {fact.text = text.value; changed();});
    const link = element("input", "", {type:"url",value:fact.url || ""});
    link.addEventListener("input", () => {fact.url = link.value; changed();});
    const remove = element("button", "Убрать событие у этой карточки", {type:"button","data-variant":"destructive"});
    remove.addEventListener("click", () => {
      fact.people = fact.people.filter(item => item !== ref);
      if (fact.birthChild) fact.birthChild = fact.birthChild.filter(item => item !== ref);
      if (!fact.people.length) data.documentaryFacts.splice(data.documentaryFacts.indexOf(fact),1);
      showFacts();
      changed();
    });
    item.append(createLabel("Год",year),createLabel("Что произошло",text),createLabel("Источник",link),controlHost(remove));
    return item;
  }));
}

$("#new-fact").addEventListener("click", () => {
  data.documentaryFacts.push({year:null,people:[chart().id+":"+selectedPerson],text:"",url:""});
  showFacts();
  $("#facts .editor-item:last-child input").focus();
  changed();
});

function redrawRelations() {
  const current = chart();
  const options = [element("option", "Выбери связь", {value:""})];
  for (const group of current.groups) {
    const name = group.label || "Родители и дети";
    const who = [...group.parents,...group.children].map(id => current.nodes.find(n => n.id === id)).map(displayName);
    options.push(element("option", name+" · "+who.join(", "), {value:"group:"+group.id}));
  }
  for (const [index,edge] of (current.extra || []).entries()) {
    const who = [edge.a,edge.b].map(id => current.nodes.find(n => n.id === id)).map(displayName);
    options.push(element("option", edge.label+" · "+who.join(", "), {value:"extra:"+index}));
  }
  $("#relation").replaceChildren(...options);
  syncSelect($("#relation"));
  relationForm.hidden = true;
}

let relationEdit = null;
function memberSelect(id, selected, blank = "Не выбран") {
  const select = element("select", "", {id});
  select.append(element("option", blank, {value:""}));
  for (const node of [...chart().nodes].sort((a,b) => displayName(a).localeCompare(displayName(b),"ru"))) {
    const option = element("option", displayName(node), {value:node.id});
    option.selected = selected.includes(node.id);
    select.append(option);
  }
  return select;
}

function drawRelation(value) {
  const [type,id] = value.split(":");
  const current = chart();
  const original = type === "group" ? current.groups.find(item => item.id === id)
    : type === "extra" ? current.extra[Number(id)] : null;
  relationEdit = {type:original ? type : "new", original};
  relationForm.hidden = false;
  relationForm.elements.label.value = original?.label || "";
  relationForm.elements.kind.value = original?.kind || "";
  syncSelect(relationForm.elements.kind);
  $("#remove-relation").hidden = !original;
  const members = $("#relation-members");
  members.querySelectorAll("select").forEach(removeSelect);
  members.replaceChildren();
  const kind = element("select", "", {id:"relation-type"});
  kind.append(element("option","Родительская или супружеская",{value:"group"}),element("option","Другая связь двух людей",{value:"extra"}));
  kind.value = type === "extra" ? "extra" : "group";
  kind.disabled = Boolean(original);
  members.append(createLabel("Тип связи",kind));
  const fields = element("div", "", {class:"editor-item"});
  members.append(fields);
  const drawMembers = () => {
    const pair = kind.value === "group" ? original?.parents || [] : [original?.a,original?.b];
    fields.querySelectorAll("select").forEach(removeSelect);
    fields.replaceChildren(
      createLabel(kind.value === "group" ? "Первый родитель или супруг" : "Первый человек", memberSelect("member-a",pair.slice(0,1))),
      createLabel(kind.value === "group" ? "Второй родитель или супруг" : "Второй человек", memberSelect("member-b",pair.slice(1,2)))
    );
    if (kind.value === "group") {
      const group = element("fieldset");
      const choices = element("div", "", {class:"children-options",id:"children"});
      for (const node of [...current.nodes].sort((a,b) => displayName(a).localeCompare(displayName(b),"ru"))) {
        const labelText = displayName(node);
        const check = element("input","",{
          type:"checkbox", value:node.id, "aria-label":labelText, ...(original?.children.includes(node.id) ? {checked:""} : {})
        });
        const label = element("label","",{class:"check"});
        label.append(controlHost(check),document.createTextNode(labelText));
        choices.append(label);
      }
      group.append(element("legend","Дети"),choices);
      fields.append(group);
      $("#married-label").hidden = false;
      updateEditorControl(relationForm.elements.married,{checked:(data.marriedPairs[current.id] || []).some(ids => pair.length === 2 && ids.every(member => pair.includes(member)))});
    } else $("#married-label").hidden = true;
    fields.querySelectorAll("select").forEach(enhanceSelect);
  };
  kind.addEventListener("change",drawMembers);
  enhanceSelect(kind);
  drawMembers();
}

$("#relation").addEventListener("change", event => {
  if (event.target.value) drawRelation(event.target.value); else relationForm.hidden = true;
});
$("#new-relation").addEventListener("click", () => drawRelation("new:"));
relationForm.addEventListener("submit", event => {
  event.preventDefault();
  const current = chart(), original = relationEdit.original;
  const type = $("#relation-type").value;
  const a = $("#member-a").value, b = $("#member-b").value;
  const label = relationForm.elements.label.value.trim(), kind = relationForm.elements.kind.value;
  if (!a || a === b || !label) return status("Выбери разных участников и назови связь", true);
  if (type === "extra") {
    if (!b) return status("Выбери второго человека", true);
    const list = current.extra ??= [];
    const record = {a,b,label,kind};
    if (original) list[list.indexOf(original)] = record; else list.push(record);
  } else {
    const parents = [a,b].filter(Boolean);
    const children = [...$("#children").querySelectorAll("input:checked")].map(choice => choice.value);
    if (children.some(id => parents.includes(id)) || (!children.length && parents.length < 2)) {
      return status("Добавь ребёнка или выбери двух супругов", true);
    }
    const record = {...original,id:original?.id || newId("g"),parents,children,label,kind};
    if(original && (JSON.stringify(original.parents)!==JSON.stringify(parents) || JSON.stringify(original.children)!==JSON.stringify(children))) {
      for(const key of Object.keys(data.routes[current.id]||{}))if(key.startsWith("group:"+original.id+":"))delete data.routes[current.id][key];
      resetCanvasHistory();
    }
    if (record.uncertainChildren) record.uncertainChildren = record.uncertainChildren.filter(id => children.includes(id));
    if (original) current.groups[current.groups.indexOf(original)] = record; else current.groups.push(record);
    const oldPair = original?.parents;
    const pairs = (data.marriedPairs[current.id] || []).filter(pair =>
      !((oldPair?.length === 2 && pair.every(id => oldPair.includes(id))) ||
      (parents.length === 2 && pair.every(id => parents.includes(id)))));
    if (parents.length === 2 && relationForm.elements.married.checked) pairs.push(parents);
    data.marriedPairs[current.id] = pairs;
  }
  redrawRelations();
  changed();
});

$("#remove-relation").addEventListener("click", async event => {
  if (!await confirmEditorAction({title:"Убрать связь из черновика?",action:"Убрать связь",trigger:event.currentTarget})) return;
  const current = chart();
  const {type,original} = relationEdit;
  const list = type === "group" ? current.groups : current.extra;
  list.splice(list.indexOf(original),1);
  if (type === "group" && original.parents.length === 2 &&
      !current.groups.some(group => group.parents.length === 2 && original.parents.every(id => group.parents.includes(id)))) {
    data.marriedPairs[current.id] = (data.marriedPairs[current.id] || []).filter(pair => !pair.every(id => original.parents.includes(id)));
  }
  redrawRelations();
  changed();
});

function setMode(next) {
  mode = next;
  for (const button of document.querySelectorAll("[data-mode]")) {
    const active = button.dataset.mode === next;
    button.setAttribute("aria-pressed", String(active));
    $("#" + button.dataset.mode).hidden = !active;
  }
  if (mode !== "routes") clearRoute();
}
for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}

function activeChart() {
  selectedPerson = "";
  $("#search").value = "";
  clearRoute();
  canvasEditor?.clearSelection();
  redrawPeople();
  redrawRelations();
  frame.contentWindow.location.hash = chart().id;
}
$("#chart").addEventListener("change", activeChart);

function clearRoute() {
  route?.svg.remove();
  route = null;
  selectedPoint = null;
  addingPoint = false;
  $("#add-point").setAttribute("aria-pressed","false");
  $("#route-form").hidden = true;
}

$("#preview-contrast").addEventListener("change", event => {
  frame.contentWindow.familyContrastUI?.set(event.target.checked);
});

frame.addEventListener("load", () => {
  stopContrastSync();stopContrastSync=()=>{};
  canvasEditor?.destroy();
  canvasEditor = null;
  clearRoute();
  const doc = frame.contentDocument;
  if (!doc.querySelector(".chart-shell")) return;
  const style = doc.createElement("style");
  style.textContent = "header, #section-tabs, .archive-tabs, .contrast-control{display:none!important}main{padding:0}.chart-shell{border:0;border-radius:0}";
  doc.head.append(style);
  const contrast=frame.contentWindow.familyContrastUI;
  if(contrast){
    const sync=()=>updateEditorControl($("#preview-contrast"),{checked:contrast.get()});
    stopContrastSync=contrast.subscribe(sync);sync();
  }
  canvasEditor = mountCanvasEditor({
    doc,chart,data:()=>data,changed,route:()=>route,clearRoute,selectRoute,setMode,
    selectedPoint:()=>selectedPoint,setSelectedPoint:index=>{selectedPoint=index;},
    syncRouteControls,applyRoute,isAddingPoint:()=>addingPoint,insertPoint,notify:message=>status(message,true),
    selectPerson(id){selectedPerson=id;$("#search").value="";redrawPeople();}
  });
});

function selectRoute(hit) {
  clearRoute();
  const model = hit.treeRoute;
  const original = hit.ownerSVGElement;
  const doc = original.ownerDocument;
  const svg = doc.createElementNS(original.namespaceURI,"svg");
  svg.setAttribute("class","route-editor-overlay");
  svg.setAttribute("width",original.getAttribute("width"));
  svg.setAttribute("height",original.getAttribute("height"));
  const handles = doc.createElementNS(svg.namespaceURI,"g");
  svg.append(handles);
  original.after(svg);
  const saved = data.routes[model.chart]?.[model.key];
  const override = saved ? structuredClone(saved) : {points:structuredClone(model.autoPoints.slice(1,-1)),radius:8};
  override.orthogonal ??= CanvasGeometry.isOrthogonal(model.pointsFor(override));
  route = {svg,handles,model,override};
  $("#route-form").hidden = false;
  $("#route-name").textContent = hit.getAttribute("aria-label");
  updateEditorControl($("#radius"),{value:override.radius});
  $("#radius-value").value = override.radius;
  updateEditorControl($("#route-orthogonal"),{checked:override.orthogonal!==false});
  drawHandles();
}

function canvasPoint(event) {
  const local = new DOMPoint(event.clientX,event.clientY).matrixTransform(route.svg.getScreenCTM().inverse());
  return [Math.round(Math.max(0,local.x)),Math.round(Math.max(0,local.y))];
}

function drawHandles() {
  canvasEditor?.drawHandles();
}

function syncRouteControls(){
  const previous = $("#route-point").value;
  const points = route.model.pointsFor(route.override);
  $("#route-point").replaceChildren(...points.map((_,index)=>{
    const label = index === 0 ? "Начало" : index === points.length-1 ? "Конец" : "Точка " + index;
    return element("option",label,{value:index});
  }));
  const selection = selectedPoint ?? (previous && Number(previous) < points.length ? Number(previous):0);
  $("#route-point").value = selection;
  syncSelect($("#route-point"));
  const end = selection === 0 ? "start" : selection === points.length-1 ? "end" : null;
  for (const button of document.querySelectorAll("[data-nudge]")) button.disabled = false;
  $("#add-midpoint").disabled = selection === points.length-1 || route.override.points.length >= 60;
  $("#remove-point").disabled = Boolean(end);
}

$("#route-point").addEventListener("change", () => {
  selectedPoint = Number($("#route-point").value);
  drawHandles();
});
for (const button of document.querySelectorAll("[data-nudge]")) {
  button.addEventListener("click", () => {
    const index = Number($("#route-point").value);
    const points = route.model.pointsFor(route.override);
    const delta = button.dataset.nudge.split(",").map(Number);
    const moved = points[index].map((value,axis)=>Math.max(0,value+delta[axis]));
    selectedPoint = index;
    canvasEditor.setRoutePoints(canvasEditor.movePoint(points,index,moved));
    drawHandles();
  });
}
$("#add-midpoint").addEventListener("click", () => {
  const index = Number($("#route-point").value), points = route.model.pointsFor(route.override);
  points.splice(index+1,0,points[index].map((point,axis)=>Math.round((point+points[index+1][axis])/2)));
  selectedPoint = index + 1;
  canvasEditor.setRoutePoints(points);
  drawHandles();
});

function applyRoute() {
  const {model,override} = route;
  (data.routes[model.chart] ??= {})[model.key] = structuredClone(override);
  model.update(override);
  changed();
}

function insertPoint(event) {
  if (route.override.points.length >= 60) return status("У линии уже 60 точек", true);
  const point = canvasPoint(event);
  const existing = route.model.pointsFor(route.override);
  const distance = ([ax,ay],[bx,by]) => {
    const dx = bx-ax, dy = by-ay;
    const scale = Math.min(1,Math.max(0,((point[0]-ax)*dx+(point[1]-ay)*dy)/(dx*dx+dy*dy || 1)));
    return Math.hypot(point[0]-ax-dx*scale,point[1]-ay-dy*scale);
  };
  const best = existing.slice(1).map((next,index) => ({index,distance:distance(existing[index],next)}))
    .sort((a,b) => a.distance-b.distance)[0];
  existing.splice(best.index+1,0,point);
  const next = route.override.orthogonal===false ? existing : CanvasGeometry.orthogonal(existing,[point]);
  selectedPoint = next.findIndex(p=>CanvasGeometry.same(p,point));
  addingPoint = false;
  $("#add-point").setAttribute("aria-pressed","false");
  canvasEditor.setRoutePoints(next);
  drawHandles();
}

$("#radius").addEventListener("input", event => {
  route.override.radius = Number(event.target.value);
  $("#radius-value").value = event.target.value;
  applyRoute();
});
$("#add-point").addEventListener("click", event => {
  addingPoint = !addingPoint;
  event.target.setAttribute("aria-pressed",String(addingPoint));
});
$("#remove-point").addEventListener("click", () => {
  const points=route.model.pointsFor(route.override),index=Number($("#route-point").value);
  if(index===0||index===points.length-1)return;
  points.splice(index,1);
  selectedPoint = null;
  canvasEditor.setRoutePoints(points);
  drawHandles();
});
$("#reset-route").addEventListener("click", () => {
  const {model} = route;
  if(route.override.frozen) {
    route.override.radius=8;route.override.orthogonal=true;
    updateEditorControl($("#radius"),{value:8});$("#radius-value").value=8;
    updateEditorControl($("#route-orthogonal"),{checked:true});
    const points=structuredClone(model.autoPoints);
    canvasEditor.setRoutePoints(points);
    selectedPoint=null;
    drawHandles();
    return;
  }
  if (data.routes[model.chart]) delete data.routes[model.chart][model.key];
  model.update(null);
  route.override = {points:structuredClone(model.autoPoints.slice(1,-1)),radius:8};
  updateEditorControl($("#radius"),{value:8});
  $("#radius-value").value = 8;
  selectedPoint = null;
  changed();
  drawHandles();
});

function centerPreviewOnPerson() {
  const node = frame.contentDocument?.querySelector("#chart-"+chart().id+' [data-person="'+selectedPerson+'"]');
  const view = node?.closest(".viewport");
  if (!view?.clientWidth) return;
  const card = node.getBoundingClientRect(), field = view.getBoundingClientRect();
  view.scrollLeft += (card.left + card.width/2) - (field.left + field.width/2);
  view.scrollTop += (card.top + card.height/2) - (field.top + field.height/2);
}

function refreshPreview() {
  frame.src = "/preview/?draft="+revision+"#"+chart().id;
}

async function saveDraft() {
  if (!localDirty && !reviewContext) return;
  const review = reviewContext;
  const result = await api("draft", {revision,data,...(review ? {review:{id:review.id,section:review.section}} : {})});
  revision = result.revision;
  publicDirty = result.dirty;
  localDirty = false;
  setReview(null);
  status(review ? "Уточнение сохранено, правка принята" : "Черновик сохранён");
  refreshPreview();
  document.dispatchEvent(new Event("historyrefresh"));
}

async function run(action) {
  if (busy) return;
  if (localDirty && mode === "people" && !personForm.hidden && !personForm.reportValidity()) return;
  busy = true;
  $("aside").inert = true;
  frame.inert = true;
  buttons();
  try {await action();} catch (error) {status(error.message,true);}
  finally {busy = false;$("aside").inert = false;frame.inert = false;buttons();}
}
$("#save").addEventListener("click", () => run(saveDraft));
$("#publish").addEventListener("click", event => run(async () => {
  if (!await confirmEditorAction({
    title:"Опубликовать этот черновик?",
    description:"Выбранные фотографии тоже появятся на открытом сайте.",
    action:"Опубликовать",variant:"default",trigger:event.currentTarget
  })) return;
  await saveDraft();
  status("Отправляем версию на GitHub…");
  const result = await api("publish", {revision});
  publicDirty = false;
  status("GitHub соберёт сайт · " + result.commit.slice(0,7));
  checkPublication(result.commit);
  document.dispatchEvent(new Event("historyrefresh"));
}));
window.addEventListener("beforeunload", event => {
  if (localDirty) {event.preventDefault();event.returnValue = "";}
});

async function checkPublication(commit) {
  for (let attempt=0;attempt<12;attempt++) {
    if (localDirty || publicDirty) return;
    if (attempt) await new Promise(resolve => setTimeout(resolve,5000));
    if (localDirty || publicDirty) return;
    try {
      const result = await api("publication?commit="+commit);
      if (result.current) {
        status("На публичном сайте · " + commit.slice(0,7));
        return;
      }
    } catch {}
  }
  if (!localDirty && !publicDirty) status("Отправлено на GitHub · " + commit.slice(0,7));
}


function setReview(context) {
  reviewContext = context;
  $("#review-note").hidden = !context;
  if (context) $("#review-text").textContent = "Уточнение правки · " + context.title;
  buttons();
}
$("#leave-review").addEventListener("click", () => setReview(null));

async function syncDraft() {
  if (localDirty || busy || reviewContext || confirmationOpen() || editorOverlays.get("crop-dialog").open) return false;
  const draft = await api("draft");
  if (localDirty || busy || reviewContext || confirmationOpen() || editorOverlays.get("crop-dialog").open || draft.revision < revision) return false;
  const updated = draft.revision !== revision;
  const stateChanged = publicDirty !== draft.dirty;
  if (updated) {
    resetCanvasHistory();
    ({data,revision} = draft);
    redrawPeople();
    redrawRelations();
    refreshPreview();
  }
  publicDirty = draft.dirty;
  if (updated || stateChanged) status(publicDirty ? "Есть неопубликованный черновик" : "Опубликованная версия");
  buttons();
  return true;
}

function openReviewCard(context) {
  const section = context.details;
  const targetChart = data.charts.find(c => c.id === section.chart);
  if (!targetChart?.nodes.some(node => node.id === section.person)) return false;
  $("#chart").value = section.chart;
  syncSelect($("#chart"));
  setMode("people");
  activeChart();
  selectedPerson = section.person;
  redrawPeople();
  setReview(context);
  const field = personForm.elements[context.field.target];
  if (field?.tagName === "SELECT") focusSelect(field);
  else (field || personForm.elements.info).focus();
  return true;
}

async function init() {
  try {
    const draft = await api("draft");
    ({data,revision} = draft);
    currentRole = draft.role;
    $("#publish").hidden = $("#access").hidden = currentRole !== "admin";
    $("#logout").hidden = !draft.hasSession;
    publicDirty = draft.dirty;
    $("#public-link").href = draft.publicUrl;
    $("#chart").replaceChildren(...Object.entries(titles).map(([id,label]) => element("option",label,{value:id})));
    redrawPeople();
    redrawRelations();
    document.querySelectorAll("select").forEach(enhanceSelect);
    refreshPreview();
    status(publicDirty ? "Есть неопубликованный черновик" : "Опубликованная версия");
    $("aside").inert = false;
    buttons();
    document.dispatchEvent(new Event("draftready"));
    if (draft.publication && !publicDirty) checkPublication(draft.publication);
  } catch (error) {status(error.message,true);}
}
init();
