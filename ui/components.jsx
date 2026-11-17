import React from "react";
import {Accordion as AccordionPrimitive} from "@base-ui/react/accordion";
import {Button as ButtonPrimitive} from "@base-ui/react/button";
import {Combobox as ComboboxPrimitive} from "@base-ui/react/combobox";
import {Select as SelectPrimitive} from "@base-ui/react/select";
import {Switch as SwitchPrimitive} from "@base-ui/react/switch";
import {buttonStyle,buttonVariants,buttonSizes,inputGroupStyle,selectStyle,switchStyle,switchThumbStyle} from "./nova";

// shadcn/ui Base UI composition, styled with the shared CSS variables.
export function Icon({name}) {
  const paths = {
    chevron: "m4 6 4 4 4-4",
    check: "m3.5 8 3 3 6-6",
    sun: "M8 1v2m0 10v2M1 8h2m10 0h2M3 3l1.4 1.4m7.2 7.2L13 13M3 13l1.4-1.4m7.2-7.2L13 3",
    moon: "M12.9 10.9A5.8 5.8 0 0 1 5.1 3a5.8 5.8 0 1 0 7.8 7.9Z",
    monitor: "M2 3.5h12v8H2zM6 14h4M8 11.5V14",
    clock: "M8 4.5V8l2.3 1.5",
    search: "m10.3 10.3 3 3"
  };
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor"
    strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]}/>
    {name === "search" && <circle cx="7" cy="7" r="4.4"/>}
    {name === "sun" && <circle cx="8" cy="8" r="3"/>}
    {name === "clock" && <circle cx="8" cy="8" r="5.5"/>}
  </svg>;
}

export function Button({variant = "outline", size = "default", className = "", ...props}) {
  return <ButtonPrimitive data-slot="button" data-variant={variant} data-size={size}
    className={`ui-button ${buttonStyle} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`} {...props}/>;
}

export function Switch(props) {
  return <SwitchPrimitive.Root data-slot="switch" data-size="default" className={`ui-switch ${switchStyle}`} {...props}>
    <SwitchPrimitive.Thumb data-slot="switch-thumb" className={switchThumbStyle}/>
  </SwitchPrimitive.Root>;
}

export function Accordion({sections}) {
  return <AccordionPrimitive.Root data-slot="accordion" className="ui-accordion" multiple keepMounted>
    {sections.map(({label, body}) => <AccordionPrimitive.Item key={label} value={label}
      data-slot="accordion-item" className="ui-accordion-item">
      <AccordionPrimitive.Header className="ui-accordion-heading">
        <AccordionPrimitive.Trigger data-slot="accordion-trigger" className="ui-accordion-trigger">
          {label}<Icon name="chevron"/>
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Panel data-slot="accordion-content" className="ui-accordion-content">
        <div className="ui-accordion-body" ref={host => {if (host) host.append(body);}}/>
      </AccordionPrimitive.Panel>
    </AccordionPrimitive.Item>)}
  </AccordionPrimitive.Root>;
}

export function Combobox({items, value, onValueChange, labelledBy, label, placeholder, disabled, id, search = false}) {
  return <ComboboxPrimitive.Root items={items} value={value} onValueChange={onValueChange} disabled={disabled}
    itemToStringLabel={item => item.label}
    isItemEqualToValue={(item, selected) => item.value === selected.value}>
    <ComboboxPrimitive.InputGroup data-slot="input-group" className={`ui-combobox ${inputGroupStyle}`}>
      {search && <span className="ui-search-icon"><Icon name="search"/></span>}
      <ComboboxPrimitive.Input id={id} aria-labelledby={labelledBy} aria-label={label}
        data-slot="input-group-control" className="ui-combobox-input" placeholder={placeholder}
        onFocus={event => event.currentTarget.select()}/>
      <ComboboxPrimitive.Trigger type="button" aria-label="Показать варианты" className="ui-chevron-button">
        <Icon name="chevron"/>
      </ComboboxPrimitive.Trigger>
    </ComboboxPrimitive.InputGroup>
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner className="ui-positioner" sideOffset={6} align="end" collisionPadding={10}>
        <ComboboxPrimitive.Popup data-slot="combobox-content" className="ui-popup ui-combobox-popup">
          <ComboboxPrimitive.Empty className="ui-empty">Ничего не найдено</ComboboxPrimitive.Empty>
          <ComboboxPrimitive.List>
            {item => <ComboboxPrimitive.Item key={item.value} value={item} disabled={item.disabled} className="ui-item">
              <span>{item.label}{item.description && <small>{item.description}</small>}</span>
              <ComboboxPrimitive.ItemIndicator className="ui-indicator"><Icon name="check"/></ComboboxPrimitive.ItemIndicator>
            </ComboboxPrimitive.Item>}
          </ComboboxPrimitive.List>
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  </ComboboxPrimitive.Root>;
}

export function Select({items, value, onValueChange, disabled, id, labelledBy, label}) {
  return <SelectPrimitive.Root items={items} value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectPrimitive.Trigger id={id} aria-labelledby={labelledBy} aria-label={label}
      data-slot="select-trigger" data-size="default" className={`ui-select-trigger ${selectStyle}`}>
      <SelectPrimitive.Value className="ui-value">
        {selected => items.find(item => item.value === selected)?.label || "Нет вариантов"}
      </SelectPrimitive.Value>
      <SelectPrimitive.Icon className="ui-chevron"><Icon name="chevron"/></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner className="ui-positioner" alignItemWithTrigger={false} sideOffset={6}>
        <SelectPrimitive.Popup data-slot="select-content" className="ui-popup">
          <SelectPrimitive.List>
            {items.map(item => <SelectPrimitive.Item key={item.value} value={item.value} disabled={item.disabled} className="ui-item">
              <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
              <SelectPrimitive.ItemIndicator className="ui-indicator"><Icon name="check"/></SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>)}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
