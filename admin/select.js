"use strict";

const selectControls = new WeakMap();
let openSelect = null;
let selectId = 0;

function syncSelect(select) {
  selectControls.get(select)?.sync();
}

function enhanceSelect(select) {
  if (select.multiple || selectControls.has(select)) return;
  const id = "field-select-" + ++selectId;
  const button = document.createElement("button");
  const value = document.createElement("span");
  const icon = document.createElement("img");
  const list = document.createElement("div");
  button.className = "select-trigger";
  button.id = id;
  button.type = "button";
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", id + "-list");
  button.setAttribute("aria-haspopup", "listbox");
  value.className = "select-value";
  icon.className = "select-chevron";
  icon.src = "/preview/assets/icons/chevron-down-16.svg";
  icon.width = icon.height = 16;
  icon.alt = "";
  button.append(value, icon);
  list.className = "select-menu";
  list.id = id + "-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  const label = select.closest("label");
  const labelledBy = select.getAttribute("aria-labelledby");
  if (label && !labelledBy) {
    const title = document.createElement("span");
    const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    title.id = id + "-label";
    title.className = "field-label";
    if (text) {
      title.textContent = text.textContent.trim();
      text.replaceWith(title);
    }
    label.htmlFor = id;
    button.setAttribute("aria-labelledby", title.id);
    list.setAttribute("aria-labelledby", title.id);
  } else {
    const attr = labelledBy ? "aria-labelledby" : "aria-label";
    const name = labelledBy || select.getAttribute("aria-label") || "Выбрать";
    button.setAttribute(attr, name);
    list.setAttribute(attr, name);
  }
  select.hidden = true;
  select.after(button);
  document.body.append(list);

  let active = -1;
  let typed = "";
  let lastTyped = 0;
  let options = [];

  function sync() {
    options = [...select.options];
    value.textContent = options[select.selectedIndex]?.textContent || "Нет вариантов";
    button.disabled = select.disabled || !options.some(option => !option.disabled);
    button.title = value.textContent;
    if (openSelect === control) close();
  }

  function place() {
    const rect = button.getBoundingClientRect();
    const panel = button.closest("aside")?.getBoundingClientRect();
    if (!rect.width || rect.bottom <= Math.max(panel?.top || 0, 0) || rect.top >= innerHeight) {
      close();
      return;
    }
    const below = innerHeight - rect.bottom - 14;
    const above = rect.top - 14;
    const up = below < 184 && above > below;
    list.style.width = rect.width + "px";
    list.style.left = rect.left + "px";
    list.style.maxHeight = Math.max(44, Math.min(320, up ? above : below)) + "px";
    list.style.top = up ? "auto" : rect.bottom + 6 + "px";
    list.style.bottom = up ? innerHeight - rect.top + 6 + "px" : "auto";
  }

  function focusOption(index) {
    if (!options[index] || options[index].disabled) return;
    if (list.children[active]) list.children[active].classList.remove("is-active");
    active = index;
    const item = list.children[index];
    item.classList.add("is-active");
    button.setAttribute("aria-activedescendant", item.id);
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }

  function show() {
    if (button.disabled || openSelect === control) return;
    openSelect?.close();
    openSelect = control;
    button.setAttribute("aria-expanded", "true");
    list.replaceChildren(...options.map((option, index) => {
      const item = document.createElement("div");
      item.id = id + "-" + index;
      item.className = "select-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(index === select.selectedIndex));
      if (option.disabled) item.setAttribute("aria-disabled", "true");
      item.dataset.index = index;
      item.textContent = option.textContent;
      return item;
    }));
    list.hidden = false;
    place();
    if (openSelect === control) focusOption(select.selectedIndex === -1 ? options.findIndex(x => !x.disabled) : select.selectedIndex);
  }

  function close() {
    if (openSelect !== control) return;
    openSelect = null;
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    active = -1;
    typed = "";
  }

  function choose(index) {
    if (index < 0 || options[index]?.disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    close();
    sync();
    if (changed) select.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function move(step) {
    const first = active === -1 ? (step > 0 ? 0 : options.length - 1) : active + step;
    for (let index = first; index >= 0 && index < options.length; index += step) {
      if (!options[index].disabled) {
        focusOption(index);
        return;
      }
    }
  }

  button.addEventListener("click", () => {
    if (openSelect === control) close(); else show();
  });
  button.addEventListener("keydown", event => {
    const key = event.key, expanded = openSelect === control;
    if (expanded && key === "Tab") {
      choose(active);
      return;
    }
    if (key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      return;
    }
    if (["ArrowDown","ArrowUp","Home","End","PageUp","PageDown","Enter"," "].includes(key)) {
      event.preventDefault();
      if (!expanded) show();
      if (key === "Home") focusOption(options.findIndex(item => !item.disabled));
      if (key === "End") focusOption(options.findLastIndex(item => !item.disabled));
      if (expanded && key === "ArrowDown" && !event.altKey) move(1);
      if (expanded && key === "ArrowUp" && !event.altKey) move(-1);
      if (expanded && key === "ArrowUp" && event.altKey) choose(active);
      if (key === "PageDown" || key === "PageUp") {
        for (let i = 0; i < 8; i++) move(key === "PageDown" ? 1 : -1);
      }
      if (expanded && (key === "Enter" || key === " ")) choose(active);
      return;
    }
    if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (!expanded) show();
    const normalized = key.toLocaleLowerCase("ru"), now = performance.now();
    const former = now - lastTyped < 700 ? typed : "";
    typed = former === normalized ? normalized : former + normalized;
    lastTyped = now;
    const start = former && former !== normalized ? Math.max(0, active) : (active+1) % options.length;
    for (let delta = 0; delta < options.length; delta++) {
      const index = (start+delta) % options.length;
      if (!options[index].disabled && options[index].textContent.toLocaleLowerCase("ru").startsWith(typed)) {
        focusOption(index);
        break;
      }
    }
  });
  button.addEventListener("blur", () => close());
  list.addEventListener("mousedown", event => event.preventDefault());
  list.addEventListener("click", event => {
    const item = event.target.closest("[data-index]");
    if (!item || item.getAttribute("aria-disabled") === "true") return;
    button.focus({preventScroll:true});
    choose(Number(item.dataset.index));
  });

  const control = {sync, close, place, list, button, dispose() {observer.disconnect();}};
  selectControls.set(select, control);
  const observer = new MutationObserver(sync);
  observer.observe(select, {childList:true,subtree:true,attributes:true,characterData:true});
  select.addEventListener("change", sync);
  sync();
}

document.addEventListener("pointerdown", event => {
  if (openSelect && !openSelect.list.contains(event.target) && !openSelect.button.contains(event.target)) openSelect.close();
});
document.addEventListener("scroll", event => {
  if (openSelect && !openSelect.list.contains(event.target)) openSelect.place();
}, true);
window.addEventListener("resize", () => openSelect?.place());

function removeSelect(select) {
  const control = selectControls.get(select);
  control?.close();
  control?.dispose();
  control?.list.remove();
}
