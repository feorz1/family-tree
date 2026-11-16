"use strict";
const fragment = new URLSearchParams(location.hash.slice(1));
const invitation = fragment.get("invite");
const login = document.querySelector("#login");
const activate = document.querySelector("#activate");
if (invitation) {
  login.hidden = true;
  activate.hidden = false;
  activate.elements.username.value = fragment.get("login") || "";
  document.title = "Приглашение в редактор родословной";
  document.querySelector("#auth-title").textContent = "Доступ к родословной";
  document.querySelector("#auth-description").textContent = "Задай пароль для своей учётной записи. По приглашению ты получишь доступ к общему черновику.";
}
for (const form of [login,activate]) form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button"), error = document.querySelector("#auth-error");
  button.disabled = true;
  error.textContent = "";
  try {
    const body = Object.fromEntries(new FormData(form));
    if (form === activate) body.token = invitation;
    const response = await fetch(form === activate ? "/api/activate" : "/api/login", {
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    location.replace("/");
  } catch (e) {
    error.textContent = e.message || "Не удалось войти. Попробуй ещё раз.";
  } finally {
    button.disabled = false;
  }
});
