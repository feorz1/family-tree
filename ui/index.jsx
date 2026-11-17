import React, {useCallback, useLayoutEffect, useSyncExternalStore} from "react";
import {flushSync} from "react-dom";
import {createRoot} from "react-dom/client";
import {Drawer} from "@animate-ui/react/primitives/base-ui/drawer";
import {Menu} from "@animate-ui/react/primitives/base-ui/menu";
import {Tabs} from "@animate-ui/react/primitives/base-ui/tabs";
import {transition} from "@animate-ui/react/utils/motion";
import {FamilyAnimation} from "./animation";
import {Accordion, Button, Combobox, Icon, Select, Switch} from "./components";
import {tabsRootStyle,tabsListStyle,tabsTriggerStyle} from "./nova";
import {mountEditorControls} from "./editor-controls";
import {mountEditorOverlays} from "./editor-overlays";

const selectControls = new WeakMap();
let selectId = 0;

function FamilySelect({subscribe, get, ...props}) {
  const state = useSyncExternalStore(subscribe, get);
  if (props.search) {
    return <Combobox {...props} {...state} value={state.items.find(item => item.value === state.value) ?? null}
      placeholder="Найти человека…" onValueChange={item => {if (item) props.onValueChange(item.value);}}/>;
  }
  return <Select {...props} {...state}/>;
}

function enhanceSelect(select) {
  if (select.multiple || selectControls.has(select)) return;
  const id = "field-select-" + ++selectId;
  const label = select.closest("label");
  let labelledBy = select.getAttribute("aria-labelledby") || undefined;
  if (label && !labelledBy) {
    const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (text) {
      const title = document.createElement("span");
      title.id = labelledBy = id + "-label";
      title.className = "field-label";
      title.textContent = text.textContent.trim();
      text.replaceWith(title);
    }
  }
  if (label) label.htmlFor = id;

  const host = document.createElement("span");
  host.className = "ui-select-host";
  select.after(host);
  select.hidden = true;

  const root = createRoot(host);
  const listeners = new Set();
  const subscribe = listener => {listeners.add(listener); return () => listeners.delete(listener);};
  let state;
  function sync() {
    const items = [...select.options].map(option => ({value:option.value, label:option.label, disabled:option.disabled}));
    state = {items, value:select.selectedIndex === -1 ? null : select.value,
      disabled:select.disabled || !items.some(item => !item.disabled)};
    for (const listener of listeners) listener();
  }
  function commit(value) {
    if (value === null || select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event("change", {bubbles:true}));
  }

  sync();
  root.render(<FamilyAnimation><FamilySelect id={id} search={select.id === "person"} labelledBy={labelledBy}
    label={labelledBy ? undefined : select.getAttribute("aria-label") || "Выбрать"}
    subscribe={subscribe} get={() => state} onValueChange={commit}/></FamilyAnimation>);
  const observer = new MutationObserver(sync);
  observer.observe(select, {subtree:true, attributes:true, childList:true, characterData:true});
  select.addEventListener("change", sync);
  selectControls.set(select, {sync, focus() {
    host.querySelector("input:not([type=hidden]),button")?.focus();
  }, dispose() {
    select.removeEventListener("change", sync);
    observer.disconnect();
    root.unmount();
    host.remove();
    select.hidden = false;
  }});
}

window.enhanceSelect = enhanceSelect;
window.syncSelect = select => selectControls.get(select)?.sync();
window.focusSelect = select => selectControls.get(select)?.focus();
window.removeSelect = select => {
  selectControls.get(select)?.dispose();
  selectControls.delete(select);
};

const modes = [
  ["light","Светлая","sun"], ["dark","Тёмная","moon"],
  ["system","Как в системе","monitor"], ["time","По времени суток","clock"]
];
const theme = window.familyTheme;

function ThemeMenu() {
  const value = useSyncExternalStore(theme.subscribe, theme.get);
  return <Menu.Root>
    <Menu.Trigger render={<Button variant="ghost" className="ui-theme-button" aria-label="Тема оформления" title="Тема оформления"/>}>
      <Icon name={modes.find(mode => mode[0] === value)[2]}/>
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner align="end" sideOffset={6} className="ui-positioner" collisionPadding={10}>
        <Menu.Popup data-slot="dropdown-menu-content" className="ui-popup ui-theme-popup">
          <Menu.RadioGroup value={value} onValueChange={theme.set} aria-label="Тема оформления">
            {modes.map(([mode,label,icon]) => <Menu.RadioItem key={mode} value={mode} closeOnClick className="ui-item ui-theme-option">
              <Icon name={icon}/><span>{label}</span>
              <Menu.RadioItemIndicator className="ui-indicator"><Icon name="check"/></Menu.RadioItemIndicator>
            </Menu.RadioItem>)}
          </Menu.RadioGroup>
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>;
}

function Navigation({subscribe, get, items, label, host, onValueChange}) {
  const value = useSyncExternalStore(subscribe, get);
  const active = items.find(item => item.value === value);
  useLayoutEffect(() => {
    const tab = active && document.getElementById(active.tabId);
    if (!tab || host.scrollWidth <= host.clientWidth) return;
    const bounds = host.getBoundingClientRect();
    const tabBounds = tab.getBoundingClientRect();
    if (tabBounds.left < bounds.left) host.scrollLeft += tabBounds.left - bounds.left - 2;
    else if (tabBounds.right > bounds.right) host.scrollLeft += tabBounds.right - bounds.right + 2;
  }, [active, host]);
  return <Tabs.Root value={value} onValueChange={onValueChange} data-slot="tabs" className={tabsRootStyle}>
    <Tabs.List data-slot="tabs-list" data-variant="line" className={`ui-tabs-list ${tabsListStyle}`} aria-label={label}>
      {items.map(item => <Tabs.Tab key={item.value} value={item.value} id={item.tabId}
        aria-controls={item.panelId} data-slot="tabs-trigger" className={`ui-tab ${tabsTriggerStyle}`}>{item.label}</Tabs.Tab>)}
    </Tabs.List>
  </Tabs.Root>;
}

function mountNavigation(control, buttons, attr, values, activate, panelId = value => value) {
  if (!control) return;
  const host = document.createElement("div");
  host.className = "ui-tabs";
  host.dataset.navigation = control.id;
  control.after(host);
  const items = buttons.map(button => {
    const value = values(button);
    return {value, label:button.textContent.trim(), tabId:`${control.id}-tab-${value}`, panelId:panelId(value)};
  });
  for (const item of items) {
    const panel = document.getElementById(item.panelId);
    panel?.setAttribute("role","tabpanel");
    panel?.setAttribute("aria-labelledby",item.tabId);
  }
  const get = () => values(buttons.find(button => button.hasAttribute(attr) && button.getAttribute(attr) !== "false") || buttons[0]);
  const subscribe = listener => {
    const observer = new MutationObserver(listener);
    observer.observe(control,{attributes:true,subtree:true,attributeFilter:[attr]});
    return () => observer.disconnect();
  };
  createRoot(host).render(<FamilyAnimation><Navigation subscribe={subscribe} get={get} items={items}
    label={control.getAttribute("aria-label")} host={host}
    onValueChange={value => activate(buttons.find(button => values(button) === value))}/></FamilyAnimation>);
  control.hidden = true;
}

function PersonSearch({tree}) {
  const chart = useSyncExternalStore(tree.subscribe, tree.getChart);
  if (chart === "sources") return null;
  return <Combobox key={chart} items={tree.getOptions(chart)} label="Найти человека"
    placeholder="Поиск" search onValueChange={item => {if (item) tree.select(item.value);}}/>;
}

function MobileDrawer({tree}) {
  const drawer = useSyncExternalStore(tree.subscribe, tree.getDrawer);
  const slot = drawer?.slot;
  const attachPanel = useCallback(host => {
    if (!host) return;
    const panel = tree.getPanel();
    host.append(panel);
    if (tree.getDrawer()?.keyboard) panel.querySelector("#dialog-name").focus({preventScroll:true});
    return () => { if (panel.parentNode === host) document.body.append(panel); };
  }, [slot, tree]);
  useLayoutEffect(() => {
    if (drawer?.open && drawer.keyboard) tree.getPanel().querySelector("#dialog-name").focus({preventScroll:true});
  }, [drawer, tree]);

  if (!drawer) return null;
  return <Drawer.Root open={drawer.open} modal={false} disablePointerDismissal swipeDirection="down"
    onOpenChange={open => {if (!open) tree.close();}}
    onOpenChangeComplete={open => {if (!open) tree.finishDrawerClose(slot);}}>
    <Drawer.Portal container={slot}>
      <Drawer.Viewport className="person-drawer-viewport">
        <Drawer.Popup data-slot="drawer-content" className="person-drawer-popup" initialFocus={false} finalFocus={false}
          aria-labelledby="dialog-name" transition={transition.fade}>
          <div className="person-drawer-handle" aria-hidden="true"><span/></div>
          <Drawer.Content className="person-drawer-body" data-base-ui-swipe-ignore ref={attachPanel}/>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  </Drawer.Root>;
}

function ContrastSwitch({contrast}) {
  const checked = useSyncExternalStore(contrast.subscribe,contrast.get);
  return <label className="contrast-label">
    <span>Контраст</span>
    <Switch checked={checked} onCheckedChange={contrast.set} aria-label="Контрастный режим"/>
  </label>;
}

mountEditorControls();
mountEditorOverlays();

const settings = document.querySelector("#theme-control");
if (settings) createRoot(settings).render(<FamilyAnimation><ThemeMenu/></FamilyAnimation>);
const branchTabs = document.querySelector("#section-tabs");
if (branchTabs && window.familyTreeUI) {
  const tree = window.familyTreeUI;
  mountNavigation(branchTabs, [...branchTabs.querySelectorAll("a")], "aria-current", link => link.hash.slice(1), link => link.click());
  const archiveTabs = document.querySelector("#archive-tabs");
  if (archiveTabs) mountNavigation(archiveTabs, [...archiveTabs.querySelectorAll("a")], "aria-current",
    link => link.hash.slice(1), link => link.click(), value => "chart-" + value);
  createRoot(document.querySelector("#person-search")).render(<FamilyAnimation><PersonSearch tree={tree}/></FamilyAnimation>);
  createRoot(document.querySelector("#person-drawer")).render(<FamilyAnimation><MobileDrawer tree={tree}/></FamilyAnimation>);
  document.documentElement.dataset.uiReady = "";
}
const modeTabs = document.querySelector("#editor-tabs");
if (modeTabs) mountNavigation(modeTabs, [...modeTabs.querySelectorAll("[data-mode]")], "aria-pressed", button => button.dataset.mode, button => button.click());

const personAccordion = document.querySelector("#person-accordion");
if (personAccordion) {
  const sections = [...personAccordion.children].map(body => ({body, label:body.dataset.accordionLabel}));
  const root = createRoot(personAccordion);
  // Existing editor scripts bind directly to the fields inside these panels.
  flushSync(() => root.render(<FamilyAnimation><Accordion sections={sections}/></FamilyAnimation>));
}

const contrast = window.familyContrastUI;
if (contrast) for (const host of document.querySelectorAll(".contrast-control")) {
  createRoot(host).render(<FamilyAnimation><ContrastSwitch contrast={contrast}/></FamilyAnimation>);
}
