"use strict";

const historyDialog = editorOverlays.get("history-dialog");
const historyLabel = $("#history-summary");
const historyError = $("#history-error");
const historyItems = $("#history-items");
const historyBody = $("#history-body");
const historyDate = new Intl.DateTimeFormat("ru-RU", {
  dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Moscow"
});
let historyCursor = null, historyLatest = 0, historyLoading = null, historyStarted = false, historyNotice = "", historyFilter = "all";

function dateLabel(stamp) {
  return historyDate.format(new Date(stamp*1000));
}

function updateBadge(count) {
  const badge = $("#history-badge"), button = $("#history");
  badge.hidden = count === 0;
  badge.textContent = count > 99 ? "99+" : count;
  button.setAttribute("aria-label", count ? "История правок, новых сохранений: "+count : "История правок");
}

function portrait(card) {
  const container = element("div","",{class:"history-card"});
  if (!card) return element("p","Карточки не было",{class:"history-empty"});
  const frame = element("div","",{class:"portrait-frame history-avatar"});
  if (card.portrait) {
    const img = element("img","",{src:"/preview/"+card.portrait,alt:"",loading:"lazy"});
    if (card.crop) framePortrait(img,card.crop);
    frame.append(img);
  } else {
    const initials = card.name.trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]).join("");
    frame.textContent = initials.toLocaleUpperCase("ru");
    frame.setAttribute("aria-hidden","true");
  }
  container.append(frame,element("strong",card.name));
  if (card.subtitle) container.append(element("small",card.subtitle));
  return container;
}

function summaryText(value) {
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value)) return value.map(summaryText).join(" · ");
  if (value && typeof value === "object") {
    if (value.text) return [value.year,value.text].filter(Boolean).join(" · ");
    if (value.name) return [value.name,value.sub,value.info].filter(Boolean).join(" · ");
    if (value.label) return value.label;
    return Object.entries(value).filter(([,v])=>v!==null).map(([key,v])=>key+" — "+summaryText(v)).join(", ");
  }
  return value == null ? "" : String(value);
}

function describeValue(field, value) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
    return element("p",field.kind === "route" ? "Автоматический маршрут" : "Пусто",{class:"history-empty"});
  }
  if (field.kind === "photos") {
    const list = element("ul","",{class:"history-photos"});
    for (const photo of value) {
      const item = element("li","",{class:"history-photo"});
      const link = element("a","",{href:"/preview/"+photo.src,target:"_blank",rel:"noopener","aria-label":"Открыть фото "+(photo.alt || "")});
      const img = element("img","",{src:"/preview/"+photo.src,alt:photo.alt || "Фотография",loading:"lazy"});
      if (photo.crop && photo.portrait) framePortrait(img,photo.crop);
      link.append(img);
      item.append(link);
      if (photo.portrait) item.append(element("small","Портрет на схеме"));
      if (photo.caption) item.append(element("small",photo.caption));
      list.append(item);
    }
    return list;
  }
  if (field.kind === "route") {
    const info = element("div","",{class:"history-route"});
    info.append(element("p","Точки изгиба: "+value.points.length+" · Скругление: "+(value.radius ?? 8)));
    if (value.points.length || value.start || value.end) {
      const coordinates = value.points.map(point=>point.join(", ")).join(" · ");
      info.append(editorCollapsible({
        summary:element("span","Положение точек"),
        content:element("p",coordinates || summaryText([value.start,value.end].filter(Boolean)))
      }));
    }
    return info;
  }
  if (Array.isArray(value)) {
    const list = element("ul","",{class:"history-values"});
    for (const item of value) list.append(element("li",summaryText(item)));
    return list;
  }
  return element("p",summaryText(value));
}

function comparison(title, before, after) {
  const block = element("div","",{class:"history-comparison"});
  if (title) block.append(element("h5",title));
  const columns = element("div","",{class:"history-columns"});
  for (const [label,content] of [["Было",before],["Стало",after]]) {
    const cell = element("div","",{class:"history-value"});
    cell.append(element("span",label,{class:"history-side"}),content);
    columns.append(cell);
  }
  block.append(columns);
  return block;
}

function formButton(label, action, attributes = {}) {
  const button = element("button",label,{type:"button",...attributes});
  button.addEventListener("click",async () => {
    button.disabled = true;
    historyError.textContent = "";
    try {await action(button);}
    catch (error) {historyError.textContent = error.message;}
    finally {button.disabled = false;}
  });
  return button;
}

function currentPortrait(snapshot, section, source) {
  return snapshot.photoCatalog[section.chart]?.[section.person]?.find(photo => photo.portrait && photo.src === source);
}

function sameCrop(first, second) {
  return ["x","y","zoom"].every(key => first?.[key] === second?.[key]);
}

async function finishHistoryAction(message, anchor) {
  historyNotice = message;
  historyLabel.textContent = message;
  try {
    await loadHistory(false, anchor);
  } catch (error) {
    historyError.textContent = "Действие сохранено. Не удалось обновить историю: " + error.message;
  }
}

async function reviewPortrait(entry, section, index, picture, trigger) {
  const opened = await api("draft");
  const photo = currentPortrait(opened.data, section, picture.src);
  if (!photo) throw new Error("Портрет на схеме уже заменён. Новый портрет можно кадрировать в карточке.");
  const anchor = entry.id + "-" + index;
  openCrop(photo, {name:section.title},{
    async save(value) {
      const latest = await api("draft");
      const portrait = currentPortrait(latest.data, section, picture.src);
      if (!portrait || !sameCrop(portrait.crop, photo.crop)) {
        throw new Error("Портрет или кадр уже изменился. Закрой окно кадрирования и открой правку снова.");
      }
      setPortraitCrop(portrait, value);
      const result = await api("draft",{
        revision:latest.revision,data:latest.data,review:{id:entry.id,section:index}
      });
      return {result, priorRevision:latest.revision, value};
    },
    async afterSave({result,priorRevision,value}) {
      // Merge only the crop into any unrelated local form edits based on the same draft revision.
      const local = currentPortrait(data, section, picture.src);
      if (revision === priorRevision && local && sameCrop(local.crop, photo.crop)) {
        setPortraitCrop(local, value);
        revision = result.revision;
        publicDirty = result.dirty;
        refreshPreview();
        buttons();
      } else {
        try {await syncDraft();} catch {}
      }
      if (!localDirty) status("Кадр сохранён, правка принята");
      await finishHistoryAction("Кадр сохранён, правка принята.", anchor);
    }
  },trigger);
}

function authorName(actor) {
  return actor ? actor.split(" · ")[0] : "Неизвестный автор";
}

function historyTime(stamp) {
  return element("time",dateLabel(stamp),{datetime:new Date(stamp*1000).toISOString()});
}

function sectionStatus(entry, section) {
  if (entry.revertedBy) return ["Отменено","neutral"];
  if (entry.publication) return ["Опубликовано","neutral"];
  if (section.acceptedAt) return ["Принято","accepted"];
  if (entry.role === "editor" || entry.action === "recovered") return ["На проверке","pending"];
  return null;
}

function sectionView(entry, section, index, open) {
  const chartName = titles[section.chart];
  const summary = element("span");
  summary.append(element("span",section.title || chartName || "Общие данные"));
  if (section.title && chartName) summary.append(element("small",chartName));
  const state = sectionStatus(entry, section);
  if (state) {
    const badge = element("small",state[0],{class:"history-state "+state[1]});
    if (entry.publishedAt && !entry.revertedBy) badge.title = "Публикация · " + dateLabel(entry.publishedAt);
    summary.append(badge);
  }
  const contents = element("div","",{class:"history-fields"});
  if (section.refinements.length) {
    const chain = element("ul","",{class:"history-chain","aria-label":"Уточнения правки"});
    for (const refinement of section.refinements) {
      const step = element("li","Уточнение · "+authorName(refinement.actor));
      if (refinement.editedAt) step.append(document.createTextNode(" · "),historyTime(refinement.editedAt));
      chain.append(step);
    }
    contents.append(chain);
  }
  if (section.beforeCard || section.afterCard) {
    contents.append(comparison(null,portrait(section.beforeCard),portrait(section.afterCard)));
  }
  const canReview = !entry.publication && !entry.revertedBy && !section.acceptedAt &&
    (entry.role === "editor" || entry.action === "recovered");
  for (const field of section.fields) {
    const row = comparison(field.label,describeValue(field,field.before),describeValue(field,field.after));
    const picture = field.kind === "photos" ? field.after?.find(photo => photo.portrait) : null;
    if (canReview && section.afterCard && (picture || (field.kind !== "photos" && field.target))) {
      const edit = formButton(field.kind === "photos" ? "Уточнить кадр и принять" : "Уточнить и принять",async trigger => {
        if (picture) {
          await reviewPortrait(entry, section, index, picture, trigger);
          return;
        }
        const sameReview = reviewContext?.id === entry.id && reviewContext.section === index;
        if (!sameReview && !await syncDraft()) throw new Error("Сначала сохрани открытые правки.");
        historyDialog.close({restoreFocus:false});
        if (!openReviewCard({id:entry.id,section:index,details:section,title:section.title,field})) {
          historyDialog.show();
          throw new Error("Этой карточки больше нет в текущем черновике.");
        }
      },{class:"history-edit"});
      edit.setAttribute("aria-label",edit.textContent+" · "+field.label+" · "+section.title);
      row.append(controlHost(edit));
    }
    contents.append(row);
  }
  if (canReview) {
    const approve = formButton(section.title ? "Принять изменения карточки" : "Принять изменения",async () => {
      const latest = await api("history/status");
      await api("history/accept",{id:entry.id,section:index,revision:latest.revision});
      await finishHistoryAction("Изменения приняты в черновике.",entry.id + "-" + index);
    });
    contents.append(controlHost(approve));
  }
  return editorCollapsible({summary,content:contents,open,
    attributes:{class:"history-section","data-history-section":entry.id+"-"+index}});
}

function entryView(entry, openSections, initiallyOpen) {
  const card = element("article","",{class:"history-entry"});
  const head = element("div","",{class:"history-entry-head"});
  const meta = element("div","",{class:"history-meta"});
  const title = element("h4",authorName(entry.actor));
  if (entry.action === "recovered" && entry.actor) title.title = "Автор указан по твоему уточнению";
  meta.append(title);
  if (entry.action === "revert") meta.append(element("span","Отмена правки"));
  if (entry.editedAt) meta.append(historyTime(entry.editedAt));
  else if (entry.publishedAt) {
    const date = element("span","Публикация · ");
    date.append(historyTime(entry.publishedAt));
    meta.append(date);
  } else {
    meta.append(element("span","До появления журнала",{title:"Для этой записи доступно сравнение версий без времени редактирования."}));
  }
  head.append(meta);
  if (!entry.revertedBy) {
    const undo = formButton("Отменить сохранение",async trigger => {
      if (!await syncDraft()) throw new Error("Сначала сохрани открытые правки.");
      const notes = [];
      if (entry.publication) notes.push("Изменения на сайте появятся после новой публикации.");
      if (entry.hiddenFields) notes.push("В эту запись также входят изменения, скрытые текущим фильтром.");
      if (!await confirmEditorAction({
        title:"Отменить это сохранение в черновике?",description:notes.join(" "),
        action:"Отменить сохранение",trigger
      })) return;
      await api("history/revert",{id:entry.id,revision});
      await syncDraft();
      status("Отмена сохранена в черновике");
      await loadHistory();
      $("#history-title").focus();
    },{class:"history-undo","data-variant":"ghost","data-size":"icon-sm"});
    const icon = element("img","",{src:"/preview/assets/icons/history-undo.svg",alt:"",width:"16",height:"16"});
    undo.textContent = "";
    undo.setAttribute("aria-label","Отменить сохранение");
    undo.title = "Отменить сохранение";
    undo.append(icon);
    head.append(controlHost(undo));
  }
  card.append(head);
  for (const section of entry.sections) {
    const key = entry.id + "-" + section.index;
    card.append(sectionView(entry,section,section.index,initiallyOpen || openSections.has(key)));
  }
  return card;
}

async function loadHistory(older=false, anchor=null) {
  if (historyLoading) {
    if (!anchor) return historyLoading;
    await historyLoading.catch(() => {});
  }
  $("#history-more").disabled = true;
  historyItems.setAttribute("aria-busy","true");
  const filter = historyFilter;
  const operation = (async () => {
    const filters = new URLSearchParams();
    if (filter !== "all") filters.set("type",filter);
    if (older && historyCursor) filters.set("before",historyCursor);
    const query = filters.toString();
    const feed = await api("history"+(query ? "?"+query : ""));
    if (filter !== historyFilter) return;
    const anchorSelector = anchor ? '[data-history-section="'+anchor+'"]' : null;
    const previous = anchorSelector ? historyItems.querySelector(anchorSelector) : null;
    const top = previous?.getBoundingClientRect().top;
    const open = new Set([...historyItems.querySelectorAll("[data-history-section][data-open]")]
      .map(section => section.dataset.historySection));
    if (anchor) open.add(anchor);
    const entries = feed.entries.map((entry,index)=>entryView(entry,open,!older && !anchor && index === 0));
    if (older) historyItems.append(...entries);
    else {
      historyItems.replaceChildren(...entries);
      historyLatest = feed.latest;
      historyLabel.textContent = historyNotice || (entries.length ? "" : filter === "all" ? "Сохранённых правок пока нет." : "Правок этого типа пока нет.");
      if (anchorSelector) {
        const section = historyItems.querySelector(anchorSelector);
        if (section && top != null) historyBody.scrollTop += section.getBoundingClientRect().top - top;
        (section?.querySelector('[data-disclosure-trigger]') || $("#history-title")).focus({preventScroll:true});
      }
      if (feed.unseen && filter === "all") {
        await api("history/seen",{through:feed.latest});
        updateBadge(0);
      }
    }
    historyCursor = feed.more;
    $("#history-more").hidden = !historyCursor;
  })();
  historyLoading = operation;
  try {await operation;}
  finally {
    if (historyLoading === operation) {
      historyLoading = null;
      historyItems.setAttribute("aria-busy","false");
      $("#history-more").disabled = false;
    }
  }
}

async function pollHistory() {
  if (currentRole !== "admin" || document.hidden || historyLoading || confirmationOpen() || editorOverlays.get("crop-dialog").open) return;
  try {
    const meta = await api("history/status");
    updateBadge(meta.unseen);
    if (meta.revision > revision || meta.dirty !== publicDirty) await syncDraft();
    if (historyDialog.open && !editorOverlays.get("crop-dialog").open && meta.latest > historyLatest) await loadHistory();
  } catch {}
}

function startHistory() {
  if (currentRole !== "admin" || historyStarted) return;
  historyStarted = true;
  $("#history").hidden = false;
  pollHistory();
  setInterval(pollHistory,15000);
}

document.addEventListener("draftready",startHistory);
document.addEventListener("historyrefresh",() => {
  if (historyDialog.open) loadHistory().catch(error=>{historyError.textContent=error.message;});
  else pollHistory();
});
document.addEventListener("visibilitychange",pollHistory);
window.addEventListener("focus",pollHistory);
if (data) startHistory();

$("#history-title").tabIndex = -1;
$("#history").addEventListener("click",async event => {
  historyError.textContent = "";
  historyNotice = "";
  historyLabel.textContent = "";
  historyDialog.show(event.currentTarget);
  try {await loadHistory();}
  catch (error) {historyError.textContent = error.message;}
});
$("#history-more").addEventListener("click",() => loadHistory(true).catch(error=>{historyError.textContent=error.message;}));


for (const button of document.querySelectorAll("[data-history-filter]")) {
  button.addEventListener("click",async () => {
    const next = button.dataset.historyFilter;
    if (historyFilter === next) return;
    historyFilter = next;
    historyCursor = null;
    historyNotice = "";
    historyError.textContent = "";
    historyLabel.textContent = "";
    $("#history-more").hidden = true;
    for (const option of document.querySelectorAll("[data-history-filter]")) {
      option.setAttribute("aria-pressed",String(option === button));
    }
    await historyLoading?.catch(() => {});
    if (historyFilter !== next) return;
    historyBody.scrollTop = 0;
    try {await loadHistory();}
    catch (error) {historyError.textContent = error.message;}
  });
}
