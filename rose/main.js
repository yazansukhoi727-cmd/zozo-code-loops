import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const W = 1080, H = 1920, DUR = 6;
const EQ = [
  'x in [0,1]   th in [-2pi, 15pi]',
  'phi = (pi/2) * exp(-th / 8pi)',
  'X = 1 - 0.5*(1.25*(1 - mod(3.6th,2pi)/pi)^2 - 0.25)^2',
  'y = 1.95653 * x^2 * (1.27689x - 1)^2 * sin(phi)',
  'r = X * (x*sin(phi) + y*cos(phi))',
  'P = ( r*sin(th), r*cos(th), X*(x*cos(phi) - y*sin(phi)) )',
].join('\n').replace(/th/g, 'θ').replace(/phi/g, 'φ').replace(/pi/g, 'π');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const mod = (a, b) => a - b * Math.floor(a / b);
// deterministic PRNG
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const BG = new THREE.Color('#05070d');
const scene = new THREE.Scene(); scene.background = BG;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
camera.position.set(0, 0, 7.2);

// ---------- Nylander rose surface ----------
const NX = 36, NT = 900;
const TH0 = -2 * Math.PI, TH1 = 15 * Math.PI;
function rosePt(x, th) {
  const phi = (Math.PI / 2) * Math.exp(-th / (8 * Math.PI));
  const q = 1 - mod(3.6 * th, 2 * Math.PI) / Math.PI;
  const X = 1 - 0.5 * Math.pow(1.25 * q * q - 0.25, 2);
  const y = 1.95653 * x * x * Math.pow(1.27689 * x - 1, 2) * Math.sin(phi);
  const r = X * (x * Math.sin(phi) + y * Math.cos(phi));
  return [r * Math.sin(th), r * Math.cos(th), X * (x * Math.cos(phi) - y * Math.sin(phi))];
}
// rows k=0 -> theta=15pi (bud centre) ... k=NT-1 -> theta=-2pi (outer petals)
const NV = NT * (NX + 1);
const pos = new Float32Array(NV * 3), aX = new Float32Array(NV), aK = new Float32Array(NV);
for (let k = 0; k < NT; k++) {
  const th = TH1 + (TH0 - TH1) * (k / (NT - 1));
  for (let j = 0; j <= NX; j++) {
    const x = j / NX, p = rosePt(x, th), v = k * (NX + 1) + j;
    pos.set(p, v * 3); aX[v] = x; aK[v] = k / (NT - 1);
  }
}
// centre geometry on its bounding-box centre
{
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < NV; i++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[i * 3 + a]); mx[a] = Math.max(mx[a], pos[i * 3 + a]); }
  const c = mn.map((m, a) => (m + mx[a]) / 2);
  for (let i = 0; i < NV; i++) for (let a = 0; a < 3; a++) pos[i * 3 + a] -= c[a];
}
const idx = [];
for (let k = 0; k < NT - 1; k++) for (let j = 0; j < NX; j++) {
  const a = k * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1;
  idx.push(a, c, b, b, c, d);
}
const surf = new THREE.BufferGeometry();
surf.setAttribute('position', new THREE.BufferAttribute(pos, 3));
surf.setAttribute('aX', new THREE.BufferAttribute(aX, 1));
surf.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
surf.setIndex(idx); surf.computeVertexNormals();
const TRI_TOTAL = idx.length;

// line geometry ordered centre -> outward
const lp = [];
const ring = 6, colStep = 4;
for (let k = 0; k < NT; k++) {
  if (k % ring === 0) for (let j = 0; j < NX; j++) {
    const a = k * (NX + 1) + j; lp.push(a, a + 1);
  }
  if (k < NT - 1) for (let j = 0; j <= NX; j += colStep) {
    const a = k * (NX + 1) + j; lp.push(a, a + NX + 1);
  }
}
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
lineGeo.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
lineGeo.setIndex(lp);
const LINE_TOTAL = lp.length;

// ---------- materials ----------
const ICE = new THREE.Color('#a8e6ff');
const lineMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uOp: { value: 1 }, uCol: { value: ICE } },
  vertexShader: `attribute float aK; varying float vK; void main(){ vK=aK; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uOp; uniform vec3 uCol; varying float vK;
    void main(){ gl_FragColor=vec4(uCol*(0.30+0.35*vK),uOp*0.55); }`,
});
const fillMat = new THREE.ShaderMaterial({
  transparent: true, side: THREE.DoubleSide, depthWrite: true,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  uniforms: { uFill: { value: 0 }, uT: { value: 0 } },
  vertexShader: `attribute float aX; attribute float aK; varying vec3 vN; varying vec3 vW; varying float vX; varying float vK;
    void main(){ vX=aX; vK=aK; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform float uFill; uniform float uT; varying vec3 vN; varying vec3 vW; varying float vX; varying float vK;
    vec3 ICEc=vec3(0.66,0.90,1.0), PINK=vec3(1.0,0.80,0.90), LIL=vec3(0.74,0.62,1.0);
    vec3 pal(float f){ f=fract(f)*3.; vec3 a=f<1.?ICEc:(f<2.?PINK:LIL); vec3 b=f<1.?PINK:(f<2.?LIL:ICEc);
      return mix(a,b,smoothstep(0.,1.,fract(f))); }
    void main(){
      vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
      vec3 V=normalize(cameraPosition-vW);
      float ndv=clamp(dot(N,V),0.,1.);
      float fres=pow(1.-ndv,2.2);
      // thin-film phase: view angle + radial position + slow time drift
      float ph=ndv*0.9+vK*0.55+vX*0.25+uT*0.12;
      vec3 film=pal(ph);
      vec3 L=normalize(vec3(-0.4,0.7,0.6));
      float dif=0.35+0.65*clamp(dot(N,L)*0.5+0.5,0.,1.);
      float ao=mix(0.42,1.0,smoothstep(0.0,0.55,vX))*mix(0.6,1.0,smoothstep(0.0,0.4,vK));
      vec3 pearl=mix(vec3(0.95,0.93,1.0),film,0.8);
      vec3 col=pearl*dif*ao*0.62+film*fres*0.55;
      vec3 H=normalize(L+V); col+=pow(clamp(dot(N,H),0.,1.),48.)*0.3;
      gl_FragColor=vec4(col,uFill);
    }`,
});

const tilt = new THREE.Group(), spin = new THREE.Group();
tilt.add(spin); scene.add(tilt);
tilt.rotation.x = -0.62;           // look down into the bloom
tilt.position.y = 0.0; tilt.scale.setScalar(0.88);
const fillMesh = new THREE.Mesh(surf, fillMat); fillMesh.renderOrder = 1;
const lines = new THREE.LineSegments(lineGeo, lineMat); lines.renderOrder = 2;
spin.add(fillMesh, lines);

// ---------- dissolve particles ----------
const NP = 14000, R = rng(7);
const pPos = new Float32Array(NP * 3), pR = new Float32Array(NP * 4);
for (let i = 0; i < NP; i++) {
  const v = Math.floor(R() * NV);
  pPos.set([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], i * 3);
  pR.set([R(), R(), R(), R()], i * 4);
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('aR', new THREE.BufferAttribute(pR, 4));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uS: { value: 0 } },
  vertexShader: `uniform float uS; attribute vec4 aR; varying vec3 vC; varying float vA;
    void main(){
      float e1=smoothstep(0.,0.5,uS);
      float e2=smoothstep(0.50+0.12*aR.x,1.0,uS);
      vec3 d=normalize(position+1e-4)*0.9+(aR.xyz-0.5)*1.8;
      vec3 p=position+d*e1*(0.35+0.65*aR.w);
      p+=vec3(sin(uS*9.+aR.x*30.),cos(uS*8.+aR.y*30.),sin(uS*7.+aR.z*30.))*0.04*e1*(1.-e2);
      p=mix(p,vec3(0.),e2*e2*(3.-2.*e2));
      vec4 mv=modelViewMatrix*vec4(p,1.);
      gl_Position=projectionMatrix*mv;
      gl_PointSize=(2.4+2.4*aR.w)*(1.+2.*e2*(1.-e2))*(7.2/-mv.z)*1.4;
      float fin=smoothstep(0.,0.06,uS), fout=1.-smoothstep(0.80,0.95,uS);
      vA=fin*fout*(0.45-0.3*e2);
      vC=mix(vec3(0.66,0.90,1.0),vec3(1.0,0.80,0.92),aR.z);
    }`,
  fragmentShader: `varying vec3 vC; varying float vA;
    void main(){ vec2 c=gl_PointCoord-.5; float r=length(c); if(r>.5) discard;
      float a=smoothstep(.5,0.,r); gl_FragColor=vec4(vC,a*a*vA); }`,
});
const pts = new THREE.Points(pGeo, pMat); pts.frustumCulled = false; spin.add(pts);

// ---------- ambient dust (loops exactly over 6 s) ----------
const ND = 260, R2 = rng(99);
const dPos = new Float32Array(ND * 3), dR = new Float32Array(ND * 3);
for (let i = 0; i < ND; i++) {
  dPos.set([(R2() - .5) * 2.6, R2(), (R2() - .5) * 3], i * 3);
  dR.set([R2(), R2(), R2()], i * 3);
}
const dGeo = new THREE.BufferGeometry();
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
dGeo.setAttribute('aR', new THREE.BufferAttribute(dR, 3));
const dMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uP: { value: 0 } },
  vertexShader: `uniform float uP; attribute vec3 aR; varying float vA;
    void main(){
      float lap=1.+floor(aR.x*2.);               // 1 or 2 full wraps per loop
      float y=fract(position.y+uP*lap)*4.2-2.1;
      float x=position.x+sin(6.2831853*(uP*floor(1.+aR.y*2.)+aR.z))*0.08;
      vec4 mv=modelViewMatrix*vec4(x,y,position.z,1.);
      gl_Position=projectionMatrix*mv;
      gl_PointSize=(1.6+2.4*aR.z)*(7.2/-mv.z)*1.2;
      vA=0.10+0.22*aR.y;
    }`,
  fragmentShader: `varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float r=length(c); if(r>.5) discard;
    gl_FragColor=vec4(vec3(0.55,0.75,0.95),smoothstep(.5,0.,r)*vA); }`,
});
const dust = new THREE.Points(dGeo, dMat); dust.frustumCulled = false; scene.add(dust);

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.5, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const eqEl = document.getElementById('eq');

// ---------- deterministic timeline ----------
window.renderAt = function (t) {
  t = mod(t, DUR);
  // equation: types 0-1s, holds, fades 5-6s
  const n = Math.floor(clamp(t / 0.95) * EQ.length);
  eqEl.textContent = EQ.slice(0, n) + (n < EQ.length && n > 0 ? '▏' : '');
  eqEl.style.opacity = t < 5 ? 1 : Math.max(0, 1 - (t - 5)).toFixed(4);

  // rose
  spin.rotation.z = 0.6 + t * 0.55;
  const grow = easeIO(clamp((t - 1) / 2.5));
  lines.visible = t >= 1 && t < 5.5;
  lineGeo.setDrawRange(0, Math.floor(grow * LINE_TOTAL / 2) * 2);
  const fillP = easeOut(clamp((t - 3.5) / 1.0));
  const fillA = sstep(3.5, 4.2, t);
  const dis = clamp(t - 5);
  const fade = 1 - sstep(0.0, 0.4, dis);
  fillMesh.visible = t >= 3.5 && fade > 0;
  surf.setDrawRange(0, Math.floor(fillP * TRI_TOTAL / 3) * 3);
  fillMat.uniforms.uFill.value = fillA * fade;
  fillMat.uniforms.uT.value = t;
  lineMat.uniforms.uOp.value = (1 - 0.72 * sstep(3.5, 4.5, t)) * fade;
  tilt.scale.setScalar(0.88 * (0.9 + 0.1 * grow));

  pts.visible = dis > 0;
  pMat.uniforms.uS.value = dis;
  dMat.uniforms.uP.value = t / DUR;
  bloom.strength = 0.5 + 0.35 * sstep(3.5, 4.6, t);
  composer.render();
};
window.__ready = true;
window.renderAt(0);
