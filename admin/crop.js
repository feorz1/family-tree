"use strict";

const cropDialog = $("#crop-dialog");
const cropFrame = $("#crop-frame");
const cropImage = $("#crop-image");
const defaultCrop = {x:.5, y:.28, zoom:1};
let cropPhoto = null, crop = null, pan = null, cropReset = false;

function openCrop(photo, node) {
  cropPhoto = photo;
  crop = {...(photo.crop || defaultCrop)};
  cropReset = false;
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
  if (event.button !== 0 || !cropImage.naturalWidth || pan) return;
  event.preventDefault();
  cropFrame.setPointerCapture(event.pointerId);
  const geometry = portraitGeometry(cropImage.naturalWidth,cropImage.naturalHeight,crop);
  const size = cropFrame.clientWidth;
  pan = {id:event.pointerId,x:crop.x,y:crop.y,left:event.clientX,top:event.clientY,
    horizontal:(geometry.width-100)*size/100,vertical:(geometry.height-100)*size/100};
});
cropFrame.addEventListener("pointermove", event => {
  if (pan?.id !== event.pointerId) return;
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
$("#crop-form").addEventListener("submit",event => {
  event.preventDefault();
  if (cropReset) delete cropPhoto.crop;
  else cropPhoto.crop = {x:Number(crop.x.toFixed(4)),y:Number(crop.y.toFixed(4)),zoom:crop.zoom};
  changed();
  cropDialog.close();
});
cropDialog.addEventListener("close",() => {crop = cropPhoto = pan = null;});
