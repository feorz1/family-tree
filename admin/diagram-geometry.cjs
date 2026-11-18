// All coordinates are canvas coordinates, independent of browser zoom and scrolling.
const copy = points => points.map(point => [...point]);
const same = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1]) < .01;
const isOrthogonal = points => points.slice(1).every((p,i)=>Math.abs(p[0]-points[i][0])<1e-6||Math.abs(p[1]-points[i][1])<1e-6);
function attachment(rect, [x,y]) {
  const candidates = [
    ['left',Math.abs(x-rect.x),(y-rect.y)/rect.size],
    ['right',Math.abs(x-rect.x-rect.size),(y-rect.y)/rect.size],
    ['top',Math.abs(y-rect.y),(x-rect.x)/rect.size],
    ['bottom',Math.abs(y-rect.y-rect.size),(x-rect.x)/rect.size]
  ].sort((a,b)=>a[1]-b[1]);
  return {side:candidates[0][0],fraction:Math.max(0,Math.min(1,candidates[0][2]))};
}
function project(rect, point) {
  const anchor=attachment(rect,point),d=rect.size*anchor.fraction;
  if(anchor.side==='left')return [rect.x,rect.y+d];
  if(anchor.side==='right')return [rect.x+rect.size,rect.y+d];
  return [rect.x+d,anchor.side==='top'?rect.y:rect.y+rect.size];
}
function orthogonal(points) {
  const result = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && previous[0] !== point[0] && previous[1] !== point[1]) result.push([point[0],previous[1]]);
    if (!previous || !same(previous,point)) result.push([...point]);
  }
  return result.length > 1 ? result : [result[0], [...result[0]]];
}
function moveVertex(points, index, next, squared = true, pinned = {start:true,end:true}) {
  const result = copy(points), old = points[index];
  result[index] = [...next];
  if (!squared) return result;
  // Move adjacent bends with the handle, while preserving attached endpoints.
  for (const adjacent of [index-1,index+1]) {
    if (adjacent < 0 || adjacent >= points.length || (adjacent===0&&pinned.start) || (adjacent===points.length-1&&pinned.end)) continue;
    if (points[adjacent][0] === old[0]) result[adjacent][0] = next[0];
    else if (points[adjacent][1] === old[1]) result[adjacent][1] = next[1];
  }
  return orthogonal(result);
}
function moveEnds(points, start, end, squared = true) {
  let result = copy(points);
  const ds = start.map((v,i)=>v-points[0][i]), de = end.map((v,i)=>v-points.at(-1)[i]);
  if (same(ds,de)) return result.map(p=>p.map((v,i)=>v+ds[i]));
  if (!squared) {result[0]=[...start];result[result.length-1]=[...end];return result;}
  if (points.length===2) {
    if(start[0]===end[0]||start[1]===end[1])return [[...start],[...end]];
    // Keep the original tangent at both ends, rather than growing a bend
    // along the parents' union or across the edge of an attached portrait.
    const axis=points[0][0]===points[1][0]?1:0,mid=(start[axis]+end[axis])/2;
    const a=[...start],b=[...end];a[axis]=mid;b[axis]=mid;
    return [[...start],a,b,[...end]];
  }
  result = moveVertex(result,0,start,squared);
  return moveVertex(result,result.length-1,end,squared);
}
function constrain(delta, shift) {
  return !shift ? delta : Math.abs(delta[0]) >= Math.abs(delta[1]) ? [delta[0],0] : [0,delta[1]];
}
function pathAnchor(points, point) {
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  const total=lengths.reduce((a,b)=>a+b,0);
  let travelled=0,best={distance:Infinity,point:[...points[0]],fraction:0};
  for(let i=0;i<lengths.length;i++){
    const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(lengths[i]**2||1)));
    const candidate=[a[0]+t*dx,a[1]+t*dy],distance=Math.hypot(point[0]-candidate[0],point[1]-candidate[1]);
    if(distance<best.distance)best={point:candidate,distance,fraction:total?(travelled+t*lengths[i])/total:0};
    travelled+=lengths[i];
  }
  return best;
}
function pointOnPath(points, fraction) {
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  let remaining=lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,fraction));
  for(let i=0;i<lengths.length;i++){
    if(remaining<=lengths[i])return points[i].map((v,axis)=>v+(points[i+1][axis]-v)*(remaining/(lengths[i]||1)));
    remaining-=lengths[i];
  }
  return [...points.at(-1)];
}
function midpoint(points) {
  const lengths = points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  let remaining = lengths.reduce((a,b)=>a+b,0)/2;
  for (let i=0;i<lengths.length;i++) {
    if (remaining <= lengths[i]) return points[i].map((v,axis)=>v+(points[i+1][axis]-v)*(remaining/(lengths[i]||1)));
    remaining -= lengths[i];
  }
  return [...points.at(-1)];
}
module.exports = {copy,same,attachment,project,orthogonal,moveVertex,moveEnds,constrain,midpoint,pathAnchor,pointOnPath,isOrthogonal};
