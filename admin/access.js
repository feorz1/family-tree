"use strict";
const accessDialog = editorOverlays.get("access-dialog");
const accessError = $("#access-error");
const inviteForm = $("#invite-form");
const accountStates = {pending:"Ждёт активации",active:"Есть доступ",revoked:"Доступ отозван",expired:"Приглашение истекло"};

async function showAccounts() {
  const result = await api("accounts");
  $("#account-items").replaceChildren(...result.accounts.map(account => {
    const row = element("div","",{class:"account-item"});
    const identity = element("div");
    identity.append(element("strong",account.name),element("p",account.username+" · "+accountStates[account.state]));
    row.append(identity);
    if (["pending","active"].includes(account.state)) {
      const revoke = element("button","Отозвать",{type:"button","data-variant":"destructive","aria-label":"Отозвать доступ у "+account.name});
      revoke.addEventListener("click", async () => {
        if (!await confirmEditorAction({title:"Отозвать доступ у "+account.name+"?",action:"Отозвать доступ",trigger:revoke})) return;
        revoke.disabled = true;
        accessError.textContent = "";
        try {
          await api("revoke",{username:account.username});
          $("#invite-result").hidden = true;
          await showAccounts();
          inviteForm.elements.displayName.focus();
        } catch (error) {
          accessError.textContent = error.message;
          revoke.disabled = false;
        }
      });
      row.append(controlHost(revoke));
    }
    return row;
  }));
  $("#account-items").hidden = result.accounts.length === 0;
  inviteForm.hidden = !result.canInvite;
  if (!result.canInvite) accessError.textContent = "Внешний адрес редактора ещё не подключён.";
}

$("#access").addEventListener("click", async event => {
  accessError.textContent = "";
  $("#invite-result").hidden = true;
  $("#invite-link").value = "";
  accessDialog.show(event.currentTarget);
  try {await showAccounts();}
  catch (error) {accessError.textContent = error.message;}
});

inviteForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = inviteForm.querySelector("button");
  button.disabled = true;
  accessError.textContent = "";
  try {
    const result = await api("invite",Object.fromEntries(new FormData(inviteForm)));
    $("#invite-link").value = result.link;
    $("#invite-result").hidden = false;
    $("#copy-status").textContent = "";
    inviteForm.reset();
    await showAccounts();
    $("#copy-invite").focus();
  } catch (error) {accessError.textContent = error.message;}
  finally {button.disabled = false;}
});

$("#copy-invite").addEventListener("click", async () => {
  const field = $("#invite-link");
  try {
    await navigator.clipboard.writeText(field.value);
    $("#copy-status").textContent = "Ссылка скопирована.";
  } catch {
    field.focus();
    field.select();
    $("#copy-status").textContent = "Скопируй выделенную ссылку.";
  }
});

$("#logout").addEventListener("click", async event => {
  if (localDirty && !await confirmEditorAction({
    title:"Выйти из редактора?",description:"Несохранённые правки в этом окне будут потеряны.",
    action:"Выйти",trigger:event.currentTarget
  })) return;
  try {
    await api("logout",{});
    localDirty = false;
    location.replace("/");
  } catch (error) {status(error.message,true);}
});
