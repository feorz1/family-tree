"use strict";

// A portrait frame covers the source at 1×. Offsets describe the available pan range.
function portraitGeometry(width, height, crop) {
  const side = Math.min(width, height);
  const w = 100 * width / side * crop.zoom;
  const h = 100 * height / side * crop.zoom;
  return {width:w, height:h, left:-(w-100)*crop.x, top:-(h-100)*crop.y};
}

function framePortrait(img, crop) {
  const draw = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const geometry = portraitGeometry(img.naturalWidth, img.naturalHeight, crop);
    img.style.position = "absolute";
    img.style.maxWidth = "none";
    img.style.objectFit = "fill";
    for (const key of ["width","height","left","top"]) img.style[key] = geometry[key] + "%";
  };
  if (img.complete) draw();
  else img.addEventListener("load", draw, {once:true});
}
