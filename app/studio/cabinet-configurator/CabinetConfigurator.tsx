import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

type Wall = 'back' | 'left' | 'right';
type CabinetType = 'base' | 'wall' | 'tall';
type Face = 'shaker' | 'slab';
type View = 'plan' | 'split' | 'three';

type Cabinet = {
  id: string;
  type: CabinetType;
  wall: Wall;
  offset: number;
  width: number;
  depth: number;
  height: number;
  elevation?: number;
  face: Face;
};

type Opening = {
  id: string;
  kind: 'door' | 'window';
  wall: Wall;
  offset: number;
  width: number;
  height: number;
  sill?: number;
};

type Study = {
  room: {
    width: number;
    depth: number;
    height: number;
    floor: 'oak' | 'walnut' | 'concrete';
    walls: 'plaster' | 'white' | 'green';
  };
  openings: Opening[];
  cabinets: Cabinet[];
  selected: string | null;
  countertop: boolean;
  view: View;
};

const INCH = 0.0254;
const STORAGE_KEY = 'from-trees-cabinet-study-v1';
const makeId = () => Math.random().toString(36).slice(2, 9);

function initialStudy(): Study {
  return {
    room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
    openings: [
      {id: 'starter-door', kind: 'door', wall: 'back', offset: 18, width: 32, height: 80},
      {id: 'starter-window', kind: 'window', wall: 'right', offset: 28, width: 42, height: 38, sill: 42},
    ],
    cabinets: [
      {id: 'starter-base-30', type: 'base', wall: 'back', offset: 56, width: 30, depth: 24, height: 34.5, face: 'shaker'},
      {id: 'starter-base-24', type: 'base', wall: 'back', offset: 86, width: 24, depth: 24, height: 34.5, face: 'slab'},
      {id: 'starter-wall-30', type: 'wall', wall: 'back', offset: 56, width: 30, depth: 12, height: 30, elevation: 54, face: 'shaker'},
      {id: 'starter-tall-24', type: 'tall', wall: 'left', offset: 18, width: 24, depth: 24, height: 84, face: 'slab'},
    ],
    selected: null,
    countertop: true,
    view: 'split',
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function wallLength(study: Study, wall: Wall) {
  return wall === 'back' ? study.room.width : study.room.depth;
}

function problemIds(study: Study) {
  const problems = new Set<string>();
  for (const cabinet of study.cabinets) {
    if (cabinet.offset < 0 || cabinet.offset + cabinet.width > wallLength(study, cabinet.wall)) {
      problems.add(cabinet.id);
    }
    for (const opening of study.openings.filter((item) => item.wall === cabinet.wall)) {
      const horizontal = cabinet.offset < opening.offset + opening.width && cabinet.offset + cabinet.width > opening.offset;
      const vertical = cabinet.type !== 'wall' || (opening.kind === 'window' && (cabinet.elevation ?? 54) < (opening.sill ?? 0) + opening.height);
      if (horizontal && vertical) problems.add(cabinet.id);
    }
    for (const other of study.cabinets.filter((item) => item.id !== cabinet.id && item.wall === cabinet.wall)) {
      if (cabinet.type !== 'wall' && other.type !== 'wall' && cabinet.offset < other.offset + other.width && cabinet.offset + cabinet.width > other.offset) {
        problems.add(cabinet.id);
      }
    }
  }
  return problems;
}

function ThreeStudy({study, onSelect}: {study: Study; onSelect: (id: string) => void}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f2ec);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.02;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5b5546, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(-3, 5, 4);
    sun.castShadow = true;
    scene.add(sun);

    const material = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({color, roughness});
    const edgeBox = (width: number, height: number, depth: number, boxMaterial: THREE.Material) => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), boxMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({color: 0x252b26, transparent: true, opacity: 0.55})));
      return group;
    };

    const roomWidth = study.room.width * INCH;
    const roomDepth = study.room.depth * INCH;
    const roomHeight = study.room.height * INCH;
    const floorColors = {oak: 0xbca679, walnut: 0x75604c, concrete: 0xbab9b4};
    const wallColors = {plaster: 0xe9e3d7, white: 0xf5f4ef, green: 0x849184};
    const floor = edgeBox(roomWidth, 0.035, roomDepth, material(floorColors[study.room.floor]));
    floor.position.set(0, -0.02, 0);
    scene.add(floor);
    const wallMaterial = material(wallColors[study.room.walls]);
    const back = edgeBox(roomWidth, roomHeight, 0.035, wallMaterial);
    back.position.set(0, roomHeight / 2, -roomDepth / 2);
    scene.add(back);
    const left = edgeBox(0.035, roomHeight, roomDepth, wallMaterial);
    left.position.set(-roomWidth / 2, roomHeight / 2, 0);
    scene.add(left);

    const selectable: THREE.Object3D[] = [];
    const warningIds = problemIds(study);
    for (const cabinet of study.cabinets) {
      const width = cabinet.width * INCH;
      const depth = cabinet.depth * INCH;
      const height = cabinet.height * INCH;
      const elevation = cabinet.type === 'wall' ? (cabinet.elevation ?? 54) * INCH : 0;
      const body = edgeBox(width, height, depth, material(warningIds.has(cabinet.id) ? 0xb36855 : 0x9d7650));
      body.userData.id = cabinet.id;
      if (cabinet.wall === 'back') body.position.set(-roomWidth / 2 + (cabinet.offset + cabinet.width / 2) * INCH, elevation + height / 2, -roomDepth / 2 + depth / 2);
      if (cabinet.wall === 'left') {
        body.rotation.y = Math.PI / 2;
        body.position.set(-roomWidth / 2 + depth / 2, elevation + height / 2, -roomDepth / 2 + (cabinet.offset + cabinet.width / 2) * INCH);
      }
      if (cabinet.wall === 'right') {
        body.rotation.y = Math.PI / 2;
        body.position.set(roomWidth / 2 - depth / 2, elevation + height / 2, -roomDepth / 2 + (cabinet.offset + cabinet.width / 2) * INCH);
      }
      const front = edgeBox(width * 0.91, height * 0.89, 0.025, material(cabinet.face === 'slab' ? 0x76543b : 0x9d7650));
      front.position.set(0, 0, depth / 2 + 0.016);
      body.add(front);
      if (cabinet.face === 'shaker') {
        const inset = edgeBox(width * 0.7, height * 0.68, 0.012, material(0x8f6948));
        inset.position.z = 0.025;
        front.add(inset);
      }
      if (study.countertop && cabinet.type === 'base') {
        const top = edgeBox(width + 0.04, 0.04, depth + 0.04, material(0xd8d1c4, 0.45));
        top.position.y = height / 2 + 0.02;
        body.add(top);
      }
      scene.add(body);
      selectable.push(body);
      if (cabinet.id === study.selected) scene.add(new THREE.BoxHelper(body, 0xb57d45));
    }

    for (const opening of study.openings) {
      const width = opening.width * INCH;
      const height = opening.height * INCH;
      const y = (opening.kind === 'window' ? (opening.sill ?? 42) * INCH : 0) + height / 2;
      const object = edgeBox(width, height, 0.055, material(opening.kind === 'window' ? 0xa9c5c9 : 0x55483b, 0.35));
      object.userData.id = opening.id;
      if (opening.wall === 'back') object.position.set(-roomWidth / 2 + (opening.offset + opening.width / 2) * INCH, y, -roomDepth / 2 + 0.04);
      else {
        object.rotation.y = Math.PI / 2;
        object.position.set(opening.wall === 'left' ? -roomWidth / 2 + 0.04 : roomWidth / 2 - 0.04, y, -roomDepth / 2 + (opening.offset + opening.width / 2) * INCH);
      }
      scene.add(object);
      selectable.push(object);
    }

    const largest = Math.max(roomWidth, roomDepth);
    controls.target.set(0, roomHeight * 0.34, 0);
    camera.position.set(largest * 0.82, roomHeight * 0.82, largest * 0.95);
    controls.update();

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
      renderer.setSize(bounds.width, bounds.height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePick = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(selectable, true)[0];
      let current: THREE.Object3D | null | undefined = hit?.object;
      while (current && !current.userData.id) current = current.parent ?? undefined;
      if (current?.userData.id) selectRef.current(current.userData.id as string);
    };
    renderer.domElement.addEventListener('pointerdown', handlePick);

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePick);
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((item) => item.dispose());
        }
      });
      host.replaceChildren();
    };
  }, [study]);

  return <div className="cc-three-host" ref={hostRef} aria-label="Interactive 3D room study" />;
}

export function CabinetConfigurator() {
  const [study, setStudy] = useState<Study>(() => initialStudy());
  const [history, setHistory] = useState<Study[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const drag = useRef<{id: string; start: number; pointer: number} | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setStudy(JSON.parse(saved) as Study);
    } catch {
      // A fresh study remains available when storage is blocked or invalid.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(study));
  }, [hydrated, study]);

  const update = useCallback((change: (draft: Study) => void) => {
    setStudy((current) => {
      setHistory((items) => [...items.slice(-29), clone(current)]);
      const next = clone(current);
      change(next);
      return next;
    });
  }, []);

  const selected = [...study.cabinets, ...study.openings].find((item) => item.id === study.selected);
  const warnings = useMemo(() => problemIds(study), [study]);
  const pad = 62;
  const scale = Math.min((780 - pad * 2) / study.room.width, (560 - pad * 2) / study.room.depth);

  const planBox = (item: Cabinet | Opening) => {
    const depth = 'depth' in item ? item.depth : 5;
    if (item.wall === 'back') return {x: pad + item.offset * scale, y: pad, width: item.width * scale, height: depth * scale};
    if (item.wall === 'left') return {x: pad, y: pad + item.offset * scale, width: depth * scale, height: item.width * scale};
    return {x: pad + study.room.width * scale - depth * scale, y: pad + item.offset * scale, width: depth * scale, height: item.width * scale};
  };

  const addCabinet = (type: CabinetType) => update((draft) => {
    const cabinet: Cabinet = {id: makeId(), type, wall: 'back', offset: 42, width: type === 'tall' ? 24 : 30, depth: type === 'wall' ? 12 : 24, height: type === 'base' ? 34.5 : type === 'wall' ? 30 : 84, elevation: 54, face: 'shaker'};
    draft.cabinets.push(cabinet);
    draft.selected = cabinet.id;
  });

  const addOpening = (kind: Opening['kind']) => update((draft) => {
    const opening: Opening = {id: makeId(), kind, wall: 'back', offset: 18, width: kind === 'door' ? 32 : 42, height: kind === 'door' ? 80 : 38, sill: 42};
    draft.openings.push(opening);
    draft.selected = opening.id;
  });

  const updateSelected = (key: string, value: string | number) => update((draft) => {
    const item = [...draft.cabinets, ...draft.openings].find((entry) => entry.id === draft.selected) as unknown as Record<string, string | number> | undefined;
    if (item) item[key] = value;
  });

  const beginDrag = (event: React.PointerEvent<SVGGElement>, cabinet: Cabinet) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setHistory((items) => [...items.slice(-29), clone(study)]);
    setStudy((current) => ({...current, selected: cabinet.id}));
    drag.current = {id: cabinet.id, pointer: cabinet.wall === 'back' ? event.clientX : event.clientY, start: cabinet.offset};
  };

  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active) return;
    setStudy((current) => {
      const next = clone(current);
      const cabinet = next.cabinets.find((item) => item.id === active.id);
      if (!cabinet) return current;
      const pointer = cabinet.wall === 'back' ? event.clientX : event.clientY;
      const bounds = event.currentTarget.getBoundingClientRect();
      const screenScale = scale * (bounds.width / 780);
      cabinet.offset = Math.max(0, Math.min(wallLength(next, cabinet.wall) - cabinet.width, Math.round((active.start + (pointer - active.pointer) / screenScale) / 3) * 3));
      return next;
    });
  };

  return (
    <div className="cabinet-app">
      <header className="cc-topbar">
        <a className="cc-brand" href="/" aria-label="From Trees home"><span>from trees</span><small>cabinet study / prototype</small></a>
        <div className="cc-top-actions">
          <button type="button" onClick={() => setHistory((items) => {const previous = items.at(-1); if (previous) setStudy(previous); return items.slice(0, -1);})} disabled={!history.length}>Undo</button>
          <button type="button" onClick={() => {setHistory((items) => [...items, clone(study)]); setStudy(initialStudy());}}>Reset room</button>
          <span>Saved locally</span>
        </div>
      </header>
      <main className="cc-main">
        <aside className="cc-tools" aria-label="Design controls">
          <section><p className="cc-eyebrow">01 / Room</p><div className="cc-fields">
            {(['width', 'depth', 'height'] as const).map((key) => <label key={key}>{key === 'height' ? 'Wall height' : `Room ${key}`}<span><input type="number" min="72" max="360" value={study.room[key]} onChange={(event) => update((draft) => {draft.room[key] = Number(event.target.value);})} /> in</span></label>)}
          </div></section>
          <section><p className="cc-eyebrow">02 / Add anatomy</p><div className="cc-button-grid"><button type="button" onClick={() => addOpening('door')}>+ Door</button><button type="button" onClick={() => addOpening('window')}>+ Window</button></div></section>
          <section><p className="cc-eyebrow">03 / Add cabinetry</p><div className="cc-button-grid cc-three-buttons"><button type="button" onClick={() => addCabinet('base')}>+ Base</button><button type="button" onClick={() => addCabinet('wall')}>+ Wall</button><button type="button" onClick={() => addCabinet('tall')}>+ Tall</button></div></section>
          <section className="cc-selection"><p className="cc-eyebrow">Selected element</p>{selected ? <div className="cc-fields">
            <div className="cc-selected-heading"><strong>{'type' in selected ? `${selected.type} cabinet` : selected.kind}</strong><button type="button" onClick={() => update((draft) => {draft.cabinets = draft.cabinets.filter((item) => item.id !== draft.selected); draft.openings = draft.openings.filter((item) => item.id !== draft.selected); draft.selected = null;})}>Remove</button></div>
            <label>Wall<select value={selected.wall} onChange={(event) => updateSelected('wall', event.target.value)}><option>back</option><option>left</option><option>right</option></select></label>
            <label>Position<span><input type="number" value={selected.offset} onChange={(event) => updateSelected('offset', Number(event.target.value))} /> in</span></label>
            <label>Width<span><input type="number" value={selected.width} onChange={(event) => updateSelected('width', Number(event.target.value))} /> in</span></label>
            {'type' in selected ? <><label>Depth<span><input type="number" value={selected.depth} onChange={(event) => updateSelected('depth', Number(event.target.value))} /> in</span></label><label>Height<span><input type="number" value={selected.height} onChange={(event) => updateSelected('height', Number(event.target.value))} /> in</span></label>{selected.type === 'wall' ? <label>Bottom height<span><input type="number" value={selected.elevation ?? 54} onChange={(event) => updateSelected('elevation', Number(event.target.value))} /> in</span></label> : null}<label>Face style<select value={selected.face} onChange={(event) => updateSelected('face', event.target.value)}><option value="shaker">Shaker frame</option><option value="slab">Quiet slab</option></select></label></> : null}
          </div> : <p className="cc-muted">Select an element in plan or 3D.</p>}</section>
          <section><p className="cc-eyebrow">04 / Surfaces</p><div className="cc-fields"><label>Floor<select value={study.room.floor} onChange={(event) => update((draft) => {draft.room.floor = event.target.value as Study['room']['floor'];})}><option value="oak">Natural oak</option><option value="walnut">Walnut</option><option value="concrete">Honed concrete</option></select></label><label>Walls<select value={study.room.walls} onChange={(event) => update((draft) => {draft.room.walls = event.target.value as Study['room']['walls'];})}><option value="plaster">Warm plaster</option><option value="white">Gallery white</option><option value="green">Forest wash</option></select></label><label className="cc-check"><input type="checkbox" checked={study.countertop} onChange={(event) => update((draft) => {draft.countertop = event.target.checked;})} /> Continuous countertop study</label></div></section>
        </aside>
        <section className="cc-workspace">
          <div className="cc-tabs" role="tablist">{(['plan', 'split', 'three'] as View[]).map((view) => <button type="button" className={study.view === view ? 'active' : ''} onClick={() => setStudy((current) => ({...current, view}))} key={view}>{view === 'split' ? 'Plan + 3D' : view === 'three' ? '3D' : 'Plan'}</button>)}</div>
          <div className={`cc-canvas-grid cc-${study.view}`}>
            <div className="cc-panel cc-plan-panel"><div className="cc-panel-label"><span>Dimensioned plan</span><small>Drag cabinets along their wall</small></div><svg viewBox="0 0 780 560" role="img" aria-label="Dimensioned room plan" onPointerMove={moveDrag} onPointerUp={() => {drag.current = null;}}>
              <defs><pattern id="cc-paper" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#d8d4ca" strokeWidth=".35" /></pattern></defs>
              <rect className="cc-paper" x={pad} y={pad} width={study.room.width * scale} height={study.room.depth * scale} />
              <path className="cc-room-line" d={`M${pad} ${pad + study.room.depth * scale}V${pad}H${pad + study.room.width * scale}V${pad + study.room.depth * scale}`} />
              <g className="cc-dimensions"><path d={`M${pad} 32H${pad + study.room.width * scale}M${pad} 25V39M${pad + study.room.width * scale} 25V39`} /><text x={pad + study.room.width * scale / 2} y="25">{study.room.width}″</text><path d={`M32 ${pad}V${pad + study.room.depth * scale}M25 ${pad}H39M25 ${pad + study.room.depth * scale}H39`} /><text transform={`translate(22 ${pad + study.room.depth * scale / 2}) rotate(-90)`} textAnchor="middle">{study.room.depth}″</text></g>
              {study.openings.map((opening) => {const box = planBox(opening); return <g key={opening.id} className={`cc-opening ${study.selected === opening.id ? 'selected' : ''}`} onClick={() => setStudy((current) => ({...current, selected: opening.id}))}><rect {...box} /><text x={box.x + box.width / 2} y={box.y + (opening.wall === 'back' ? 20 : box.height / 2)}>{opening.kind}</text></g>;})}
              {study.cabinets.map((cabinet) => {const box = planBox(cabinet); return <g key={cabinet.id} className={`cc-cab cc-${cabinet.type} ${study.selected === cabinet.id ? 'selected' : ''} ${warnings.has(cabinet.id) ? 'problem' : ''}`} onPointerDown={(event) => beginDrag(event, cabinet)}><rect {...box} /><line x1={box.x} y1={box.y} x2={box.x + box.width} y2={box.y + box.height} /><line x1={box.x + box.width} y1={box.y} x2={box.x} y2={box.y + box.height} /><text x={box.x + box.width / 2} y={box.y + box.height / 2 + 4}>{cabinet.width}″</text></g>;})}
              <text className="cc-room-note" x={pad + study.room.width * scale - 8} y={pad + study.room.depth * scale - 12} textAnchor="end">{study.room.height}″ walls</text>
            </svg></div>
            <div className="cc-panel cc-three-panel"><div className="cc-panel-label"><span>Spatial study</span><small>Drag to orbit · scroll to zoom</small></div><ThreeStudy study={study} onSelect={(id) => setStudy((current) => ({...current, selected: id}))} /></div>
          </div>
          <footer className="cc-status"><span className={warnings.size ? 'warning' : ''}>{warnings.size ? `${warnings.size} cabinet${warnings.size > 1 ? 's' : ''} need attention` : `${study.cabinets.length} cabinets · clear fit`}</span><span>Concept only · dimensions require field verification</span></footer>
        </section>
      </main>
    </div>
  );
}
