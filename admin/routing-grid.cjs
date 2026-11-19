const G=require('./diagram-geometry.cjs');
const round=v=>Math.round(v*1e6)/1e6;
// A compressed visibility grid: coordinates follow obstacles and ports, rather
// than a fixed pixel raster. Occupied runs forbid shared stretches, while
// perpendicular crossings remain possible in a non-planar family graph.
function createGrid(boxes,points,paths) {
  const xs=new Set([12]),ys=new Set([12]);
  const add=([x,y])=>{for(const d of [-12,0,12]){if(x+d>=12&&x+d<=99988)xs.add(round(x+d));if(y+d>=12&&y+d<=99988)ys.add(round(y+d));}};
  for(const b of boxes){add([b[0],b[1]]);add([b[2],b[3]]);}
  points.forEach(add);paths.flat().forEach(add);
  xs.add(round(Math.min(99988,Math.max(...xs)+48)));ys.add(round(Math.min(99988,Math.max(...ys)+48)));
  const X=[...xs].sort((a,b)=>a-b),Y=[...ys].sort((a,b)=>a-b),W=X.length,H=Y.length;
  const xi=new Map(X.map((v,i)=>[v,i])),yi=new Map(Y.map((v,i)=>[v,i]));
  const h=new Uint8Array(W*H),v=new Uint8Array(W*H),ho=new Uint8Array(W*H),vo=new Uint8Array(W*H);
  for(const b of boxes){const l=xi.get(round(b[0])),r=xi.get(round(b[2])),t=yi.get(round(b[1])),bottom=yi.get(round(b[3]));
    for(let y=t;y<=bottom;y++)for(let x=l;x<=r;x++){const i=y*W+x;if(y>t&&y<bottom&&x<r)h[i]=1;if(x>l&&x<r&&y<bottom)v[i]=1;}
  }
  function occupy(path){for(let j=1;j<path.length;j++){
    const a=path[j-1],b=path[j],x1=xi.get(round(a[0])),x2=xi.get(round(b[0])),y1=yi.get(round(a[1])),y2=yi.get(round(b[1]));
    if(y1===y2)for(let x=Math.min(x1,x2);x<Math.max(x1,x2);x++)ho[y1*W+x]=1;
    if(x1===x2)for(let y=Math.min(y1,y2);y<Math.max(y1,y2);y++)vo[y*W+x1]=1;
  }}
  paths.forEach(occupy);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  function find(start,end,startDir=null,endDir=null,avoidStart=null,avoidEnd=null) {
    const sx=xi.get(round(start[0])),sy=yi.get(round(start[1])),tx=xi.get(round(end[0])),ty=yi.get(round(end[1]));
    if([sx,sy,tx,ty].some(x=>x===undefined))return null;
    if(sx===tx&&sy===ty)return [[...start],[...end]];
    const S=sy*W+sx,T=ty*W+tx,size=W*H*5,cost=new Float64Array(size);cost.fill(Infinity);
    const previous=new Int32Array(size);previous.fill(-1);const heap=[];
    const push=(state,g,f)=>{let i=heap.length;heap.push(null);while(i){const j=(i-1)>>1;if(heap[j].f<=f)break;heap[i]=heap[j];i=j;}heap[i]={state,g,f};};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){const l=i*2+1,r=l+1,j=r<heap.length&&heap[r].f<heap[l].f?r:l;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    cost[S*5+4]=0;push(S*5+4,0,0);let final=-1;
    while(heap.length){const cur=pop();if(cur.g!==cost[cur.state])continue;const cell=Math.floor(cur.state/5),old=cur.state%5,x=cell%W,y=Math.floor(cell/W);
      if(cell===T&&(endDir===null||old===endDir)&&(avoidEnd===null||old!==avoidEnd)){final=cur.state;break;}
      for(let d=0;d<4;d++){
        if(old===4&&(startDir!==null&&d!==startDir||avoidStart!==null&&d===avoidStart))continue;
        if(old!==4&&d===(old^1))continue;
        const [dx,dy]=dirs[d],nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;
        const next=ny*W+nx;
        if(next===S||next===T&&(endDir!==null&&d!==endDir||avoidEnd!==null&&d===avoidEnd))continue;
        const edge=d<2?y*W+Math.min(x,nx):Math.min(y,ny)*W+x;
        if((d<2?h[edge]||ho[edge]:v[edge]||vo[edge]))continue;
        const crossing=d<2?vo[next]||(ny>0&&vo[next-W]):ho[next]||(nx>0&&ho[next-1]);
        const g=cur.g+Math.abs(X[nx]-X[x])+Math.abs(Y[ny]-Y[y])+(old!==4&&old!==d?90:0)+(crossing?180:0),state=next*5+d;
        if(g>=cost[state])continue;cost[state]=g;previous[state]=cur.state;push(state,g,g+Math.abs(X[nx]-X[tx])+Math.abs(Y[ny]-Y[ty]));
      }
    }
    if(final<0)return null;const result=[];for(let state=final;state!==-1;state=previous[state]){const c=Math.floor(state/5);result.push([X[c%W],Y[Math.floor(c/W)]]);}return G.normalize(result.reverse());
  }
  return {find,occupy};
}
module.exports={createGrid};
