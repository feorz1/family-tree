"use strict";

const historyDialog = $("#history-dialog");
const historyLabel = $("#history-summary");
const historyError = $("#history-error");
const historyItems = $("#history-items");
const historyDate = new Intl.DateTimeFormat("ru-RU", {
  dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Moscow"
});
let historyCursor = null, historyLatest = 0, historyLoading = false, historyStarted = false;

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
      const details = element("details");
      const coordinates = value.points.map(point=>point.join(", ")).join(" · ");
      details.append(element("summary","Положение точек"),element("p",coordinates || summaryText([value.start,value.end].filter(Boolean))));
      info.append(details);
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

function formButton(label, action) {
  const button = element("button",label,{type:"button"});
  button.addEventListener("click",async () => {
    button.disabled = true;
    historyError.textContent = "";
    try {await action();}
    catch (error) {historyError.textContent = error.message;}
    finally {button.disabled = false;}
  });
  return button;
}

function sectionView(entry, section, index, open) {
  const group = element("details","",{class:"history-section"});
  group.open = open;
  const chartName = titles[section.chart];
  const summary = element("summary");
  summary.append(element("span",section.title || chartName || "Общие данные"));
  if (section.title && chartName) summary.append(element("small",chartName));
  if (section.acceptedAt) summary.append(element("small","Принято",{class:"history-state"}));
  group.append(summary);
  const contents = element("div","",{class:"history-fields"});
  if (section.beforeCard || section.afterCard) {
    contents.append(comparison(null,portrait(section.beforeCard),portrait(section.afterCard)));
  }
  const canReview = !entry.publication && !entry.revertedBy && !section.acceptedAt &&
    (entry.role === "editor" || entry.action === "recovered");
  for (const field of section.fields) {
    const row = comparison(field.label,describeValue(field,field.before),describeValue(field,field.after));
    if (canReview && section.afterCard && (field.kind === "photos" || field.target)) {
      const edit = formButton(field.kind === "photos" ? "Уточнить кадр и принять" : "Уточнить и принять",async () => {
        if (!await syncDraft()) throw new Error("Сначала сохрани открытые правки.");
        historyDialog.close();
        if (!openReviewCard({id:entry.id,section:index,details:section,title:section.title,field})) {
          historyDialog.showModal();
          throw new Error("Этой карточки больше нет в текущем черновике.");
        }
      });
      edit.className = "history-edit";
      edit.setAttribute("aria-label",edit.textContent+" · "+field.label+" · "+section.title);
      row.append(edit);
    }
    contents.append(row);
  }
  if (canReview) {
    const approve = formButton(section.title ? "Принять изменения карточки" : "Принять изменения",async () => {
      if (!await syncDraft()) throw new Error("Сначала сохрани открытые правки.");
      await api("history/accept",{id:entry.id,section:index,revision});
      await loadHistory();
      $("#history-title").focus();
    });
    contents.append(approve);
  }
  group.append(contents);
  return group;
}

function entryView(entry, open) {
  const card = element("article","",{class:"history-entry"});
  const head = element("div","",{class:"history-entry-head"});
  const meta = element("div","",{class:"history-meta"});
  meta.append(element("h4",entry.actor || "Автор не записан"));
  if (entry.editedAt) {
    meta.append(element("time",dateLabel(entry.editedAt),{datetime:new Date(entry.editedAt*1000).toISOString()}));
  } else meta.append(element("span","Время редактирования не записано"));
  const badges = element("div","",{class:"history-tags"});
  if (entry.role) badges.append(element("span",entry.role === "editor" ? "Редактор" : "Владелец"));
  if (entry.action === "revert") badges.append(element("span","Отмена правки"));
  if (entry.action === "recovered") badges.append(element("span","Восстановлено из версий"));
  if (entry.revertedBy) badges.append(element("span","Отменено"));
  else if (entry.publication) badges.append(element("span","Передано на публикацию"+(entry.publishedAt ? " · "+dateLabel(entry.publishedAt) : "")));
  else badges.append(element("span","В черновике"));
  meta.append(badges);
  head.append(meta);
  if (!entry.revertedBy) {
    const overflow = element("details","",{class:"history-more-actions"});
    const more = element("summary","Ещё");
    const undo = formButton("Отменить сохранение",async () => {
      if (!await syncDraft()) throw new Error("Сначала сохрани открытые правки.");
      const message = entry.publication
        ? "Отменить сохранение в черновике? Изменения на сайте появятся после новой публикации."
        : "Отменить это сохранение в черновике?";
      if (!confirm(message)) return;
      await api("history/revert",{id:entry.id,revision});
      await syncDraft();
      status("Отмена сохранена в черновике");
      await loadHistory();
      $("#history-title").focus();
    });
    overflow.append(more,undo);
    head.append(overflow);
  }
  card.append(head);
  for (const [index,section] of entry.sections.entries()) card.append(sectionView(entry,section,index,open));
  return card;
}

async function loadHistory(older=false) {
  if (historyLoading) return;
  historyLoading = true;
  $("#history-more").disabled = true;
  try {
    const feed = await api("history"+(older && historyCursor ? "?before="+historyCursor : ""));
    const entries = feed.entries.map((entry,index)=>entryView(entry,!older && index === 0));
    if (older) historyItems.append(...entries);
    else {
      historyItems.replaceChildren(...entries);
      historyLatest = feed.latest;
      historyLabel.textContent = entries.length ? "" : "Сохранённых правок пока нет.";
      if (feed.unseen) {
        await api("history/seen",{through:feed.latest});
        updateBadge(0);
      }
    }
    historyCursor = feed.more;
    $("#history-more").hidden = !historyCursor;
  } finally {
    historyLoading = false;
    $("#history-more").disabled = false;
  }
}

async function pollHistory() {
  if (currentRole !== "admin" || document.hidden || historyLoading) return;
  try {
    const meta = await api("history/status");
    updateBadge(meta.unseen);
    if (meta.revision > revision || meta.dirty !== publicDirty) await syncDraft();
    if (historyDialog.open && meta.latest > historyLatest) await loadHistory();
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
$("#history").addEventListener("click",async () => {
  historyError.textContent = "";
  historyLabel.textContent = "Загружаем историю…";
  historyDialog.showModal();
  try {await loadHistory();}
  catch (error) {historyError.textContent = error.message;}
});
$("#close-history").addEventListener("click",() => historyDialog.close());
$("#history-more").addEventListener("click",() => loadHistory(true).catch(error=>{historyError.textContent=error.message;}));
