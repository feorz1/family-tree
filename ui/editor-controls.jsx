import React, {useSyncExternalStore} from "react";
import {flushSync, createPortal} from "react-dom";
import {createRoot} from "react-dom/client";
import {Collapsible as CollapsiblePrimitive} from "@base-ui/react/collapsible";
import {Checkbox as CheckboxPrimitive} from "@base-ui/react/checkbox";
import {Input as InputPrimitive} from "@base-ui/react/input";
import {Slider as SliderPrimitive} from "@base-ui/react/slider";
import {Button, Icon} from "./components";
import {inputStyle,textareaStyle} from "./nova";

const propertyNames = {
  class:"className", readonly:"readOnly", autocomplete:"autoComplete", inputmode:"inputMode",
  maxlength:"maxLength", minlength:"minLength", tabindex:"tabIndex"
};
const booleanProps = new Set(["disabled","hidden","multiple","readOnly","required"]);
const dynamicControls = new Map();
const hosts = new WeakMap();
const setters = new WeakMap();

function inputProps(attributes) {
  return Object.fromEntries(Object.entries(attributes).map(([attribute,value])=>{
    const key = propertyNames[attribute] || attribute;
    return [key, booleanProps.has(key) ? true : value];
  }));
}

function slot(source) {
  const host = document.createElement("span");
  host.className = "ui-control-host";
  source?.replaceWith(host);
  return host;
}

function stateStore(initial, onChange) {
  const listeners = new Set();
  let state = initial;
  return {
    get:()=>state,
    subscribe(listener){listeners.add(listener); return ()=>listeners.delete(listener);},
    set(patch){
      if (Object.entries(patch).every(([key,value])=>state[key]===value)) return;
      state = {...state,...patch};
      for (const listener of listeners) listener();
    },
    onChange
  };
}

function Checkbox({id, name, value, store, inputRef}) {
  const {checked} = useSyncExternalStore(store.subscribe, store.get);
  return <CheckboxPrimitive.Root id={id} name={name} value={value} checked={checked} inputRef={inputRef}
    data-slot="checkbox" className="ui-checkbox" onCheckedChange={next=>store.set({checked:next})}>
    <CheckboxPrimitive.Indicator className="ui-checkbox-indicator"><Icon name="check"/></CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>;
}

function Slider({min, max, step, label, store}) {
  const {value, disabled} = useSyncExternalStore(store.subscribe, store.get);
  return <SliderPrimitive.Root min={min} max={max} step={step} value={value} disabled={disabled}
    data-slot="slider" className="ui-slider"
    onValueChange={next=>{
      store.set({value:next});
      store.onChange(next);
    }}>
    <SliderPrimitive.Control className="ui-slider-control">
      <SliderPrimitive.Track className="ui-slider-track"><SliderPrimitive.Indicator className="ui-slider-indicator"/></SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="ui-slider-thumb" getAriaLabel={()=>label}/>
    </SliderPrimitive.Control>
  </SliderPrimitive.Root>;
}

function childrenOf(button) {
  return [...button.childNodes].map((child,index)=>child.nodeType===Node.TEXT_NODE
    ? child.textContent
    : <span key={index} {...inputProps(Object.fromEntries([...child.attributes].map(a=>[a.name,a.value])))}>
        {child.textContent}
      </span>);
}

function buildControl(tag, attributes, text, source, inputRef) {
  const props = inputProps(attributes);
  if (tag === "button") {
    const {"data-variant":variant,"data-size":size,...buttonProps} = props;
    return <Button {...buttonProps} variant={variant} size={size} ref={inputRef}>
      {source ? childrenOf(source) : text}
    </Button>;
  }
  if (tag === "textarea") {
    return <textarea {...props} data-slot="textarea" className={`ui-input ${textareaStyle}`} defaultValue={text} ref={inputRef}/>;
  }
  const {value, ...other} = props;
  if (props.type === "checkbox") {
    const store = stateStore({checked:"checked" in props});
    return <Checkbox id={props.id} name={props.name} value={value} store={store} inputRef={node=>{
      if (node) setters.set(node,store.set);
      inputRef(node);
    }}/>;
  }
  return <InputPrimitive {...other} defaultValue={value} data-slot="input" className={`ui-input ${inputStyle}`} ref={inputRef}/>;
}

function mountStaticControl(source, index) {
  const tag = source.localName;
  const attributes = Object.fromEntries([...source.attributes].map(a=>[a.name,a.value]));
  const label = source.closest("label");
  const host = slot(source);
  if (attributes.type === "range") {
    const name = source.id;
    const store = stateStore({value:Number(source.value), disabled:source.disabled},next=>{
      source.value = next;
      source.dispatchEvent(new Event("input",{bubbles:true}));
    });
    // The editor's geometry code reads and writes this value without owning the slider.
    source.hidden = true;
    source.type = "hidden";
    source.value = store.get().value;
    host.before(source);
    setters.set(source,store.set);
    const labelText = [...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE)?.textContent.trim();
    return createPortal(<Slider min={Number(attributes.min)} max={Number(attributes.max)}
      step={Number(attributes.step) || 1} label={labelText} store={store}/>,host,name);
  }
  return createPortal(buildControl(tag,attributes,source.textContent,source,()=>{}),host,index);
}

export function mountEditorControls() {
  const owner = document.querySelector("main.auth-card,#person-accordion");
  if (!owner) return;
  const rootHost = document.createElement("div");
  rootHost.className = "ui-control-host";
  document.body.append(rootHost);
  const sources = [...document.querySelectorAll("button[data-variant]:not([data-dialog-close]),input,textarea")];
  const panels = sources.map(mountStaticControl);
  const root = createRoot(rootHost);
  flushSync(()=>root.render(panels));

  new MutationObserver(records=>{
    if (!records.some(record=>record.removedNodes.length)) return;
    for (const [host, root] of dynamicControls) {
      if (!host.isConnected) {
        root.unmount();
        dynamicControls.delete(host);
      }
    }
  }).observe(document.body,{childList:true,subtree:true});
}

function mountDynamic(content) {
  const host = slot();
  const root = createRoot(host);
  flushSync(()=>root.render(content));
  dynamicControls.set(host,root);
  return host;
}

window.editorControl = (tag, text, attributes) => {
  let node;
  const host = mountDynamic(buildControl(tag,attributes,text,null,element=>{node = element;}));
  if (!node) throw new Error("Не удалось создать поле редактора");
  hosts.set(node,host);
  return node;
};

window.editorCollapsible = ({summary, content, attributes = {}, open = false}) => {
  return mountDynamic(<CollapsiblePrimitive.Root {...inputProps(attributes)} defaultOpen={open} data-slot="collapsible">
    <CollapsiblePrimitive.Trigger render={<Button variant="ghost" className="ui-disclosure-trigger"/>} data-disclosure-trigger="">
      <span className="ui-control-host" ref={node=>{if (node) node.append(...summary.childNodes);}}/>
      <Icon name="chevron"/>
    </CollapsiblePrimitive.Trigger>
    <CollapsiblePrimitive.Panel keepMounted data-slot="collapsible-content" className="ui-disclosure-content"
      ref={node=>{if (node) node.append(content);}}/>
  </CollapsiblePrimitive.Root>);
};
window.controlHost = node => hosts.get(node) ?? node;
window.updateEditorControl = (node, patch) => {
  Object.assign(node,patch);
  setters.get(node)?.(patch);
};
