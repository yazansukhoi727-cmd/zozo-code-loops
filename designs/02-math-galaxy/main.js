import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const W = 1080, H = 1920, DUR = 6, N = 40000;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mod = (a, b) => a - b * Math.floor(a / b);
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const hash = n => { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const gauss = n => (hash(n) + hash(n + 0.1) + hash(n + 0.2) + hash(n + 0.3) - 2) * 1.732;

// the real function: displayed in the code window AND used to place every particle
const CODE = `function galaxyPoint(i) {
  const theta = 0.4 + 4.2 * PI * hash(i) ** 0.5;
  const r = 0.065 * exp(0.2 * theta);
  const a = theta + ((i % 3) * 2 * PI) / 3;
  const s = 0.03 + 0.1 * r;
  return [r * cos(a) + s * gauss(i),
          r * sin(a) + s * gauss(i + 1),
          0.05 * (1.2 - r) * gauss(i + 2)];
}`;
const galaxyPoint = new Function('PI', 'exp', 'cos', 'sin', 'hash', 'gauss', CODE + '\nreturn galaxyPoint;')(Math.PI, Math.exp, Math.cos, Math.sin, hash, gauss);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
document.getElementById('code').innerHTML = CODE.replace(/(function|const|return)|([A-Za-z_]\w*)(?=\()|(\d+\.?\d*)|(PI)|([A-Za-z_]\w*)|([\s\S])/g,
  (m, kw, fn, num, pi, id, other) =>
    kw ? `<span class="k">${kw}</span>` : fn ? `<span class="f">${fn}</span>` : num ? `<span class="n">${num}</span>` :
    pi ? `<span class="c">${pi}</span>` : id ? `<span class="v">${id}</span>` : esc(other));
const hlEl = document.getElementById('hl'), LH = 31, CODE_TOP = 56;
function hlLine(t) {
  const K = [[0, 0], [2, 4], [4, 8], [5, 8], [6, 0]];
  for (let i = 0; i < K.length - 1; i++) if (t <= K[i + 1][0]) {
    const u = i === 0 ? clamp(t / 2) : sstep(K[i][0], K[i + 1][0], t); return K[i][1] + (K[i + 1][1] - K[i][1]) * u;
  }
  return 0;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
camera.position.set(0, 0, 7.2);

// ---------- 40k particles ----------
const R = rng(11);
const aG = new Float32Array(N * 3), aN = new Float32Array(N * 3), aR = new Float32Array(N * 4), aC = new Float32Array(N * 3);
const ICE = [0.55, 0.86, 1.0], LIL = [0.66, 0.50, 1.0], PINK = [1.0, 0.78, 0.90];
for (let i = 0; i < N; i++) {
  const g = galaxyPoint(i); aG.set(g, i * 3);
  const rad = Math.hypot(g[0], g[1]);
  // random-noise burst target: gaussian cloud
  const m = 0.9 + 0.5 * R();
  aN.set([gauss(i * 3 + 500) * 0.75 * m, gauss(i * 3 + 501) * 0.75 * m, gauss(i * 3 + 502) * 0.75 * m], i * 3);
  aR.set([R(), R(), R(), R()], i * 4);
  // colour: core pearl-pink -> lilac -> ice-blue outward, with jitter
  const u = clamp(rad / 1.1 + (R() - 0.5) * 0.35);
  const c = u < 0.3 ? PINK.map((v, k) => v + (LIL[k] - v) * (u / 0.3)) : LIL.map((v, k) => v + (ICE[k] - v) * clamp((u - 0.3) / 0.5));
  aC.set(c, i * 3);
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(aG, 3));
pGeo.setAttribute('aG', new THREE.BufferAttribute(aG, 3));
pGeo.setAttribute('aN', new THREE.BufferAttribute(aN, 3));
pGeo.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
pGeo.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uT: { value: 0 } },
  vertexShader: `uniform float uT; attribute vec3 aG,aN,aC; attribute vec4 aR; varying vec3 vC; varying float vA;
    vec3 rz(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z); }
    void main(){
      float rad=clamp(length(aG.xy)/1.2,0.,1.);
      float tb=clamp(uT/2.,0.,1.), eb=1.-pow(1.-tb,3.);
      float d=0.45*rad+0.2*aR.w;
      float snap=smoothstep(2.0+d,3.35+d,uT);                   // 2-4 s, inner arms first
      vec3 nb=aN*eb+0.14*vec3(sin(uT*3.+aR.x*40.),cos(uT*2.6+aR.y*40.),sin(uT*2.2+aR.z*40.))*eb*(1.-snap);
      float spin=0.45*(uT-4.0);
      float c=smoothstep(5.0,6.0,uT);
      float ang=spin+(1.-snap)*-2.2+6.5*c*(1.15-rad*0.5);          // tightening twist on collapse
      vec3 g=rz(aG,ang)*(1.-c*c*(3.-2.*c)*0.999);
      vec3 p=mix(nb,g,snap);
      p*=1.-c*(1.-snap);
      vec4 mv=modelViewMatrix*vec4(p,1.);
      gl_Position=projectionMatrix*mv;
      gl_PointSize=(2.3+2.6*aR.w*aR.w+0.8*(1.-rad))*(7.2/-mv.z)*1.35;
      vA=smoothstep(0.,0.25,uT)*(1.-smoothstep(5.7,6.0,uT))*(0.26+0.22*(1.-rad)*snap);
      vC=aC*(0.85+0.3*aR.z);
    }`,
  fragmentShader: `varying vec3 vC; varying float vA;
    void main(){ vec2 c=gl_PointCoord-.5; float r=length(c); if(r>.5) discard;
      float a=smoothstep(.5,0.,r); gl_FragColor=vec4(vC*1.3,a*a*vA); }`,
});
const tilt = new THREE.Group(); tilt.add(new THREE.Points(pGeo, pMat)); scene.add(tilt);
tilt.children[0].frustumCulled = false;
tilt.rotation.x = -1.05; tilt.position.y = 0.16; tilt.scale.setScalar(0.87);

// core / single point (same sprite at frame 0 and frame 180)
const tipGeo = new THREE.BufferGeometry();
tipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
const tipMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  uniforms: { uB: { value: 1 } },
  vertexShader: `uniform float uB; void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=44.+90.*(1.-uB)*0.; }`,
  fragmentShader: `uniform float uB; void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.) discard;
    float core=exp(-r*r*16.), halo=exp(-r*r*6.)*0.3;
    gl_FragColor=vec4(mix(vec3(0.66,0.9,1.),vec3(1.),core)*(core*1.05+halo)*uB,1.); }`,
});
const tip = new THREE.Points(tipGeo, tipMat); tip.frustumCulled = false; tilt.add(tip);

// ---------- ribbons + dust (same as v2) ----------
const rib = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false, uniforms: { uP: { value: 0 } },
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
const ND = 200, R2 = rng(99);
const dPos = new Float32Array(ND * 3), dR = new Float32Array(ND * 3);
for (let i = 0; i < ND; i++) { dPos.set([(R2() - .5) * 2.6, R2(), (R2() - .5) * 3], i * 3); dR.set([R2(), R2(), R2()], i * 3); }
const dGeo = new THREE.BufferGeometry();
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
dGeo.setAttribute('aR', new THREE.BufferAttribute(dR, 3));
const dust = new THREE.Points(dGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uP: { value: 0 } },
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

const composer = new EffectComposer(renderer);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.6, 0.72));
composer.addPass(new OutputPass());

window.renderAt = function (t) {
  t = mod(t, DUR);
  hlEl.style.top = (CODE_TOP + hlLine(t) * LH) + 'px';
  pMat.uniforms.uT.value = t;
  // single point: full at frame 0 and again at the end; dimmer core glow in between
  tipMat.uniforms.uB.value = t < 0.5 ? 1 - 0.55 * sstep(0, 0.5, t) : 0.45 + 0.55 * sstep(5.2, 6.0, t);
  rib.material.uniforms.uP.value = t / DUR;
  dust.material.uniforms.uP.value = t / DUR;
  composer.render();
};
Promise.all([document.fonts.load("700 100px Oswald"), document.fonts.load("400 24px JBM")]).then(() => { window.renderAt(0); window.__ready = true; });
