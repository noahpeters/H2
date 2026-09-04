import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

type V3 = { x: number; y: number; z: number };
type P2 = { x: number; y: number; depth: number };

const ROOM = { width: 168, length: 192, height: 108 };
const CAMERA = { position: { x: -154, y: 118, z: -176 }, target: { x: 0, y: 28, z: 0 }, fov: 48 };
const INK = "#82796c";
const PALE = "#d8cdbb";
const PAPER = "#fbf7ed";

function sub(a: V3, b: V3): V3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function dot(a: V3, b: V3) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a: V3, b: V3): V3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function unit(v: V3): V3 { const m = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / m, y: v.y / m, z: v.z / m }; }

function projector(width: number, height: number) {
  const forward = unit(sub(CAMERA.target, CAMERA.position));
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = unit(cross(right, forward));
  const focal = (height * .5) / Math.tan((CAMERA.fov * Math.PI / 180) / 2);
  return (point: V3): P2 | null => {
    const relative = sub(point, CAMERA.position);
    const depth = dot(relative, forward);
    if (depth <= 1) return null;
    return { x: width / 2 + dot(relative, right) * focal / depth, y: height / 2 - dot(relative, up) * focal / depth, depth };
  };
}

function rotate(point: V3, origin: V3, yaw: number): V3 {
  const c = Math.cos(yaw), s = Math.sin(yaw), x = point.x - origin.x, z = point.z - origin.z;
  return { x: origin.x + x * c - z * s, y: point.y, z: origin.z + x * s + z * c };
}

function SpatialCanvas({ length, tableWidth, showRoom }: { length: number; tableWidth: number; showRoom: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
    const project = projector(rect.width, rect.height);

    const line = (a: V3, b: V3, color = INK, alpha = 1, dash: number[] = []) => {
      const pa = project(a), pb = project(b); if (!pa || !pb) return;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1; ctx.setLineDash(dash); ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    };
    const polygon = (points: V3[], fill: string, stroke = INK, alpha = 1) => {
      const ps = points.map(project).filter(Boolean) as P2[]; if (ps.length !== points.length) return;
      ctx.beginPath(); ctx.moveTo(ps[0].x, ps[0].y); ps.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
    };
    const box = (x1:number, x2:number, y1:number, y2:number, z1:number, z2:number, fill="#f4eee2") => {
      polygon([{x:x1,y:y2,z:z1},{x:x2,y:y2,z:z1},{x:x2,y:y2,z:z2},{x:x1,y:y2,z:z2}], fill);
      polygon([{x:x1,y:y1,z:z1},{x:x2,y:y1,z:z1},{x:x2,y:y2,z:z1},{x:x1,y:y2,z:z1}], fill);
      polygon([{x:x2,y:y1,z:z1},{x:x2,y:y1,z:z2},{x:x2,y:y2,z:z2},{x:x2,y:y2,z:z1}], "#e8dfd1");
    };

    if (showRoom) {
      const x0=-ROOM.width/2, x1=ROOM.width/2, z0=-ROOM.length/2, z1=ROOM.length/2;
      for (let x=x0; x<=x1; x+=12) line({x,y:0,z:z0},{x,y:0,z:z1},PALE,.55,x % 24 ? [2,4] : []);
      for (let z=z0; z<=z1; z+=12) line({x:x0,y:0,z},{x:x1,y:0,z},PALE,.55,z % 24 ? [2,4] : []);
      [[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]].forEach(([a,b,c,d]) => line({x:a,y:0,z:b},{x:c,y:0,z:d},INK,.7));
      line({x:x1,y:0,z:z1},{x:x1,y:ROOM.height,z:z1},INK,.35); line({x:x0,y:0,z:z1},{x:x0,y:ROOM.height,z:z1},INK,.35);
      line({x:x0,y:ROOM.height,z:z1},{x:x1,y:ROOM.height,z:z1},INK,.35);
    }

    const topY=30, thick=1.5, halfL=length/2, halfW=tableWidth/2;
    const count = length <= 84 ? 2 : length <= 102 ? 3 : 4;
    const chairOffset = 13, seatY=18, backY=38;
    const chairs: {p:V3;yaw:number;layer:"far"|"near"}[] = [];
    const usable=length-30;
    for(let i=0;i<count;i++) {
      const x=-usable/2+i*(usable/(count-1));
      chairs.push({p:{x,y:0,z:-halfW-chairOffset},yaw:Math.PI,layer:"near"});
      chairs.push({p:{x,y:0,z:halfW+chairOffset},yaw:0,layer:"far"});
    }
    chairs.push({p:{x:-halfL-chairOffset,y:0,z:0},yaw:Math.PI/2,layer:"near"});
    chairs.push({p:{x:halfL+chairOffset,y:0,z:0},yaw:-Math.PI/2,layer:"far"});

    const drawChair=(origin:V3,yaw:number) => {
      const pt=(x:number,y:number,z:number)=>rotate({x:origin.x+x,y,z:origin.z+z},origin,yaw);
      const leg=(x:number,z:number)=>line(pt(x,0,z),pt(x,seatY,z),INK,.85);
      leg(-7,-6);leg(7,-6);leg(-7,6);leg(7,6);
      polygon([pt(-8,seatY,-7),pt(8,seatY,-7),pt(8,seatY,7),pt(-8,seatY,7)],"#f6efe2",INK,.92);
      line(pt(-7,seatY,6),pt(-7,backY,7),INK,.9); line(pt(7,seatY,6),pt(7,backY,7),INK,.9);
      for(let x=-5;x<=5;x+=2.5) line(pt(x,seatY+2,6.5),pt(x,backY-2,7),INK,.62);
      line(pt(-7,backY,7),pt(7,backY,7),INK,.95);
    };
    const drawLayer=(layer:"far"|"near") => chairs
      .filter(c=>c.layer===layer)
      .sort((a,b)=>{
        const pa=project(a.p),pb=project(b.p); return (pb?.depth??0)-(pa?.depth??0);
      })
      .forEach(c=>drawChair(c.p,c.yaw));

    // The canvas follows the same physical compositing order as the finished
    // configurator: chairs beyond the table, the opaque table, then chairs on
    // the camera side. Open chair spaces remain naturally transparent.
    drawLayer("far");
    box(-halfL, halfL, topY-thick, topY, -halfW, halfW, "#f7f1e5");
    const baseInset=Math.max(13, length*.18);
    box(-halfL+baseInset,-halfL+baseInset+3,0,topY-thick,-halfW+4,halfW-4,"#eee5d7");
    box(halfL-baseInset-3,halfL-baseInset,0,topY-thick,-halfW+4,halfW-4,"#eee5d7");
    box(-halfL+baseInset,halfL-baseInset,0,3,-halfW+6,halfW-6,"#eee5d7");
    drawLayer("near");

    ctx.fillStyle=INK; ctx.font="11px 'Courier New', monospace";
    ctx.fillText(`${ROOM.width/12}′ W × ${ROOM.length/12}′ L × ${ROOM.height/12}′ H`,18,24);
    ctx.fillText(`CAMERA 38mm · 48° FOV`,18,41);
    ctx.fillText(`TABLE ${length}″ × ${tableWidth}″ × 30″`,18,58);
  }, [length, tableWidth, showRoom]);

  return <canvas ref={ref} className="spatial-canvas" aria-label={`Perspective study of a ${length} by ${tableWidth} inch table in a dimensioned room`}/>;
}

export default function GeometryStudy() {
  const [length,setLength]=useState(72); const [width,setWidth]=useState(36); const [showRoom,setShowRoom]=useState(true);
  return <main className="geometry-page">
    <header className="config-header"><Link className="brand" to="/"><span>from trees</span></Link><Link to="/configurator">Back to configurator</Link></header>
    <section className="geometry-intro"><div><p className="eyebrow">Spatial calibration</p><h1>A known<br/><em>room.</em></h1></div><p>This study establishes one physical world, one camera, and one projection. Tables and chairs are dimensioned objects—not images positioned by eye.</p></section>
    <section className="geometry-workbench">
      <div className="geometry-board"><div className="sketch-label"><span>Perspective construction</span><span>One-foot floor grid</span></div><SpatialCanvas length={length} tableWidth={width} showRoom={showRoom}/><div className="sketch-caption"><span>Room 14′ × 16′ × 9′</span><span>Drawing study · dimensions are authoritative</span></div></div>
      <aside className="geometry-controls"><p className="eyebrow">Calibration controls</p><h2>Physical size</h2><label>Table length <strong>{length}″</strong><input type="range" min="72" max="120" step="6" value={length} onChange={e=>setLength(Number(e.target.value))}/></label><div className="choice-row">{[36,40,42,44].map(v=><button className={width===v?"active":""} onClick={()=>setWidth(v)} key={v}>{v}″ wide</button>)}</div><label className="geometry-check"><input type="checkbox" checked={showRoom} onChange={e=>setShowRoom(e.target.checked)}/> Show bounded room and grid</label><dl><div><dt>Camera</dt><dd>Fixed corner view</dd></div><div><dt>Lens</dt><dd>38 mm equivalent</dd></div><div><dt>Table height</dt><dd>30 inches</dd></div><div><dt>Chair seat</dt><dd>18 inches</dd></div></dl><p className="fine-print">Next: use the approved drawing assets as textures tied to these projected planes and anchors.</p></aside>
    </section>
  </main>;
}
