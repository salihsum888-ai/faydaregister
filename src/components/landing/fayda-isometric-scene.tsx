'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface FaydaIsometricSceneProps {
  conveyorSpeedMultiplier?: number;
  lightingPreset?: 'sunlit' | 'golden' | 'studio';
}

// Pre-allocated math helpers outside the render loop (Zero GC)
const _targetCamOffset = new THREE.Vector2(0, 0);
const _currentCamOffset = new THREE.Vector2(0, 0);

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x, y + radius);
  shape.lineTo(x, y + height - radius);
  shape.quadraticCurveTo(x, y + height, x + radius, y + height);
  shape.lineTo(x + width - radius, y + height);
  shape.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
  shape.lineTo(x + width, y + radius);
  shape.quadraticCurveTo(x + width, y, x + width - radius, y);
  shape.lineTo(x + radius, y);
  shape.quadraticCurveTo(x, y, x, y + radius);
  return shape;
}

function createArchShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const halfW = width / 2;
  const archRadius = halfW;
  const straightH = Math.max(0.1, height - archRadius);

  shape.moveTo(-halfW, 0);
  shape.lineTo(-halfW, straightH);
  shape.absarc(0, straightH, archRadius, Math.PI, 0, true);
  shape.lineTo(halfW, 0);
  shape.closePath();
  return shape;
}

function createCardboardBoxTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Warm kraft cardboard base
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#E2C399');
  grad.addColorStop(0.5, '#D1AB7A');
  grad.addColorStop(1, '#BE9460');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle paper grain texture
  ctx.fillStyle = 'rgba(90, 58, 28, 0.035)';
  for (let i = 0; i < 1400; i++) {
    const rx = (i * 97) % 512;
    const ry = (i * 53) % 512;
    ctx.fillRect(rx, ry, 3, 2);
  }

  // Clean "fayda" stamp in bottom-left corner matching reference box
  ctx.save();
  ctx.fillStyle = '#4A3520';
  ctx.font = '800 74px "Manrope", sans-serif';
  ctx.fillText('fayda', 42, 438);

  ctx.font = '700 20px "Manrope", sans-serif';
  ctx.fillStyle = 'rgba(74, 53, 32, 0.65)';
  ctx.fillText('RID TRACKING BATCH', 44, 470);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createFaydaSignTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Vibrant magenta-pink signboard background
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#F472B6');
  grad.addColorStop(1, '#DB2777');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Inner recessed border frame
  ctx.strokeStyle = '#FBCFE8';
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, 480, 224);

  // Soft 3D drop shadow under text
  ctx.fillStyle = 'rgba(131, 24, 67, 0.45)';
  ctx.font = '900 122px "Manrope", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('fayda', 262, 136);

  // Crisp white 3D lettering
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('fayda', 256, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCoinFaceTexture(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Brushed silver radial sheen
  const rad = ctx.createRadialGradient(200, 180, 20, 256, 256, 260);
  rad.addColorStop(0, '#FFFFFF');
  rad.addColorStop(0.45, '#E2E8F0');
  rad.addColorStop(0.85, '#CBD5E1');
  rad.addColorStop(1, '#94A3B8');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 512, 512);

  // Outer raised rim circle
  ctx.strokeStyle = '#F8FAFC';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.arc(256, 256, 224, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 256, 206, 0, Math.PI * 2);
  ctx.stroke();

  // Embossed verification checkmark / ID emblem in the center
  ctx.save();
  ctx.translate(256, 256);
  ctx.fillStyle = '#64748B';
  ctx.font = '900 220px "Manrope", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✓', 6, 10);

  ctx.fillStyle = '#F8FAFC';
  ctx.fillText('✓', 0, 2);
  ctx.restore();

  const colorMap = new THREE.CanvasTexture(canvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(canvas);
  bumpMap.anisotropy = maxAnisotropy;

  return { colorMap, bumpMap };
}

export function FaydaIsometricScene({
  conveyorSpeedMultiplier = 1,
  lightingPreset = 'sunlit',
}: FaydaIsometricSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const speedRef = useRef(conveyorSpeedMultiplier);
  const presetRef = useRef(lightingPreset);
  const pulseImpulseRef = useRef(0);

  useEffect(() => {
    speedRef.current = conveyorSpeedMultiplier;
  }, [conveyorSpeedMultiplier]);

  useEffect(() => {
    presetRef.current = lightingPreset;
  }, [lightingPreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#E8EBF5');
    scene.fog = new THREE.FogExp2('#E8EBF5', 0.011);

    // Studio environment map for realistic PBR reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // Responsive camera calculation helper
    const computeCameraFraming = (w: number, h: number) => {
      const isDesktopFullBleed = window.innerWidth >= 1024;
      const asp = w / Math.max(1, h);
      // On desktop full-bleed, shift lookAt left so the 3D hub sits cleanly on the right half
      // On mobile/tablet dedicated stage, center the 3D hub in the stage
      const fSize = isDesktopFullBleed ? 11.8 : asp < 1 ? 13.8 : 11.5;
      const lookX = isDesktopFullBleed ? -1.55 : 0.45;
      const lookY = isDesktopFullBleed ? 1.45 : 1.55;
      const lookZ = isDesktopFullBleed ? 1.15 : 0.35;
      return { asp, fSize, lookX, lookY, lookZ };
    };

    const initialFraming = computeCameraFraming(width, height);
    const camera = new THREE.OrthographicCamera(
      (-initialFraming.fSize * initialFraming.asp) / 2,
      (initialFraming.fSize * initialFraming.asp) / 2,
      initialFraming.fSize / 2,
      -initialFraming.fSize / 2,
      0.1,
      120
    );

    const baseCamPos = new THREE.Vector3(14, 12.5, 14);
    const baseLookAt = new THREE.Vector3(
      initialFraming.lookX,
      initialFraming.lookY,
      initialFraming.lookZ
    );
    camera.position.copy(baseCamPos);
    camera.lookAt(baseLookAt);

    // 2. Three-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight('#F4F6FF', '#C7CEE6', 1.35);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFF3DA', 2.6);
    keyLight.position.set(-8, 16, 10);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 45;
    const d = 14;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#E0E7FF', 0.9);
    rimLight.position.set(12, 8, -10);
    scene.add(rimLight);

    const pinkWindowGlow = new THREE.PointLight('#EC4899', 1.4, 6);
    pinkWindowGlow.position.set(0.3, 2.2, 2.7);
    scene.add(pinkWindowGlow);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // 3. Isometric Rounded Floor Tiles (InstancedMesh)
    const tileShape = createRoundedRectShape(3.65, 3.65, 0.32);
    const tileExtrude = new THREE.ExtrudeGeometry(tileShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 3,
    });
    tileExtrude.rotateX(-Math.PI / 2);

    const tileMaterial = new THREE.MeshStandardMaterial({
      color: '#EEF0F8',
      roughness: 0.45,
      metalness: 0.05,
    });

    const gridRange = 7;
    const totalTiles = (gridRange * 2 + 1) * (gridRange * 2 + 1);
    const tileInstanced = new THREE.InstancedMesh(tileExtrude, tileMaterial, totalTiles);
    tileInstanced.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const tileColor = new THREE.Color();
    let idx = 0;
    const spacing = 3.82;
    for (let gx = -gridRange; gx <= gridRange; gx++) {
      for (let gz = -gridRange; gz <= gridRange; gz++) {
        dummy.position.set(gx * spacing, -0.16, gz * spacing);
        dummy.updateMatrix();
        tileInstanced.setMatrixAt(idx, dummy.matrix);
        const shade = 0.985 + ((Math.abs(gx * 3 + gz * 7) % 5) * 0.006);
        tileColor.setRGB(0.93 * shade, 0.94 * shade, 0.975 * shade);
        tileInstanced.setColorAt(idx, tileColor);
        idx++;
      }
    }
    tileInstanced.instanceMatrix.needsUpdate = true;
    if (tileInstanced.instanceColor) tileInstanced.instanceColor.needsUpdate = true;
    tileInstanced.computeBoundingSphere();
    worldGroup.add(tileInstanced);

    const subFloorGeo = new THREE.PlaneGeometry(80, 80);
    subFloorGeo.rotateX(-Math.PI / 2);
    const subFloorMat = new THREE.MeshBasicMaterial({ color: '#CFD5E8' });
    const subFloor = new THREE.Mesh(subFloorGeo, subFloorMat);
    subFloor.position.y = -0.19;
    worldGroup.add(subFloor);

    // 4. Central Rounded-Cube Fayda Verification Hub Building
    const buildingGroup = new THREE.Group();
    buildingGroup.position.set(1.25, 0, 0.2);
    worldGroup.add(buildingGroup);

    const porcelainWhiteMat = new THREE.MeshPhysicalMaterial({
      color: '#FAF8F6',
      roughness: 0.32,
      metalness: 0.02,
      clearcoat: 0.15,
      clearcoatRoughness: 0.35,
    });

    const warmRecessMat = new THREE.MeshStandardMaterial({
      color: '#F3EFEA',
      roughness: 0.5,
      metalness: 0.02,
    });

    const bWidth = 4.3;
    const bDepth = 4.3;
    const bHeight = 4.25;
    const bodyShape = createRoundedRectShape(bWidth, bDepth, 0.95);
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: bHeight,
      bevelEnabled: true,
      bevelThickness: 0.22,
      bevelSize: 0.2,
      bevelSegments: 8,
    });
    bodyGeo.rotateX(-Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, porcelainWhiteMat);
    bodyMesh.position.y = 0.18;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    buildingGroup.add(bodyMesh);

    const roofRimShape = createRoundedRectShape(bWidth - 0.55, bDepth - 0.55, 0.72);
    const roofInsetGeo = new THREE.ExtrudeGeometry(roofRimShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 4,
    });
    roofInsetGeo.rotateX(-Math.PI / 2);
    const roofInsetMesh = new THREE.Mesh(roofInsetGeo, warmRecessMat);
    roofInsetMesh.position.y = bHeight + 0.28;
    roofInsetMesh.receiveShadow = true;
    buildingGroup.add(roofInsetMesh);

    // 5. Left Face (+Z face): Glowing Pink/Magenta Arched Window + Frame
    const windowGroup = new THREE.Group();
    windowGroup.position.set(0, 1.05, bDepth / 2 + 0.19);
    buildingGroup.add(windowGroup);

    const outerArchShape = createArchShape(1.56, 2.38);
    const innerArchHole = createArchShape(1.28, 2.12);
    innerArchHole.curves.forEach((c) => outerArchShape.holes.push(new THREE.Path(c.getPoints(24))));
    const archFrameGeo = new THREE.ExtrudeGeometry(outerArchShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 4,
    });
    const archFrameMesh = new THREE.Mesh(archFrameGeo, porcelainWhiteMat);
    archFrameMesh.castShadow = true;
    windowGroup.add(archFrameMesh);

    const glassArchShape = createArchShape(1.36, 2.2);
    const glassGeo = new THREE.ShapeGeometry(glassArchShape, 24);
    const pinkGlassMat = new THREE.MeshPhysicalMaterial({
      color: '#EC4899',
      emissive: '#DB2777',
      emissiveIntensity: 0.52,
      roughness: 0.15,
      metalness: 0.05,
      clearcoat: 0.9,
    });
    const glassMesh = new THREE.Mesh(glassGeo, pinkGlassMat);
    glassMesh.position.z = 0.03;
    windowGroup.add(glassMesh);

    const mullionMat = new THREE.MeshStandardMaterial({
      color: '#F472B6',
      roughness: 0.3,
    });
    const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.15, 0.08), mullionMat);
    vMullion.position.set(0, 1.08, 0.05);
    windowGroup.add(vMullion);

    const hMullion = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.06, 0.08), mullionMat);
    hMullion.position.set(0, 1.25, 0.05);
    windowGroup.add(hMullion);

    const sillGeo = new THREE.BoxGeometry(1.72, 0.12, 0.28);
    const sillMesh = new THREE.Mesh(sillGeo, porcelainWhiteMat);
    sillMesh.position.set(0, -0.02, 0.08);
    sillMesh.castShadow = true;
    windowGroup.add(sillMesh);

    // 6. Front-Right Face (+X face): Doorway, Striped Awning & 3D Pink "fayda" Sign
    const storefrontGroup = new THREE.Group();
    storefrontGroup.position.set(bWidth / 2 + 0.18, 0, 0);
    storefrontGroup.rotation.y = Math.PI / 2;
    buildingGroup.add(storefrontGroup);

    const doorArchShape = createArchShape(0.82, 2.15);
    const doorGeo = new THREE.ExtrudeGeometry(doorArchShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
    const doorMat = new THREE.MeshStandardMaterial({
      color: '#D6D1CD',
      roughness: 0.6,
    });
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(0, 0.45, -0.04);
    storefrontGroup.add(doorMesh);

    const awningGroup = new THREE.Group();
    awningGroup.position.set(0, 2.55, 0.05);
    storefrontGroup.add(awningGroup);

    const stripeOrangeMat = new THREE.MeshStandardMaterial({
      color: '#D95326',
      roughness: 0.38,
      metalness: 0.05,
    });
    const stripeWhiteMat = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      roughness: 0.35,
      metalness: 0.05,
    });

    const numStripes = 7;
    const stripeWidth = 0.31;
    const totalAwningW = numStripes * stripeWidth;

    const awningProfile = new THREE.Shape();
    awningProfile.moveTo(0, 0.55);
    awningProfile.quadraticCurveTo(0.45, 0.48, 0.72, 0.0);
    awningProfile.lineTo(0.72, -0.1);
    awningProfile.lineTo(0.58, -0.1);
    awningProfile.quadraticCurveTo(0.35, 0.32, 0, 0.4);
    awningProfile.closePath();

    const stripeGeo = new THREE.ExtrudeGeometry(awningProfile, {
      depth: stripeWidth - 0.005,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.015,
      bevelSegments: 3,
    });
    stripeGeo.rotateY(Math.PI / 2);

    for (let s = 0; s < numStripes; s++) {
      const isOrange = s % 2 === 0;
      const rib = new THREE.Mesh(stripeGeo, isOrange ? stripeOrangeMat : stripeWhiteMat);
      rib.position.x = -totalAwningW / 2 + s * stripeWidth;
      rib.castShadow = true;
      rib.receiveShadow = true;
      awningGroup.add(rib);
    }

    const supportBar = new THREE.Mesh(
      new THREE.BoxGeometry(totalAwningW + 0.1, 0.14, 0.16),
      porcelainWhiteMat
    );
    supportBar.position.set(0, -0.05, 0.06);
    awningGroup.add(supportBar);

    const signTexture = createFaydaSignTexture(maxAniso);
    const signFrameMat = new THREE.MeshStandardMaterial({
      color: '#EC4899',
      roughness: 0.28,
      metalness: 0.08,
    });
    const signFaceMat = new THREE.MeshStandardMaterial({
      map: signTexture,
      roughness: 0.25,
      metalness: 0.05,
    });

    const signBoxGeo = new THREE.BoxGeometry(2.15, 0.92, 0.18);
    const signMesh = new THREE.Mesh(signBoxGeo, [
      signFrameMat,
      signFrameMat,
      signFrameMat,
      signFrameMat,
      signFaceMat,
      signFrameMat,
    ]);
    signMesh.position.set(0, 3.55, 0.14);
    signMesh.castShadow = true;
    storefrontGroup.add(signMesh);

    // 7. Detailed 3D White Slatted Park Bench
    const benchGroup = new THREE.Group();
    benchGroup.position.set(1.22, 0, 3.25);
    worldGroup.add(benchGroup);

    const benchMat = new THREE.MeshStandardMaterial({
      color: '#F8F9FC',
      roughness: 0.35,
      metalness: 0.1,
    });

    for (let s = 0; s < 4; s++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.045, 0.12), benchMat);
      slat.position.set(0, 0.52, -0.18 + s * 0.13);
      slat.castShadow = true;
      slat.receiveShadow = true;
      benchGroup.add(slat);
    }

    for (let b = 0; b < 4; b++) {
      const backSlat = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.11, 0.045), benchMat);
      backSlat.position.set(0, 0.72 + b * 0.14, -0.26 - b * 0.02);
      backSlat.rotation.x = -0.12;
      backSlat.castShadow = true;
      backSlat.receiveShadow = true;
      benchGroup.add(backSlat);
    }

    [-0.98, 0.98].forEach((lx) => {
      const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.54, 0.07), benchMat);
      frontLeg.position.set(lx, 0.27, 0.22);
      frontLeg.rotation.x = 0.08;
      frontLeg.castShadow = true;
      benchGroup.add(frontLeg);

      const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.22, 0.07), benchMat);
      backLeg.position.set(lx, 0.61, -0.24);
      backLeg.rotation.x = -0.1;
      backLeg.castShadow = true;
      benchGroup.add(backLeg);

      const armRest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.56), benchMat);
      armRest.position.set(lx, 0.76, 0.0);
      armRest.castShadow = true;
      benchGroup.add(armRest);

      const armPost = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), benchMat);
      armPost.position.set(lx, 0.63, 0.2);
      armPost.castShadow = true;
      benchGroup.add(armPost);
    });

    // 8. Diagonal Conveyor Track + Animated "fayda" RID Tracking Batches
    const conveyorGroup = new THREE.Group();
    conveyorGroup.position.set(-5.8, 0, -0.55);
    worldGroup.add(conveyorGroup);

    const conveyorTrackLen = 14.5;
    const conveyorBed = new THREE.Mesh(
      new THREE.BoxGeometry(conveyorTrackLen, 0.24, 1.92),
      new THREE.MeshStandardMaterial({
        color: '#E6EAF4',
        roughness: 0.4,
        metalness: 0.05,
      })
    );
    conveyorBed.position.y = 0.12;
    conveyorBed.receiveShadow = true;
    conveyorGroup.add(conveyorBed);

    [-0.98, 0.98].forEach((rz) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(conveyorTrackLen, 0.42, 0.12),
        porcelainWhiteMat
      );
      rail.position.set(0, 0.21, rz);
      rail.castShadow = true;
      rail.receiveShadow = true;
      conveyorGroup.add(rail);
    });

    const boxSideTex = createCardboardBoxTexture(maxAniso);
    const boxSideMat = new THREE.MeshStandardMaterial({
      map: boxSideTex,
      roughness: 0.68,
      metalness: 0.04,
    });
    const boxPlainMat = new THREE.MeshStandardMaterial({
      color: '#D4B083',
      roughness: 0.65,
      metalness: 0.04,
    });
    const boxSeamMat = new THREE.MeshStandardMaterial({
      color: '#3A2614',
      roughness: 0.8,
    });

    const parcelBoxes: THREE.Group[] = [];
    const numParcels = 3;

    for (let p = 0; p < numParcels; p++) {
      const parcel = new THREE.Group();
      const boxGeo = new THREE.BoxGeometry(1.52, 1.48, 1.52);
      const boxMesh = new THREE.Mesh(boxGeo, [
        boxPlainMat,
        boxPlainMat,
        boxPlainMat,
        boxPlainMat,
        boxSideMat,
        boxPlainMat,
      ]);
      boxMesh.position.y = 0.74;
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;
      parcel.add(boxMesh);

      const seamLine = new THREE.Mesh(new THREE.BoxGeometry(1.53, 0.03, 0.04), boxSeamMat);
      seamLine.position.set(0, 1.48, 0);
      parcel.add(seamLine);

      const flapLeft = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 1.51), boxPlainMat);
      flapLeft.position.set(-0.38, 1.49, 0);
      flapLeft.rotation.z = 0.04;
      flapLeft.castShadow = true;
      parcel.add(flapLeft);

      const flapRight = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 1.51), boxPlainMat);
      flapRight.position.set(0.38, 1.49, 0);
      flapRight.rotation.z = -0.04;
      flapRight.castShadow = true;
      parcel.add(flapRight);

      parcel.position.set(-4.5 + p * 4.2, 0.24, 0);
      conveyorGroup.add(parcel);
      parcelBoxes.push(parcel);
    }

    // 9. Animated Floating & Spinning 3D Silver Verification Medallion (Bottom-Right)
    const coinGroup = new THREE.Group();
    coinGroup.position.set(4.55, 1.35, 2.35);
    worldGroup.add(coinGroup);

    const { colorMap: coinColorMap, bumpMap: coinBumpMap } = createCoinFaceTexture(maxAniso);
    const silverEdgeMat = new THREE.MeshPhysicalMaterial({
      color: '#E2E8F0',
      metalness: 0.88,
      roughness: 0.18,
      clearcoat: 0.6,
    });
    const silverFaceMat = new THREE.MeshPhysicalMaterial({
      map: coinColorMap,
      bumpMap: coinBumpMap,
      bumpScale: 0.035,
      metalness: 0.82,
      roughness: 0.22,
      clearcoat: 0.5,
    });

    const coinGeo = new THREE.CylinderGeometry(1.12, 1.12, 0.24, 48);
    const coinMesh = new THREE.Mesh(coinGeo, [silverEdgeMat, silverFaceMat, silverFaceMat]);
    coinMesh.rotation.x = Math.PI / 2;
    coinMesh.castShadow = true;
    coinMesh.receiveShadow = true;
    coinGroup.add(coinMesh);

    coinGroup.rotation.set(0.35, -0.55, -0.45);

    // 10. Pointer Parallax & Click Interaction
    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      _targetCamOffset.set(nx * 0.45, -ny * 0.28);
    };

    const onPointerDown = () => {
      pulseImpulseRef.current = 1.0;
    };

    window.addEventListener('mousemove', onPointerMove, { passive: true });
    container.addEventListener('pointerdown', onPointerDown);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || 400;
      const framing = computeCameraFraming(w, h);

      camera.left = (-framing.fSize * framing.asp) / 2;
      camera.right = (framing.fSize * framing.asp) / 2;
      camera.top = framing.fSize / 2;
      camera.bottom = -framing.fSize / 2;
      camera.updateProjectionMatrix();

      baseLookAt.set(framing.lookX, framing.lookY, framing.lookZ);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null;
    resizeObserver?.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 11. Animation Loop with Software-WebGL Pacing Guard
    const clock = new THREE.Clock();
    let frameId = 0;
    let isDisposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (isDisposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (isDisposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      if (presetRef.current === 'golden') {
        keyLight.color.setHex(0xffe0b2);
        keyLight.intensity = 2.9;
      } else if (presetRef.current === 'studio') {
        keyLight.color.setHex(0xffffff);
        keyLight.intensity = 2.3;
      } else {
        keyLight.color.setHex(0xfff3da);
        keyLight.intensity = 2.6;
      }

      _currentCamOffset.x = THREE.MathUtils.damp(
        _currentCamOffset.x,
        _targetCamOffset.x,
        4,
        delta
      );
      _currentCamOffset.y = THREE.MathUtils.damp(
        _currentCamOffset.y,
        _targetCamOffset.y,
        4,
        delta
      );

      camera.position.set(
        baseCamPos.x + _currentCamOffset.x,
        baseCamPos.y + _currentCamOffset.y,
        baseCamPos.z - _currentCamOffset.x * 0.5
      );
      camera.lookAt(baseLookAt);

      if (pulseImpulseRef.current > 0.001) {
        pulseImpulseRef.current = THREE.MathUtils.damp(pulseImpulseRef.current, 0, 6, delta);
      } else {
        pulseImpulseRef.current = 0;
      }

      const scaleBounce = 1 + pulseImpulseRef.current * 0.045;
      buildingGroup.scale.set(scaleBounce, 1 - pulseImpulseRef.current * 0.03, scaleBounce);

      pinkWindowGlow.intensity = 1.35 + Math.sin(elapsed * 2.2) * 0.25 + pulseImpulseRef.current;

      const beltSpeed = (1.15 + pulseImpulseRef.current * 2.5) * speedRef.current;
      const loopSpan = 12.6;
      for (let i = 0; i < parcelBoxes.length; i++) {
        const box = parcelBoxes[i];
        box.position.x += beltSpeed * delta;
        box.position.y = 0.24 + Math.abs(Math.sin(elapsed * 9 + i)) * 0.015;

        if (box.position.x > 3.6) {
          const t = Math.min(1, (box.position.x - 3.6) / 1.2);
          const s = 1 - t * 0.85;
          box.scale.setScalar(Math.max(0.01, s));
        } else if (box.position.x < -6.2) {
          const t = Math.min(1, (-6.2 - box.position.x) / 1.2);
          const s = 1 - t * 0.85;
          box.scale.setScalar(Math.max(0.01, s));
        } else {
          box.scale.setScalar(1);
        }

        if (box.position.x > 4.8) {
          box.position.x -= loopSpan;
        }
      }

      coinGroup.position.y = 1.35 + Math.sin(elapsed * 2.4) * 0.16;
      coinGroup.rotation.y = -0.55 + Math.sin(elapsed * 1.3) * 0.45 + pulseImpulseRef.current * 2.2;
      coinGroup.rotation.z = -0.45 + Math.cos(elapsed * 1.7) * 0.14;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      container.removeEventListener('pointerdown', onPointerDown);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
      envTexture.dispose();
      boxSideTex.dispose();
      signTexture.dispose();
      coinColorMap.dispose();
      coinBumpMap.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
      aria-label="Interactive 3D Fayda Registration Tracking Hub Scene"
    />
  );
}
