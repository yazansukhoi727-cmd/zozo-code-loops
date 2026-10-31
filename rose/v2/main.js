import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const W = 1080, H = 1920, DUR = 6;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mod = (a, b) => a - b * Math.floor(a / b);
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

// ---------- the real function: displayed in the code window AND used to build the mesh ----------
const CODE = `function roseSurface(x, theta) {
  const phi = (PI / 2) * exp(-theta / (8 * PI));
  const q = 1 - mod(3.6 * theta, 2 * PI) / PI;
  const X = 1 - 0.5 * (1.25 * q * q - 0.25) ** 2;
  const y = 1.95653 * x * x * (1.27689 * x - 1) ** 2 * sin(phi);
  const r = X * (x * sin(phi) + y * cos(phi));
  return [r * sin(theta), r * cos(theta),
          X * (x * cos(phi) - y * sin(phi))];
}`;
const roseSurface = new Function('PI', 'exp', 'sin', 'cos', 'mod', CODE + '\nreturn roseSurface;')(Math.PI, Math.exp, Math.sin, Math.cos, mod);

// syntax highlight (VS Code Dark+)
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
document.getElementById('code').innerHTML = CODE.replace(/(function|const|return)|([A-Za-z_]\w*)(?=\()|(\d+\.?\d*)|(PI)|([A-Za-z_]\w*)|([\s\S])/g,
  (m, kw, fn, num, pi, id, other) =>
    kw ? `<span class="k">${kw}</span>` : fn ? `<span class="f">${fn}</span>` : num ? `<span class="n">${num}</span>` :
    pi ? `<span class="c">${pi}</span>` : id ? `<span class="v">${id}</span>` : esc(other));
const hlEl = document.getElementById('hl');
const LH = 31, CODE_TOP = 56;
function hlLine(t) { // phase-synced highlight bar (line index, float) ; same value at t=0 and t=6
  const K = [[0, 0], [2.2, 5.5], [3.6, 7], [4.8, 7], [6, 0]];
  for (let i = 0; i < K.length - 1; i++) if (t <= K[i + 1][0]) {
    const u = sstep(K[i][0], K[i + 1][0], t); return K[i][1] + (K[i + 1][1] - K[i][1]) * (i === 0 ? clamp((t - 0) / 2.2) : u);
  }
  return 0;
}

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
camera.position.set(0, 0, 7.2);

// ---------- rose surface ----------
const NX = 36, NT = 900;
const TH0 = -2 * Math.PI, TH1 = 15 * Math.PI;
const NV = NT * (NX + 1);
const pos = new Float32Array(NV * 3), aX = new Float32Array(NV), aK = new Float32Array(NV);
for (let k = 0; k < NT; k++) {
  const th = TH1 + (TH0 - TH1) * (k / (NT - 1));
  for (let j = 0; j <= NX; j++) {
    const x = j / NX, v = k * (NX + 1) + j;
    pos.set(roseSurface(x, th), v * 3); aX[v] = x; aK[v] = k / (NT - 1);
  }
}
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < NV; i++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[i * 3 + a]); mx[a] = Math.max(mx[a], pos[i * 3 + a]); }
const cen = mn.map((m, a) => (m + mx[a]) / 2);
for (let i = 0; i < NV; i++) for (let a = 0; a < 3; a++) pos[i * 3 + a] -= cen[a];
const ZMIN = mn[2] - cen[2], ZMAX = mx[2] - cen[2];
const O = new THREE.Vector3(-cen[0], -cen[1], -cen[2]); // surface origin = bud centre (all x=0 vertices)

const idx = [];
for (let k = 0; k < NT - 1; k++) for (let j = 0; j < NX; j++) {
  const a = k * (NX + 1) + j, c = a + NX + 1;
  idx.push(a, c, a + 1, a + 1, c, c + 1);
}
const surf = new THREE.BufferGeometry();
surf.setAttribute('position', new THREE.BufferAttribute(pos, 3));
surf.setAttribute('aX', new THREE.BufferAttribute(aX, 1));
surf.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
surf.setIndex(idx); surf.computeVertexNormals();

const LROWS = Math.floor(NT * 0.965);          // drop the flat outer cut edge from the wire (no stray fragments)
const lp = [], cum = [];
for (let k = 0; k < LROWS; k++) {
  if (k % 6 === 0) for (let j = 0; j < NX; j++) { const a = k * (NX + 1) + j; lp.push(a, a + 1); }
  for (let j = 0; j <= NX; j += 4) { const a = k * (NX + 1) + j; lp.push(a, a + NX + 1); }
  cum.push(lp.length);
}
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
lineGeo.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
lineGeo.setIndex(lp);

// ---------- materials ----------
const lineMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uOp: { value: 1 }, uHead: { value: 0 } },
  vertexShader: `attribute float aK; varying float vK; void main(){ vK=aK; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uOp; uniform float uHead; varying float vK;
    void main(){ float age=max(uHead-vK,0.); float b=0.22+0.9*exp(-age*14.);
      gl_FragColor=vec4(vec3(0.66,0.90,1.0)*b,uOp); }`,
});
const fillMat = new THREE.ShaderMaterial({
  transparent: true, side: THREE.DoubleSide, depthWrite: true,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  uniforms: { uT: { value: 0 }, uZ: { value: -9 }, uGlint: { value: -9 }, uFade: { value: 1 }, uExp: { value: 0.8 } },
  vertexShader: `attribute float aX; attribute float aK; varying vec3 vN; varying vec3 vW; varying float vX; varying float vK; varying float vZ;
    void main(){ vX=aX; vK=aK; vZ=position.z; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform float uT,uZ,uGlint,uFade,uExp; varying vec3 vN; varying vec3 vW; varying float vX,vK,vZ;
    vec3 P0=vec3(0.40,0.84,1.0),P1=vec3(1.0,0.55,0.84),P2=vec3(0.58,0.40,1.0),P3=vec3(0.45,0.95,0.82);
    vec3 pal(float f){ f=fract(f)*4.; float i=floor(f); float s=smoothstep(0.,1.,f-i);
      vec3 a=i<1.?P0:(i<2.?P1:(i<3.?P2:P3)); vec3 b=i<1.?P1:(i<2.?P2:(i<3.?P3:P0)); return mix(a,b,s); }
    void main(){
      float rv=(uZ-vZ);                       // sweep front, bottom -> top
      float a=smoothstep(0.,0.18,rv); if(a<=0.001) discard;
      float front=exp(-abs(rv-0.05)*14.)*step(0.,rv);
      vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
      vec3 V=normalize(cameraPosition-vW);
      float ndv=clamp(dot(N,V),0.,1.);
      float fres=pow(1.-ndv,2.0);
      float ph=ndv*1.5+vK*0.9+vX*0.45+uT*0.09;
      vec3 film=pal(ph), film2=pal(ph+0.37+fres*0.4);
      vec3 L=normalize(vec3(-0.4,0.7,0.6));
      float dif=0.40+0.60*clamp(dot(N,L)*0.5+0.5,0.,1.);
      float ao=mix(0.40,1.0,smoothstep(0.0,0.5,vX))*mix(0.55,1.0,smoothstep(0.0,0.35,vK));
      vec3 col=film*dif*ao*0.42+film2*fres*0.55;
      vec3 H=normalize(L+V); col+=pow(clamp(dot(N,H),0.,1.),40.)*0.2;
      float g=vW.x*0.8+vW.y*0.6; float gl=exp(-pow((g-uGlint)*3.2,2.))*(0.35+0.65*fres+0.4*(1.-ndv));
      col+=vec3(1.0,0.96,1.0)*gl*0.35;
      col+=vec3(0.85,0.97,1.)*front*0.6;
      col*=uExp; col=mix(vec3(dot(col,vec3(.33,.45,.22))),col,1.55); gl_FragColor=vec4(col,a*uFade);
    }`,
});

const tilt = new THREE.Group(), spin = new THREE.Group();
tilt.add(spin); scene.add(tilt);
tilt.rotation.x = -0.78; tilt.position.y = 0.28; tilt.scale.setScalar(0.94);
const fillMesh = new THREE.Mesh(surf, fillMat); fillMesh.renderOrder = 1;
const lines = new THREE.LineSegments(lineGeo, lineMat); lines.renderOrder = 2;
spin.add(fillMesh, lines);

// tip / core point (lead of the stroke at start, the collapse point at the end: identical sprite)
const tipGeo = new THREE.BufferGeometry();
tipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
const tipMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  uniforms: { uB: { value: 1 } },
  vertexShader: `void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=38.; }`,
  fragmentShader: `uniform float uB; void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.) discard;
    float core=exp(-r*r*16.), halo=exp(-r*r*6.)*0.3;
    gl_FragColor=vec4(mix(vec3(0.66,0.9,1.),vec3(1.),core)*(core*1.05+halo)*uB,1.); }`,
});
const tip = new THREE.Points(tipGeo, tipMat); tip.frustumCulled = false; tip.renderOrder = 5; spin.add(tip);

// ---------- dissolve particles (spiral + collapse) ----------
const NP = 16000, R = rng(7);
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
  uniforms: { uS: { value: 0 }, uO: { value: O } },
  vertexShader: `uniform float uS; uniform vec3 uO; attribute vec4 aR; varying vec3 vC; varying float vA;
    void main(){
      float e1=smoothstep(0.,0.45,uS);
      float e2=smoothstep(0.42+0.18*aR.x,1.0,uS);
      vec3 d=normalize(position-uO+1e-4)*0.8+(aR.xyz-0.5)*1.6;
      vec3 p=position+d*e1*(0.3+0.6*aR.w)*(1.-e2);
      vec3 q=p-uO;
      float ang=1.2*e1+7.0*e2*(0.6+0.8*aR.y);               // spiral
      float cs=cos(ang), sn=sin(ang);
      q=vec3(cs*q.x-sn*q.y, sn*q.x+cs*q.y, q.z);
      float k=e2*e2*(3.-2.*e2);
      q*=(1.-k);
      vec4 mv=modelViewMatrix*vec4(q+uO,1.);
      gl_Position=projectionMatrix*mv;
      gl_PointSize=(3.0+3.2*aR.w)*(1.+1.5*e2*(1.-e2))*(7.2/-mv.z)*1.5;
      float fin=smoothstep(0.,0.05,uS), fout=1.-smoothstep(0.84,0.97,uS);
      vA=fin*fout*(0.62-0.25*e2);
      vec3 c0=vec3(0.55,0.88,1.0), c1=vec3(1.0,0.62,0.88), c2=vec3(0.65,0.5,1.0);
      vC=aR.z<0.4?mix(c0,c1,aR.z/0.4):mix(c1,c2,(aR.z-0.4)/0.6);
    }`,
  fragmentShader: `varying vec3 vC; varying float vA;
    void main(){ vec2 c=gl_PointCoord-.5; float r=length(c); if(r>.5) discard;
      float a=smoothstep(.5,0.,r); gl_FragColor=vec4(vC*1.25,a*a*vA); }`,
});
const pts = new THREE.Points(pGeo, pMat); pts.frustumCulled = false; spin.add(pts);

// ---------- ribbons (opal light, screen space, loops over 6 s) ----------
const rib = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: { uP: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
  fragmentShader: `uniform float uP; varying vec2 vUv;
    float band(vec2 p, float ang, float off, float sig, float wob, float ph){
      vec2 dir=vec2(cos(ang),sin(ang)), nrm=vec2(-dir.y,dir.x);
      float along=dot(p,dir), d=dot(p,nrm)-off+wob*sin(along*0.0045+ph);
      return exp(-d*d/(2.*sig*sig)); }
    void main(){
      vec2 p=vec2(vUv.x*1080.,(1.-vUv.y)*1920.)-vec2(540.,880.);
      float ph=uP*6.2831853;
      float m=smoothstep(330.,470.,p.y+880.)*(1.-smoothstep(1300.,1430.,p.y+880.));
      vec3 c=vec3(0.);
      c+=vec3(0.30,0.72,1.00)*band(p,0.62,-190.+90.*sin(ph),120.,70.,ph)*0.60;
      c+=vec3(1.00,0.50,0.80)*band(p,0.55, 60.+80.*sin(ph+2.1),140.,90.,ph+1.0)*0.55;
      c+=vec3(0.62,0.42,1.00)*band(p,0.70,260.+70.*sin(ph+4.0),130.,60.,ph+2.0)*0.55;
      c+=vec3(0.35,1.00,0.80)*band(p,0.48,-420.+60.*sin(ph+1.0),100.,50.,ph+3.0)*0.30;
      gl_FragColor=vec4(c*m*0.20,1.);
    }`,
}));
rib.frustumCulled = false; rib.renderOrder = -10; scene.add(rib);

// ---------- dust ----------
const ND = 200, R2 = rng(99);
const dPos = new Float32Array(ND * 3), dR = new Float32Array(ND * 3);
for (let i = 0; i < ND; i++) { dPos.set([(R2() - .5) * 2.6, R2(), (R2() - .5) * 3], i * 3); dR.set([R2(), R2(), R2()], i * 3); }
const dGeo = new THREE.BufferGeometry();
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
dGeo.setAttribute('aR', new THREE.BufferAttribute(dR, 3));
const dust = new THREE.Points(dGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uP: { value: 0 } },
  vertexShader: `uniform float uP; attribute vec3 aR; varying float vA;
    void main(){ float lap=1.+floor(aR.x*2.);
      float y=fract(position.y+uP*lap)*2.6-1.3+0.16;
      float x=position.x+sin(6.2831853*(uP*floor(1.+aR.y*2.)+aR.z))*0.08;
      vec4 mv=modelViewMatrix*vec4(x,y,position.z,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=(1.5+2.0*aR.z)*(7.2/-mv.z)*1.2; vA=0.08+0.16*aR.y; }`,
  fragmentShader: `varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float r=length(c); if(r>.5) discard;
    gl_FragColor=vec4(vec3(0.6,0.8,1.0),smoothstep(.5,0.,r)*vA); }`,
}));
dust.frustumCulled = false; scene.add(dust);

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.2, 0.55, 0.85);
composer.addPass(bloom); composer.addPass(new OutputPass());

// ---------- deterministic timeline ----------
const vAt = (k, j) => { const v = k * (NX + 1) + j; return new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); };
window.renderAt = function (t) {
  t = mod(t, DUR);
  hlEl.style.top = (CODE_TOP + hlLine(t) * LH) + 'px';
  spin.rotation.z = (t - 4.2) * 0.4;

  // 0-2.2 wire trace (starts moving on frame 0), 2.2-3.6 fill sweep bottom->top, 3.6-4.8 hero, 4.8-6 dissolve
  const p = clamp(t / 2.2), grow = Math.sin(p * Math.PI / 2);
  const kHead = grow * (LROWS - 1), k0 = Math.floor(kHead);
  lineGeo.setDrawRange(0, t < 2.2 ? Math.floor((cum[Math.min(k0, LROWS - 1)] || 0) / 2) * 2 : lp.length);
  lineMat.uniforms.uHead.value = t < 2.2 ? kHead / (NT - 1) : 1.2;
  lines.visible = t < 4.0;
  lineMat.uniforms.uOp.value = 1 - 0.85 * sstep(2.2, 3.6, t) - 0.15 * sstep(3.6, 4.0, t);

  const dis = clamp((t - 4.8) / 1.2);
  fillMat.uniforms.uZ.value = t < 2.2 ? -9 : ZMIN - 0.2 + (ZMAX - ZMIN + 0.5) * sstep(2.2, 3.6, t);
  fillMat.uniforms.uT.value = t;
  fillMat.uniforms.uGlint.value = -1.4 + 2.8 * clamp((t - 3.6) / 1.2);
  fillMat.uniforms.uFade.value = 1 - sstep(0.0, 0.35, dis);
  fillMesh.visible = t >= 2.2 && dis < 0.36;

  // tip: leads the stroke, fades once complete; at dissolve end it is the collapse point (== frame 0)
  let b = 0, tp = O;
  if (t < 2.4) {
    const hv = vAt(Math.min(k0, NT - 1), NX).lerp(vAt(Math.min(k0 + 1, NT - 1), NX), kHead - k0);
    tp = O.clone().lerp(hv, sstep(0, 0.06, p)); b = 1 - sstep(2.1, 2.4, t);
  } else if (t > 4.8) { b = sstep(0.72, 1.0, dis); }
  tip.position.copy(tp); tipMat.uniforms.uB.value = b; tip.visible = b > 0;

  pts.visible = dis > 0 && dis < 1;
  pMat.uniforms.uS.value = dis;
  rib.material.uniforms.uP.value = t / DUR;
  dust.material.uniforms.uP.value = t / DUR;
  if(!window.__lock) bloom.strength = 1.2;
  composer.render();
};
Promise.all([document.fonts.load("700 100px Oswald"), document.fonts.load("400 24px JBM")]).then(() => { window.renderAt(0); window.__ready = true; });

