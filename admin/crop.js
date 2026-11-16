"use strict";

const cropDialog = $("#crop-dialog");
const cropFrame = $("#crop-frame");
const cropImage = $("#crop-image");
const defaultCrop = {x:.5, y:.28, zoom:1};
const cropForm = $("#crop-form");
const cropApply = $("#crop-apply");
const cropError = $("#crop-error");
let cropPhoto = null, crop = null, pan = null, cropReset = false, cropActions = null, cropSaving = false;

function openCrop(photo, node, actions = null) {
  if (cropDialog.open) return;
  cropPhoto = photo;
  crop = {...(photo.crop || defaultCrop)};
  cropReset = false;
  cropActions = actions;
  cropError.textContent = "";
  cropApply.textContent = actions ? "Сохранить кадр и принять" : "Применить кадр";
  $("#crop-caption").textContent = node.name;
  cropImage.src = "/preview/" + photo.src;
  cropDialog.showModal();
  drawCrop();
  $("#crop-zoom").focus();
}

function drawCrop() {
  if (!crop) return;
  $("#crop-zoom").value = Math.round(crop.zoom*100);
  $("#crop-zoom-label").value = Math.round(crop.zoom*100)+"%";
  $("#crop-x").value = Math.round(crop.x*100);
  $("#crop-y").value = Math.round(crop.y*100);
  if (cropImage.complete && cropImage.naturalWidth) {
    framePortrait(cropImage,crop);
    const geometry = portraitGeometry(cropImage.naturalWidth,cropImage.naturalHeight,crop);
    $("#crop-x").disabled = geometry.width <= 100.01;
    $("#crop-y").disabled = geometry.height <= 100.01;
  }
}

cropImage.addEventListener("load",drawCrop);
for (const coord of ["zoom","x","y"]) {
  $("#crop-"+coord).addEventListener("input", event => {
    crop[coord] = Number(event.target.value)/100;
    cropReset = false;
    drawCrop();
  });
}
cropFrame.addEventListener("pointerdown", event => {
  if (cropSaving || event.button !== 0 || !cropImage.naturalWidth || pan) return;
  event.preventDefault();
  cropFrame.setPointerCapture(event.pointerId);
  const geometry = portraitGeometry(cropImage.naturalWidth,cropImage.naturalHeight,crop);
  const size = cropFrame.clientWidth;
  pan = {id:event.pointerId,x:crop.x,y:crop.y,left:event.clientX,top:event.clientY,
    horizontal:(geometry.width-100)*size/100,vertical:(geometry.height-100)*size/100};
});
cropFrame.addEventListener("pointermove", event => {
  if (cropSaving || pan?.id !== event.pointerId) return;
  const clamp = n => Math.min(1,Math.max(0,n));
  if (pan.horizontal > 0) crop.x = clamp(pan.x-(event.clientX-pan.left)/pan.horizontal);
  if (pan.vertical > 0) crop.y = clamp(pan.y-(event.clientY-pan.top)/pan.vertical);
  cropReset = false;
  drawCrop();
});
for (const event of ["pointerup","pointercancel","lostpointercapture"]) {
  cropFrame.addEventListener(event,() => {pan = null;});
}
$("#crop-reset").addEventListener("click",() => {
  crop = {...defaultCrop};
  cropReset = true;
  drawCrop();
});
$("#crop-cancel").addEventListener("click",() => cropDialog.close());
function setPortraitCrop(photo, value) {
  if (value) photo.crop = value;
  else delete photo.crop;
}

cropForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (cropSaving) return;
  const value = cropReset ? null : {x:Number(crop.x.toFixed(4)), y:Number(crop.y.toFixed(4)), zoom:crop.zoom};
  const actions = cropActions;
  let result;
  if (actions) {
    cropSaving = true;
    cropError.textContent = "";
    cropForm.inert = true;
    $("#crop-cancel").disabled = true;
    cropApply.textContent = "Сохраняем…";
    try {
      result = await actions.save(value);
    } catch (error) {
      cropError.textContent = error.message;
      return;
    } finally {
      cropSaving = false;
      cropForm.inert = false;
      $("#crop-cancel").disabled = false;
      cropApply.textContent = "Сохранить кадр и принять";
      cropApply.focus();
    }
  } else {
    setPortraitCrop(cropPhoto, value);
    changed();
  }
  cropDialog.close();
  if (actions) await actions.afterSave(result);
});
cropDialog.addEventListener("cancel", event => {if (cropSaving) event.preventDefault();});
cropDialog.addEventListener("close", () => {crop = cropPhoto = pan = cropActions = null;});
