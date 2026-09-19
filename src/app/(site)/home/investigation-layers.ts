import * as THREE from "three";
import type { RiskId } from "./demo-data";

/** Small, reusable meshes communicate the investigation; no particles or postprocessing. */
export function createInvestigationLayers(scene: THREE.Scene) {
  const layers = Object.fromEntries(
    (
      [
        "roof",
        "flood",
        "fire",
        "construction",
        "hazards",
        "business",
        "claims",
      ] as RiskId[]
    ).map((id) => {
      const group = new THREE.Group();
      group.name = `investigation-${id}`;
      group.visible = false;
      scene.add(group);
      return [id, group];
    }),
  ) as Record<RiskId, THREE.Group>;
  const basic = (color: number, opacity = 0.75) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const amber = basic(0xc69246, 0.35),
    blue = basic(0x4d9fcd, 0.25),
    protection = basic(0x62a787, 0.75),
    ink = basic(0xd6b270, 0.85);
  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  const ringGeometry = new THREE.RingGeometry(0.94, 1, 64);
  const markerGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  const line = (
    group: THREE.Group,
    points: number[][],
    color: number,
    opacity = 0.8,
  ) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...(p as [number, number, number]))),
    );
    const result = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    group.add(result);
    return result;
  };
  const box = (
    group: THREE.Group,
    position: number[],
    scale: number[],
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(cubeGeometry, material);
    mesh.position.set(...(position as [number, number, number]));
    mesh.scale.set(...(scale as [number, number, number]));
    group.add(mesh);
    return mesh;
  };
  const ring = (
    group: THREE.Group,
    x: number,
    z: number,
    radius: number,
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.28, z);
    mesh.scale.setScalar(radius);
    group.add(mesh);
    return mesh;
  };

  // Roof survey: measured outline, hatch/patch annotations, and a moving inspection pass.
  line(
    layers.roof,
    [
      [-5.3, 3.96, 1.4],
      [3.3, 3.96, 1.4],
      [3.3, 3.96, -4.4],
      [-5.3, 3.96, -4.4],
      [-5.3, 3.96, 1.4],
    ],
    0xc5a16d,
  );
  for (const [x, z] of [
    [-3.9, -1.1],
    [1.9, -0.1],
    [-3.6, -0.15],
  ]) {
    const mesh = ring(layers.roof, x, z, 0.48, amber);
    mesh.position.y = 3.97;
    line(
      layers.roof,
      [
        [x, 3.98, z],
        [x, 4.8, z],
      ],
      0xc69246,
      0.55,
    );
  }
  const roofPass = box(layers.roof, [-1, 3.97, 0], [8.3, 0.015, 0.12], amber);
  // Roof assembly is geometry, not a translucent duplicate of the entire building.
  const assembly = new THREE.Group();
  scene.add(assembly);
  box(
    assembly,
    [-1, 4.35, -1.5],
    [8.35, 0.12, 5.45],
    new THREE.MeshStandardMaterial({ color: 0x806f53, roughness: 0.95 }),
  );
  box(
    assembly,
    [-1, 4.83, -1.5],
    [8.35, 0.065, 5.45],
    new THREE.MeshStandardMaterial({
      color: 0x666e6e,
      roughness: 0.6,
      metalness: 0.4,
    }),
  );
  const assemblyLines = line(
    assembly,
    [
      [-5.25, 3.55, 1.35],
      [-5.25, 6.9, 1.35],
      [3.25, 6.9, 1.35],
    ],
    0x8b969d,
    0.55,
  );
  assembly.visible = false;
  // Water surface has 65 vertices along its edge. Changing level expands the scenario westward.
  const waterGeometry = new THREE.PlaneGeometry(1, 15.5, 1, 32);
  waterGeometry.rotateX(-Math.PI / 2);
  const waterSurface = new THREE.Mesh(waterGeometry, blue);
  waterSurface.position.set(8.65, 0.21, 0);
  layers.flood.add(waterSurface);
  const waterEdges = [] as THREE.Line[];
  for (let index = 0; index < 4; index++)
    waterEdges.push(
      line(
        layers.flood,
        [
          [7, 0.24, -7.7],
          [7, 0.24, 7.7],
        ],
        0x7ec7e0,
        0.55,
      ),
    );
  const gauge = line(
    layers.flood,
    [
      [9.3, 0.2, 2.4],
      [9.3, 2, 2.4],
    ],
    0x568fb0,
  );
  for (let i = 0; i < 7; i++)
    line(
      layers.flood,
      [
        [9.2, 0.2 + i * 0.25, 2.4],
        [9.5, 0.2 + i * 0.25, 2.4],
      ],
      0x568fb0,
      0.7,
    );
  const levelIndicator = box(
    layers.flood,
    [9.3, 0.21, 2.4],
    [0.5, 0.055, 0.055],
    basic(0x286e9c),
  );
  // Fire protection: trace the hydrant feed and the internal sprinkler distribution.
  const firePath = [
    new THREE.Vector3(1.65, 0.35, 3.27),
    new THREE.Vector3(1.65, 0.35, 1.5),
    new THREE.Vector3(1.65, 2.85, 1.5),
    new THREE.Vector3(1.65, 2.85, -3.7),
    new THREE.Vector3(-4.4, 2.85, -3.7),
  ];
  const route = new THREE.CatmullRomCurve3(firePath, false, "catmullrom", 0.05);
  const fireTube = new THREE.Mesh(
    new THREE.TubeGeometry(route, 48, 0.035, 5, false),
    protection,
  );
  layers.fire.add(fireTube);
  const sprinklerHeads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.085, 8, 6),
    protection,
    18,
  );
  const matrix = new THREE.Matrix4();
  let head = 0;
  for (const z of [-0.6, -1.8, -3]) {
    line(
      layers.fire,
      [
        [-4.4, 2.85, z],
        [2.6, 2.85, z],
      ],
      0x72b198,
      0.65,
    );
    for (const x of [-4, -2.8, -1.6, -0.4, 0.8, 2]) {
      matrix.makeTranslation(x, 2.76, z);
      sprinklerHeads.setMatrixAt(head++, matrix);
    }
  }
  layers.fire.add(sprinklerHeads);
  const hydrantRing = ring(layers.fire, 1.65, 3.27, 0.75, protection);
  const feedPulse = new THREE.Mesh(markerGeometry, basic(0xd8f5e9));
  layers.fire.add(feedPulse);
  // Neighbouring exposure is a separation study, never an animated disaster.
  const hazardPlane = box(
    layers.hazards,
    [4.15, 1.8, -3],
    [0.025, 3.2, 5.3],
    basic(0xcf964f, 0.15),
  );
  const hazardLine = line(
    layers.hazards,
    [
      [3.4, 0.65, -0.9],
      [4.4, 0.65, -0.9],
    ],
    0xdba762,
  );
  for (const x of [3.4, 4.4])
    line(
      layers.hazards,
      [
        [x, 0.5, -0.6],
        [x, 0.5, -1.2],
      ],
      0xdba762,
    );
  line(
    layers.hazards,
    [
      [4.3, 3.4, -1.3],
      [7.9, 3.4, -1.3],
      [7.9, 3.4, -6.7],
      [4.3, 3.4, -6.7],
      [4.3, 3.4, -1.3],
    ],
    0xc99762,
    0.85,
  );
  // A selected structural frame is traced in restrained engineering linework.
  for (const x of [-4.65, -1.9, 0.85, 2.85])
    line(
      layers.construction,
      [
        [x, 0.55, 0.8],
        [x, 3.5, 0.8],
        [x, 3.5, -3.8],
        [x, 0.55, -3.8],
      ],
      0x6d96a6,
      0.85,
    );
  // Workflow paths in the manufacturing floor connect workstations and stock.
  const operationRoute = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-3.6, 0.65, -0.1),
      new THREE.Vector3(-3.6, 0.65, -2.4),
      new THREE.Vector3(-0.9, 0.65, -2.4),
      new THREE.Vector3(1.8, 0.65, -2.4),
    ],
    false,
    "catmullrom",
    0.05,
  );
  const operationLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(operationRoute.getPoints(40)),
    new THREE.LineDashedMaterial({
      color: 0xd8b27a,
      dashSize: 0.15,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.8,
    }),
  );
  operationLine.computeLineDistances();
  layers.business.add(operationLine);
  const operationPulse = new THREE.Mesh(markerGeometry, ink);
  layers.business.add(operationPulse);
  const occupancyCells = new THREE.InstancedMesh(
    cubeGeometry,
    basic(0xba965f, 0.18),
    3,
  );
  for (let i = 0; i < 3; i++) {
    matrix.compose(
      new THREE.Vector3(-3.6 + i * 2.7, 0.55, -2.75),
      new THREE.Quaternion(),
      new THREE.Vector3(1.9, 0.04, 1.3),
    );
    occupancyCells.setMatrixAt(i, matrix);
  }
  layers.business.add(occupancyCells);
  // Five dated records sit on the lot; the corresponding UI provides source excerpts.
  line(
    layers.claims,
    [
      [-7.6, 0.4, -3.5],
      [-7.6, 0.4, 1.5],
    ],
    0x8babb0,
    0.7,
  );
  const claimTicks = [] as THREE.Mesh[];
  for (let i = 0; i < 5; i++) {
    const tick = box(
      layers.claims,
      [-7.6, 0.56, -3.5 + i * 1.25],
      [0.36, 0.28, 0.1],
      basic(0x789e8c, 0.8),
    );
    claimTicks.push(tick);
    const ringMesh = ring(
      layers.claims,
      -7.6,
      -3.5 + i * 1.25,
      0.23,
      protection,
    );
    ringMesh.position.y = 0.27;
  }
  const flowPosition = new THREE.Vector3();
  let lastLayer: RiskId | null = null;
  return {
    layers,
    assembly,
    update(
      id: RiskId | null,
      time: number,
      waterLevel: number,
      exploded: boolean,
      reduced: boolean,
      transition: number,
    ) {
      if (id !== lastLayer) {
        for (const [key, group] of Object.entries(layers))
          group.visible = key === id;
        lastLayer = id;
      }
      assembly.visible = id === "roof" && exploded && transition > 0.01;
      assembly.scale.y = Math.max(0.01, transition);
      assembly.position.y = 3.65 * (1 - transition);
      assemblyLines.visible = transition > 0.9;
      const phase = reduced ? 0.6 : time;
      if (id === "roof") roofPass.position.z = 1.1 - ((phase * 0.24) % 1) * 5.2;
      if (id === "flood") {
        const extent = 1.25 + waterLevel * 5.5;
        waterSurface.scale.x = extent;
        waterSurface.position.x = 9.3 - extent / 2;
        waterSurface.position.y = 0.21 + waterLevel * 0.75;
        levelIndicator.position.y = waterSurface.position.y;
        for (let i = 0; i < 4; i++) {
          const line = waterEdges[i];
          line.position.x = 2.3 - ((phase * 0.12 + i * 0.25) % 1) * extent;
          line.position.y = waterLevel * 0.75 + 0.005;
        }
      }
      if (id === "fire") {
        feedPulse.position.copy(
          route.getPointAt((phase * 0.3) % 1, flowPosition),
        );
        hydrantRing.scale.setScalar(0.6 + ((phase * 0.5) % 1) * 0.8);
      }
      if (id === "business")
        operationPulse.position.copy(
          operationRoute.getPointAt((phase * 0.18) % 1, flowPosition),
        );
      if (id === "claims")
        claimTicks.forEach((tick, i) => {
          tick.scale.y = reduced
            ? 0.28
            : 0.2 + Math.max(0, Math.sin(phase * 1.5 - i * 0.5)) * 0.22;
        });
      // Tiny opacity modulation makes the selected boundary readable without particles.
      if (id === "hazards")
        (hazardPlane.material as THREE.MeshBasicMaterial).opacity = reduced
          ? 0.15
          : 0.12 + Math.sin(phase * 2) * 0.035;
      void gauge;
      void hazardLine;
    },
  };
}
