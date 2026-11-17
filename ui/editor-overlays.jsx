import React, {useMemo, useRef, useSyncExternalStore} from "react";
import {flushSync, createPortal} from "react-dom";
import {createRoot} from "react-dom/client";
import {AlertDialog} from "@animate-ui/react/primitives/base-ui/alert-dialog";
import {Dialog} from "@animate-ui/react/primitives/base-ui/dialog";
import {FamilyAnimation} from "./animation";
import {Button} from "./components";

function prepareOverlay(source) {
  const id = source.id;
  const sheet = source.dataset.editorOverlay === "sheet";
  const title = document.getElementById(source.getAttribute("aria-labelledby"));
  const titleHost = document.createElement("span");
  titleHost.className = "ui-control-host";
  title.replaceWith(titleHost);
  const closeButton = source.querySelector("[data-dialog-close]");
  const closeHost = document.createElement("span");
  closeHost.className = "ui-control-host";
  closeButton.replaceWith(closeHost);
  const content = [...source.childNodes];
  source.remove();

  const listeners = new Set();
  let open = false;
  const setOpen = value => {
    if (open === value) return;
    open = value;
    for (const listener of listeners) listener();
  };
  return {
    id, sheet, title, titleHost, closeButton, closeHost, content,
    element:null, opener:null, restoreFocus:true,
    get open(){return open;},
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    show(opener = document.activeElement) {
      if (open) return;
      this.opener = opener;
      this.restoreFocus = true;
      flushSync(()=>setOpen(true));
    },
    close({restoreFocus = true} = {}) {
      if (!open) return;
      this.restoreFocus = restoreFocus;
      setOpen(false);
      this.element.dispatchEvent(new Event("close"));
    },
    dismiss(details) {
      if (!this.element.dispatchEvent(new Event("cancel",{cancelable:true}))) {
        details.cancel();
        return;
      }
      this.close();
    }
  };
}

function EditorOverlay({entry, children}) {
  const open = useSyncExternalStore(entry.subscribe, ()=>entry.open);
  const attach = useMemo(()=>element=>{
    entry.element = element;
    if (element) element.append(...entry.content);
  },[entry]);
  return <Dialog.Root open={open} disablePointerDismissal
    onOpenChange={(next,details)=>{if (!next) entry.dismiss(details);}}>
    <Dialog.Portal keepMounted>
      <Dialog.Backdrop className="ui-dialog-overlay" data-overlay-for={entry.id}/>
      <Dialog.Popup id={entry.id} data-slot={entry.sheet?"sheet-content":"dialog-content"}
        data-side={entry.sheet ? "right" : undefined}
        className={entry.sheet?"ui-sheet-content":"ui-dialog-content"}
        ref={attach}
        initialFocus={()=>entry.id==="crop-dialog"
          ? entry.element?.querySelector("input[type=range]") ?? entry.element
          : document.getElementById(entry.closeButton.id)}
        finalFocus={()=>entry.restoreFocus && entry.opener?.isConnected ? entry.opener : false}>
        {createPortal(<Dialog.Title id={entry.title.id} render={<h2 tabIndex={-1}/>}>
          {entry.title.textContent}
        </Dialog.Title>,entry.titleHost)}
        {createPortal(<Dialog.Close render={<Button id={entry.closeButton.id} size="sm" variant="ghost"/>}>
          {entry.closeButton.textContent}
        </Dialog.Close>,entry.closeHost)}
      </Dialog.Popup>
      {children}
    </Dialog.Portal>
  </Dialog.Root>;
}

let confirmation = null;
const confirmationListeners = new Set();
function subscribeConfirmation(listener) {
  confirmationListeners.add(listener);
  return () => confirmationListeners.delete(listener);
}
function setConfirmation(value) {
  confirmation = value;
  for (const listener of confirmationListeners) listener();
}
function answerConfirmation(answer) {
  const current = confirmation;
  if (!current) return;
  setConfirmation(null);
  current.resolve(answer);
}

function Confirmation({surface}) {
  const current = useSyncExternalStore(subscribeConfirmation,()=>confirmation);
  const entry = current?.surface === surface ? current : null;
  const cancelButton = useRef(null);
  return <AlertDialog.Root open={Boolean(entry)} onOpenChange={open=>{if (!open && entry) answerConfirmation(false);}}>
    <AlertDialog.Portal>
      {entry && <>
        <AlertDialog.Backdrop className="ui-dialog-overlay ui-confirm-overlay"/>
        <AlertDialog.Popup className="ui-dialog-content ui-confirm" data-slot="alert-dialog-content"
          initialFocus={cancelButton}
          finalFocus={()=>entry.trigger?.isConnected ? entry.trigger : false}>
          <AlertDialog.Title className="ui-confirm-title">{entry.title}</AlertDialog.Title>
          {entry.description && <AlertDialog.Description className="ui-confirm-description">
            {entry.description}
          </AlertDialog.Description>}
          <div className="ui-confirm-actions">
            <AlertDialog.Close render={<Button ref={cancelButton} data-confirm-cancel="" variant="outline"/>}>Отмена</AlertDialog.Close>
            <Button variant={entry.variant} onClick={()=>answerConfirmation(true)}>{entry.action}</Button>
          </div>
        </AlertDialog.Popup>
      </>}
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}

export function mountEditorOverlays() {
  const sources = [...document.querySelectorAll("[data-editor-overlay]")];
  if (!sources.length) return;
  const entries = new Map(sources.map(source=>[source.id, prepareOverlay(source)]));
  window.editorOverlays = entries;
  window.confirmationOpen = () => Boolean(confirmation);
  window.confirmEditorAction = options => {
    if (confirmation) return Promise.resolve(false);
    const surface = [...entries.values()].findLast(entry=>entry.open)?.id;
    return new Promise(resolve=>setConfirmation({variant:"destructive",...options,surface,resolve}));
  };
  const host = document.createElement("div");
  document.body.append(host);
  const history = entries.get("history-dialog"), crop = entries.get("crop-dialog"), access = entries.get("access-dialog");
  const root = createRoot(host);
  flushSync(()=>root.render(<FamilyAnimation>
    <EditorOverlay entry={history}>
      <EditorOverlay entry={crop}/>
      <Confirmation surface={history.id}/>
    </EditorOverlay>
    <EditorOverlay entry={access}><Confirmation surface={access.id}/></EditorOverlay>
    <Confirmation/>
  </FamilyAnimation>));
}
