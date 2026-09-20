import sceneAssets from "./scene-assets.json";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DEMO_DURATION, RISK_SIGNALS, type RiskId } from "./demo-data";
import {
  CAMERA_VIEWS,
  INSPECTIONS,
  type CameraCommand,
  type SceneInspection,
} from "./inspection-data";
import { createInvestigationLayers } from "./investigation-layers";

export type SceneState = {
  elapsed: number;
  selected: RiskId | null;
  resetView: number;
  showSignals: boolean;
  reducedMotion: boolean;
  command: CameraCommand;
  inspection: SceneInspection;
  expanded: boolean;
};
type Options = {
  getState: () => SceneState;
  onReady: () => void;
  onFailure: () => void;
  onHover: (id: RiskId | null) => void;
  onSelect: (id: RiskId | null) => void;
  onProject: (
    index: number,
    x: number,
    y: number,
    visible: boolean,
    nodeX: number,
    nodeY: number,
  ) => void;
};
type ModelPart = {
  mesh: THREE.Mesh;
  kind: string;
  baseY: number;
  materials: THREE.MeshStandardMaterial[];
};

export function createPropertyEngine(
  container: HTMLDivElement,
  options: Options,
) {
  let disposed = false,
    failed = false,
    renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    options.onFailure();
    return () => {};
  }
  const canvas = renderer.domElement;
  canvas.setAttribute(
    "aria-label",
    "Interactive 3D property. Drag to orbit, Shift-drag to pan, scroll to zoom. Arrow keys pan; plus and minus zoom; Home resets.",
  );
  canvas.setAttribute("role", "img");
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  let pixelRatio = Math.min(
    window.devicePixelRatio,
    window.innerWidth < 700 ? 1.25 : 1.5,
  );
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 150);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.7;
  controls.minDistance = 9;
  controls.maxDistance = 64;
  controls.minPolarAngle = 0.025;
  controls.maxPolarAngle = 1.49;
  controls.maxTargetRadius = 15;
  controls.cursor.set(0, 1, 0);
  controls.screenSpacePanning = true;
  controls.target.set(0, 2.4, 0);
  const positionFor = (view: {
    yaw: number;
    pitch: number;
    zoom: number;
    target: [number, number, number];
  }) =>
    new THREE.Vector3()
      .setFromSphericalCoords(38 / view.zoom, view.pitch, view.yaw)
      .add(new THREE.Vector3(...view.target));
  camera.position.copy(positionFor(CAMERA_VIEWS.site));
  controls.update();
  canvas.style.touchAction = window.innerWidth < 700 ? "pan-y" : "none";
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.42;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xd4e2df, 0x282d24, 0.85));
  const sun = new THREE.DirectionalLight(0xffead0, 2.7);
  sun.position.set(-8, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -16,
    right: 16,
    top: 16,
    bottom: -16,
    near: 0.1,
    far: 60,
  });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xc2e2dc, 1.45);
  rim.position.set(6, 10, -10);
  scene.add(rim);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.13 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.9;
  ground.receiveShadow = true;
  scene.add(ground);
  const scanPosition = { value: -12 },
    scanStrength = { value: 0 };
  const parts: ModelPart[] = [];
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  const collect = (root: THREE.Object3D) =>
    root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((mat) => materials.add(mat));
      }
    });
  const disposeRoot = (root: THREE.Object3D) => {
    collect(root);
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  };
  let courtyardReflection: THREE.WebGLRenderTarget | null = null;
  let dirty = true;
  const decoder = new DRACOLoader()
    .setDecoderPath({
      js: "/models/draco/draco_wasm_wrapper.js",
      wasm: "/models/draco/draco_decoder.wasm",
    })
    .setWorkerLimit(2);
  new GLTFLoader().setDRACOLoader(decoder).load(
    sceneAssets.model,
    (gltf) => {
      decoder.dispose();
      if (disposed) {
        disposeRoot(gltf.scene);
        return;
      }
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const kind = object.name.split("__")[0];
        object.castShadow = true;
        object.receiveShadow = true;
        const originals = Array.isArray(object.material)
          ? object.material
          : [object.material];
        originals.forEach((mat) => materials.add(mat));
        const own = originals.map((original) => {
          const mat = original.clone() as THREE.MeshStandardMaterial;
          mat.envMapIntensity = 0.7;
          mat.forceSinglePass = true;
          mat.onBeforeCompile = (shader) => {
            shader.uniforms.astraScan = scanPosition;
            shader.uniforms.astraScanStrength = scanStrength;
            shader.vertexShader =
              "varying vec3 vAstraWorld;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nvAstraWorld=(modelMatrix*vec4(transformed,1.0)).xyz;",
            );
            shader.fragmentShader =
              "uniform float astraScan; uniform float astraScanStrength; varying vec3 vAstraWorld;\n" +
              shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <dithering_fragment>",
              "float band=1.0-smoothstep(0.025,0.15,abs(vAstraWorld.x-astraScan)); gl_FragColor.rgb+=vec3(0.18,0.43,0.49)*band*astraScanStrength;\n#include <dithering_fragment>",
            );
          };
          return mat;
        });
        object.material = own.length === 1 ? own[0] : own;
        parts.push({
          mesh: object,
          kind,
          baseY: object.position.y,
          materials: own,
        });
      });
      scene.add(gltf.scene);
      // Capture the courtyard once for the mirror wall; orbiting never re-renders it.
      const reflectiveParts = parts.filter((part) =>
        ["signback", "annexglass"].includes(part.kind),
      );
      if (reflectiveParts.length) {
        const reflectionScene = new THREE.Scene();
        reflectionScene.background = new THREE.Color(0xc9d6d8);
        reflectionScene.environment = environment.texture;
        reflectionScene.environmentIntensity = 0.42;
        const reflectedModel = gltf.scene.clone(true);
        reflectedModel.traverse((object) => {
          if (["signback", "sign", "annexglass"].includes(object.name.split("__")[0]))
            object.visible = false;
        });
        reflectionScene.add(reflectedModel);
        for (const object of scene.children) {
          if (object instanceof THREE.Light) {
            const light = object.clone();
            light.castShadow = false;
            reflectionScene.add(light);
          }
        }
        const capture = new THREE.WebGLCubeRenderTarget(256, {
          type: THREE.HalfFloatType,
        });
        const probe = new THREE.CubeCamera(0.1, 80, capture);
        const filter = new THREE.PMREMGenerator(renderer);
        probe.position.set(8.76, 1.35, -4.20);
        probe.update(renderer, reflectionScene);
        courtyardReflection = filter.fromCubemap(capture.texture);
        for (const part of reflectiveParts)
          for (const mat of part.materials) {
            mat.envMap = courtyardReflection.texture;
            mat.envMapIntensity = part.kind === "signback" ? 0.82 : 0.85;
            mat.needsUpdate = true;
          }
        capture.dispose();
        filter.dispose();
        reflectionScene.clear();
      }
      renderer.shadowMap.needsUpdate = true;
      dirty = true;
      canvas.dataset.loaded = "true";
      options.onReady();
    },
    undefined,
    () => {
      decoder.dispose();
      if (!disposed) {
        failed = true;
        options.onFailure();
      }
    },
  );
  const visual = createInvestigationLayers(scene);
  const scanPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 10),
    new THREE.MeshBasicMaterial({
      color: 0x89babe,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  scanPlane.rotation.y = Math.PI / 2;
  scanPlane.position.y = 4.5;
  scene.add(scanPlane);
  const hitSpecs: [RiskId, number[], number[]][] = [
    ["roof", [0, 7.9, 0.4], [11.7, 1.1, 4.5]],
    ["flood", [8.2, 0.3, 1.5], [3.1, 0.6, 5]],
    ["hazards", [-8.1, 2.8, 2.95], [6.2, 1.3, 1.2]],
    ["fire", [6.7, 0.65, 2.6], [0.75, 1, 0.75]],
    ["construction", [5.85, 4.1, 0.4], [0.22, 7.4, 4.4]],
    ["business", [5.85, 4, -3], [0.25, 7.4, 2.4]],
    ["claims", [-8.2, 0.5, -1.5], [1.4, 1, 4.5]],
  ];
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const hitMeshes = hitSpecs.map(([id, p, s]) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...(s as [number, number, number])),
      hitMaterial,
    );
    mesh.position.set(...(p as [number, number, number]));
    mesh.userData.riskId = id;
    scene.add(mesh);
    return mesh;
  });
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    projected = new THREE.Vector3();
  let width = 1,
    height = 1,
    nodeX = 0,
    nodeY = 0,
    inViewport = true;
  let transition: {
    start: number;
    duration: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;
  let interacted = false,
    lastReset = -1,
    lastCommand = -1,
    lastSelection: RiskId | null = null,
    lastGuide = "",
    lastElapsed = -1,
    lastExpanded = false;
  let frameAccumulator = 0,
    lastUpdate = 0,
    lastWaterInput = -1;
  let lastLayer: RiskId | null = null,
    lastCutaway = false,
    assemblyProgress = 0,
    waterLevel = 0,
    lastTime = 0,
    activeTime = 0,
    frame = 0,
    renderCount = 0,
    lastMetrics = 0;
  let pendingShadow = false,
    slowFrames = 0,
    measuredFrames = 0,
    frameTotal = 0;
  let activePreset = "site";
  const flyTo = (
    view: {
      yaw: number;
      pitch: number;
      zoom: number;
      target: [number, number, number];
    },
    duration = 850,
  ) => {
    controls.update();
    transition = {
      start: performance.now(),
      duration: options.getState().reducedMotion ? 0 : duration,
      from: camera.position.clone(),
      to: positionFor(view),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...view.target),
    };
    dirty = true;
  };
  const resize = () => {
    const root = container.getBoundingClientRect(),
      node = container
        .closest("[data-astra-stage]")
        ?.querySelector("[data-astra-node]");
    if (node) {
      const rect = node.getBoundingClientRect();
      nodeX = rect.left - root.left + rect.width * 0.65;
      nodeY = rect.top - root.top + rect.height * 0.5;
    }
    width = container.clientWidth;
    height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // Keep the complete lot in view at the narrowest aspect ratios.
    camera.fov =
      width / height < 1.22
        ? (2 *
            Math.atan(
              (Math.tan((34 * Math.PI) / 360) * 1.22) / (width / height),
            ) *
            180) /
          Math.PI
        : 34;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  const visibility = new IntersectionObserver((entries) => {
    inViewport = entries[0].isIntersecting;
    dirty = true;
  });
  visibility.observe(container);
  const changed = () => {
    dirty = true;
  };
  const started = () => {
    interacted = true;
    transition = null;
    dirty = true;
  };
  controls.addEventListener("change", changed);
  controls.addEventListener("start", started);
  let downPoint: { x: number; y: number; pointerId: number } | null = null,
    lastHover: RiskId | null = null;
  const findHit = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return (
      (raycaster.intersectObjects(hitMeshes)[0]?.object.userData
        .riskId as RiskId) ?? null
    );
  };
  const down = (event: PointerEvent) => {
    if (event.button === 0)
      downPoint = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
  };
  const move = (event: PointerEvent) => {
    if (event.buttons) return;
    const hit = findHit(event);
    if (hit !== lastHover) {
      lastHover = hit;
      options.onHover(hit);
    }
    canvas.style.cursor = hit ? "pointer" : "grab";
  };
  const up = (event: PointerEvent) => {
    if (
      downPoint &&
      downPoint.pointerId === event.pointerId &&
      Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y) < 5
    ) {
      const id = findHit(event);
      if (id) options.onSelect(id);
    }
    downPoint = null;
  };
  const cancel = () => {
    downPoint = null;
  };
  const leave = () => {
    lastHover = null;
    options.onHover(null);
  };
  const zoom = (factor: number) => {
    transition = null;
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, 9, 64));
    camera.position.copy(controls.target).add(offset);
    controls.update();
    dirty = true;
  };
  const key = (event: KeyboardEvent) => {
    if (
      [
        "+",
        "=",
        "-",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
      ].includes(event.key)
    ) {
      event.preventDefault();
      interacted = true;
      transition = null;
    }
    if (event.key === "+" || event.key === "=") zoom(0.82);
    else if (event.key === "-") zoom(1.22);
    else if (event.key === "Home") {
      activePreset = "site";
      flyTo(CAMERA_VIEWS.site);
    }
    else if (event.key.startsWith("Arrow")) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0),
        up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const pan =
        event.key === "ArrowLeft"
          ? right.multiplyScalar(-0.6)
          : event.key === "ArrowRight"
            ? right.multiplyScalar(0.6)
            : event.key === "ArrowUp"
              ? up.multiplyScalar(0.6)
              : up.multiplyScalar(-0.6);
      controls.target.add(pan);
      camera.position.add(pan);
      controls.update();
    }
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    failed = true;
    options.onFailure();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("keydown", key);
  canvas.addEventListener("webglcontextlost", contextLost);
  const stateDirty = (state: SceneState) =>
    state.elapsed !== lastElapsed ||
    state.selected !== lastSelection ||
    state.command.revision !== lastCommand ||
    state.resetView !== lastReset ||
    state.expanded !== lastExpanded;
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    const rawDelta = (now - lastTime) / 1000;
    lastTime = now;
    if (disposed || failed || !inViewport || document.hidden) return;
    frameAccumulator += rawDelta;
    if (frameAccumulator < 1 / 60) return;
    frameAccumulator %= 1 / 60;
    const updateDelta = lastUpdate ? (now - lastUpdate) / 1000 : 1 / 60;
    lastUpdate = now;
    const dt = Math.min(updateDelta, 0.05),
      state = options.getState();
    if (state.inspection.waterLevel !== lastWaterInput) {
      dirty = true;
      lastWaterInput = state.inspection.waterLevel;
    }
    activeTime += dt;
    if (stateDirty(state)) dirty = true;
    if (state.expanded !== lastExpanded) {
      canvas.style.touchAction = state.expanded
        ? "none"
        : window.innerWidth < 700
          ? "pan-y"
          : "none";
      lastExpanded = state.expanded;
    }
    // The atrium view can look upward from the entrance; exterior views stay above ground.
    controls.maxPolarAngle =
      activePreset === "atrium" && !state.selected ? 1.78 : 1.49;
    const resetting = state.resetView !== lastReset;
    if (resetting) {
      activePreset = "site";
      interacted = false;
      lastGuide = "";
      flyTo(CAMERA_VIEWS.site);
      lastReset = state.resetView;
    }
    const focusInspection = (id: RiskId, open: boolean) => {
      const base = INSPECTIONS[id].view;
      const zoom = state.expanded ? base.zoom : Math.min(base.zoom, 1.25);
      const target: [number, number, number] = [...base.target];
      if (!state.expanded) {
        target[0] += Math.cos(base.yaw) * 2.6;
        target[2] -= Math.sin(base.yaw) * 2.6;
      }
      if (id === "roof" && open) target[1] = 7.1;
      flyTo({
        ...base,
        target,
        zoom,
        pitch: id === "roof" && open ? 0.92 : base.pitch,
      });
    };
    if (state.selected !== lastSelection) {
      if (state.selected) {
        activePreset = "site";
        interacted = true;
        focusInspection(state.selected, state.inspection.cutaway);
      } else flyTo(CAMERA_VIEWS.site);
      lastSelection = state.selected;
    }
    const explicitCameraChange = state.command.revision !== lastCommand;
    if (explicitCameraChange) {
      if (lastCommand !== -1) {
        interacted = !resetting;
        if (state.command.action === "zoom-in") zoom(0.8);
        else if (state.command.action === "zoom-out") zoom(1.25);
        else {
          activePreset = state.command.action;
          flyTo(CAMERA_VIEWS[state.command.action]);
        }
      }
      lastCommand = state.command.revision;
    }
    const guided =
      state.elapsed > 1400 && state.elapsed < 6500 && !state.reducedMotion;
    const guide: RiskId | null = guided
      ? state.elapsed < 3000
        ? "roof"
        : state.elapsed < 4100
          ? "flood"
          : state.elapsed < 5200
            ? "hazards"
            : "construction"
      : null;
    if (!interacted && !state.selected) {
      const key = guide ?? "site";
      if (key !== lastGuide) {
        const base = guide ? INSPECTIONS[guide].view : CAMERA_VIEWS.site;
        flyTo(
          {
            ...base,
            zoom: guide ? Math.min(base.zoom, 1.08) : CAMERA_VIEWS.site.zoom,
          },
          1100,
        );
        lastGuide = key;
      }
    }
    const layer = state.selected ?? (interacted ? null : guide);
    const atriumView = activePreset === "atrium" && !state.selected;
    const cutaway = Boolean(
      atriumView ||
      (state.selected &&
        state.inspection.cutaway &&
        ["roof", "construction", "business", "fire"].includes(
          state.selected,
        )) ||
      (!interacted && guide === "construction"),
    );
    if (layer !== lastLayer || cutaway !== lastCutaway) {
      pendingShadow = true;
      dirty = true;
      lastLayer = layer;
      if (state.selected && lastCutaway !== cutaway && !explicitCameraChange)
        focusInspection(state.selected, cutaway);
      lastCutaway = cutaway;
    }
    let transitioning = false;
    if (transition) {
      const progress =
        transition.duration === 0
          ? 1
          : Math.min(1, (now - transition.start) / transition.duration);
      const ease = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(transition.from, transition.to, ease);
      controls.target.lerpVectors(
        transition.fromTarget,
        transition.toTarget,
        ease,
      );
      if (progress >= 1) transition = null;
      transitioning = true;
    }
    controls.enableDamping = !state.reducedMotion;
    controls.update();
    const damping = state.reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
    const assemblyTarget = cutaway ? 1 : 0;
    assemblyProgress = THREE.MathUtils.lerp(
      assemblyProgress,
      assemblyTarget,
      damping,
    );
    waterLevel = THREE.MathUtils.lerp(
      waterLevel,
      state.selected === "flood" ? state.inspection.waterLevel : 0.25,
      damping,
    );
    let partsMoving = Math.abs(assemblyProgress - assemblyTarget) > 0.001;
    for (const part of parts) {
      let lift = 0,
        opacity =
          ["canopyglass", "atriumglass"].includes(part.kind)
            ? 0.3
            : part.kind === "atriumshell"
              ? 0.3
              : part.kind === "atriumwall"
                ? 0.62
                : 1;
      if (["roof", "atriumroof"].includes(part.kind) && cutaway) {
        lift = state.selected === "roof" ? 3 : 2.6;
        opacity = state.selected === "roof" ? 0.95 : 0.09;
      }
      if (
        ["shell", "atriumshell", "atriumwall", "entrance"].includes(part.kind) &&
        cutaway &&
        state.selected !== "roof"
      )
        opacity = 0.025;
      if (part.kind === "upper" && cutaway && state.selected !== "roof")
        opacity = state.selected === "construction" ? 0.16 : 0.035;
      const targetY = part.baseY + lift;
      const previousY = part.mesh.position.y;
      part.mesh.position.y = THREE.MathUtils.lerp(previousY, targetY, damping);
      if (Math.abs(previousY - targetY) > 0.001) partsMoving = true;
      part.mesh.castShadow = !(
        cutaway &&
        [
          "roof",
          "atriumroof",
          "shell",
          "atriumshell",
          "atriumwall",
          "entrance",
          "upper",
        ].includes(part.kind)
      );
      for (const mat of part.materials) {
        const previous = mat.opacity;
        mat.opacity = THREE.MathUtils.lerp(previous, opacity, damping);
        if (Math.abs(previous - opacity) > 0.002) partsMoving = true;
        const transparent = mat.opacity < 0.998;
        if (mat.transparent !== transparent) {
          mat.transparent = transparent;
          mat.needsUpdate = true;
        }
        mat.depthWrite = mat.opacity > 0.5;
      }
    }
    if (pendingShadow && !partsMoving) {
      renderer.shadowMap.needsUpdate = true;
      pendingShadow = false;
      dirty = true;
    }
    visual.update(
      layer,
      activeTime,
      waterLevel,
      cutaway,
      state.reducedMotion,
      assemblyProgress,
    );
    const scanning =
      state.elapsed > 1300 && state.elapsed < 5500 && !state.reducedMotion;
    scanPosition.value = -10 + ((state.elapsed - 1300) / 4200) * 20;
    scanStrength.value = scanning ? 0.6 : 0;
    scanPlane.visible = scanning;
    scanPlane.position.x = scanPosition.value;
    const animating =
      scanning ||
      Boolean(layer && !state.reducedMotion) ||
      partsMoving ||
      (Math.abs(waterLevel - state.inspection.waterLevel) > 0.002 &&
        layer === "flood");
    if (dirty || transitioning || animating) {
      renderer.render(scene, camera);
      renderCount++;
      for (let index = 0; index < RISK_SIGNALS.length; index++) {
        const signal = RISK_SIGNALS[index];
        projected.set(...signal.position);
        if (signal.id === "roof" && cutaway)
          projected.y += assemblyProgress * 3;
        projected.project(camera);
        options.onProject(
          index,
          (projected.x * 0.5 + 0.5) * 100,
          (-projected.y * 0.5 + 0.5) * 100,
          projected.z < 1 &&
            projected.x > -0.95 &&
            projected.x < 0.95 &&
            projected.y > -0.93 &&
            projected.y < 0.9,
          (nodeX / width) * 100,
          (nodeY / height) * 100,
        );
      }
      if (now - lastMetrics > 500 || !animating || state.reducedMotion) {
        canvas.dataset.drawCalls = String(renderer.info.render.calls);
        canvas.dataset.triangles = String(renderer.info.render.triangles);
        canvas.dataset.renderCount = String(renderCount);
        canvas.dataset.pixelRatio = pixelRatio.toFixed(2);
        canvas.dataset.cameraDistance = camera.position
          .distanceTo(controls.target)
          .toFixed(2);
        canvas.dataset.cameraPosition = camera.position
          .toArray()
          .map((n) => n.toFixed(2))
          .join(",");
        canvas.dataset.inspection = layer ?? "site";
        canvas.dataset.assembly = assemblyProgress.toFixed(2);
        canvas.dataset.waterLevel = waterLevel.toFixed(2);
        lastMetrics = now;
      }
      // Drop resolution, never geometry or interaction, after sustained slow frames.
      if (animating && updateDelta > 0.001 && updateDelta < 0.2) {
        measuredFrames++;
        frameTotal += updateDelta;
        if (updateDelta > 0.026) slowFrames++;
        if (measuredFrames >= 100) {
          if (slowFrames > 65 && pixelRatio > 1) {
            pixelRatio = Math.max(1, pixelRatio - 0.25);
            renderer.setPixelRatio(pixelRatio);
            resize();
          }
          canvas.dataset.frameMs = (
            (frameTotal / measuredFrames) *
            1000
          ).toFixed(1);
          slowFrames = 0;
          measuredFrames = 0;
          frameTotal = 0;
        }
      }
      dirty = false;
    }
    lastElapsed = state.elapsed;
  };
  frame = requestAnimationFrame(draw);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibility.disconnect();
    controls.removeEventListener("change", changed);
    controls.removeEventListener("start", started);
    controls.dispose();
    decoder.dispose();
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("pointerleave", leave);
    canvas.removeEventListener("keydown", key);
    canvas.removeEventListener("webglcontextlost", contextLost);
    disposeRoot(scene);
    courtyardReflection?.dispose();
    environment.dispose();
    sun.shadow.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
