import * as THREE from "three";
import type { RiskId } from "./demo-data";

/** Lightweight scene-local illustrations; no asserted real-world system locations. */
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
    blue = basic(0x4d9fcd, 0.28),
    protection = basic(0x62a787, 0.75),
    ink = basic(0xd6b270, 0.85);
  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1),
    ringGeometry = new THREE.RingGeometry(0.94, 1, 48),
    markerGeometry = new THREE.SphereGeometry(0.07, 8, 6);
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
    const m = new THREE.Mesh(cubeGeometry, material);
    m.position.set(...(position as [number, number, number]));
    m.scale.set(...(scale as [number, number, number]));
    group.add(m);
    return m;
  };
  const ring = (
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    radius: number,
    material: THREE.Material,
  ) => {
    const m = new THREE.Mesh(ringGeometry, material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.scale.setScalar(radius);
    group.add(m);
    return m;
  };
  // Rooftop and clerestory survey follow E7's actual modeled footprint.
  line(
    layers.roof,
    [
      [-5.9, 7.95, 2.7],
      [5.9, 7.95, 2.7],
      [5.9, 7.95, -1.9],
      [-5.9, 7.95, -1.9],
      [-5.9, 7.95, 2.7],
    ],
    0xc5a16d,
  );
  for (const x of [-3, -0.7, 1.6]) {
    ring(layers.roof, x, 8.77, -0.1, 0.43, amber);
    line(
      layers.roof,
      [
        [x, 8.8, -0.1],
        [x, 9.2, -0.1],
      ],
      0xc69246,
      0.55,
    );
  }
  const roofPass = box(layers.roof, [0, 8.8, 0], [11.7, 0.012, 0.1], amber);
  const assembly = new THREE.Group();
  scene.add(assembly);
  box(
    assembly,
    [0, 8.5, 0.4],
    [11.4, 0.1, 4.2],
    new THREE.MeshStandardMaterial({ color: 0x9d906e, roughness: 0.95 }),
  );
  box(
    assembly,
    [0, 9.05, 0.4],
    [11.4, 0.055, 4.2],
    new THREE.MeshStandardMaterial({
      color: 0x6b7476,
      roughness: 0.65,
      metalness: 0.35,
    }),
  );
  const assemblyLines = line(
    assembly,
    [
      [-5.7, 7.7, 2.5],
      [-5.7, 11.1, 2.5],
      [5.7, 11.1, 2.5],
    ],
    0x8b969d,
    0.55,
  );
  assembly.visible = false;
  // The right-hand paved campus area is a hypothetical accumulation surface, not a river.
  const waterGeometry = new THREE.PlaneGeometry(1, 5.2, 1, 16);
  waterGeometry.rotateX(-Math.PI / 2);
  const waterSurface = new THREE.Mesh(waterGeometry, blue);
  waterSurface.position.set(8.4, 0.22, 0.9);
  layers.flood.add(waterSurface);
  const waterEdges = Array.from({ length: 3 }, () =>
    line(
      layers.flood,
      [
        [0, 0.25, -1.7],
        [0, 0.25, 3.5],
      ],
      0x7ec7e0,
      0.55,
    ),
  );
  line(
    layers.flood,
    [
      [10, 0.2, 2.5],
      [10, 1.8, 2.5],
    ],
    0x568fb0,
  );
  for (let i = 0; i < 7; i++)
    line(
      layers.flood,
      [
        [9.9, 0.2 + i * 0.22, 2.5],
        [10.15, 0.2 + i * 0.22, 2.5],
      ],
      0x568fb0,
      0.7,
    );
  const levelIndicator = box(
    layers.flood,
    [10, 0.21, 2.5],
    [0.4, 0.045, 0.045],
    basic(0x286e9c),
  );
  // A multi-storey riser and branch lines explain what evidence Astra would request.
  const route = new THREE.CatmullRomCurve3(
    [
      [6.7, 0.35, 2.6],
      [4.8, 0.35, 2.1],
      [4.8, 6.7, 2.1],
      [-4.5, 6.7, 2.1],
    ].map((p) => new THREE.Vector3(...(p as [number, number, number]))),
    false,
    "catmullrom",
    0.04,
  );
  layers.fire.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(route, 48, 0.027, 5, false),
      protection,
    ),
  );
  const sprinklerHeads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      protection,
      28,
    ),
    matrix = new THREE.Matrix4();
  let index = 0;
  for (let level = 0; level < 7; level++) {
    const y = 0.98 + level * 1.04;
    line(
      layers.fire,
      [
        [-4.5, y, 0.4],
        [4.8, y, 0.4],
        [4.8, y, 2.1],
      ],
      0x72b198,
      0.65,
    );
    for (const x of [-4, -1.5, 1, 3.5]) {
      matrix.makeTranslation(x, y, 0.4);
      sprinklerHeads.setMatrixAt(index++, matrix);
    }
  }
  layers.fire.add(sprinklerHeads);
  const hydrantRing = ring(layers.fire, 6.7, 0.28, 2.6, 0.65, protection),
    feedPulse = new THREE.Mesh(markerGeometry, basic(0xd8f5e9));
  layers.fire.add(feedPulse);
  // Connected-campus review follows bridges and the atrium instead of inventing a warehouse.
  const linkPoints = [
    [-11.3, 3.48, 2.95],
    [-8, 3.48, 2.95],
    [-5.3, 3.48, 2.95],
    [-4.5, 3.48, 2.91],
    [-3.65, 3.48, 2.6],
  ];
  const bridgeLine = line(layers.hazards, linkPoints, 0xdba762);
  const hazardPlane = box(
    layers.hazards,
    [0, 4, -3],
    [11.6, 7.5, 0.028],
    basic(0xcf964f, 0.12),
  );
  // Structural tracing uses the seven-level grid.
  for (const x of [-5.4, -1.8, 1.8, 5.4])
    line(
      layers.construction,
      [
        [x, 0.32, 2.15],
        [x, 7.6, 2.15],
        [x, 7.6, -1.35],
        [x, 0.32, -1.35],
      ],
      0x6d96a6,
      0.8,
    );
  for (let level = 1; level < 8; level++) {
    const y = 0.32 + level * 1.04;
    line(
      layers.construction,
      [
        [-5.4, y, 2.15],
        [5.4, y, 2.15],
        [5.4, y, -1.35],
        [-5.4, y, -1.35],
      ],
      0x6d96a6,
      0.6,
    );
  }
  // Academic circulation follows the modeled lobby and red feature stairs.
  const operationRoute = new THREE.CatmullRomCurve3(
    [
      [5.8, 0.5, -3],
      [2.5, 0.5, -3],
      [-1.3, 0.5, -3.34],
      [1.3, 1.45, -3.34],
      [-1.3, 2.5, -3.34],
      [1.3, 3.54, -3.34],
    ].map((p) => new THREE.Vector3(...(p as [number, number, number]))),
    false,
    "catmullrom",
    0.05,
  );
  const operationLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(operationRoute.getPoints(60)),
    new THREE.LineDashedMaterial({
      color: 0xd8b27a,
      dashSize: 0.13,
      gapSize: 0.11,
      transparent: true,
      opacity: 0.8,
    }),
  );
  operationLine.computeLineDistances();
  layers.business.add(operationLine);
  const operationPulse = new THREE.Mesh(markerGeometry, ink);
  layers.business.add(operationPulse);
  const cells = new THREE.InstancedMesh(cubeGeometry, basic(0xba965f, 0.15), 4);
  for (const [i, x] of [-4.25, -2.4, 2.4, 4.25].entries()) {
    matrix.compose(
      new THREE.Vector3(x, 0.42, 0.75),
      new THREE.Quaternion(),
      new THREE.Vector3(1.4, 0.035, 1.15),
    );
    cells.setMatrixAt(i, matrix);
  }
  layers.business.add(cells);
  line(
    layers.claims,
    [
      [-8.1, 0.32, -3.7],
      [-8.1, 0.32, 0.7],
    ],
    0x8babb0,
    0.7,
  );
  const claimTicks = Array.from({ length: 5 }, (_, i) => {
    ring(layers.claims, -8.1, 0.25, -3.7 + i * 1.1, 0.23, protection);
    return box(
      layers.claims,
      [-8.1, 0.5, -3.7 + i * 1.1],
      [0.36, 0.28, 0.1],
      protection,
    );
  });
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
      assembly.position.y = 7.7 * (1 - transition);
      assemblyLines.visible = transition > 0.9;
      const phase = reduced ? 0.6 : time;
      if (id === "roof") roofPass.position.z = 2.5 - ((phase * 0.24) % 1) * 4.2;
      if (id === "flood") {
        const extent = 1 + waterLevel * 4.2;
        waterSurface.scale.x = extent;
        waterSurface.position.x = 10.1 - extent / 2;
        waterSurface.position.y = 0.22 + waterLevel * 0.75;
        levelIndicator.position.y = waterSurface.position.y;
        waterEdges.forEach((edge, i) => {
          edge.position.x = 10.1 - ((phase * 0.12 + i / 3) % 1) * extent;
          edge.position.y = waterLevel * 0.75;
        });
      }
      if (id === "fire") {
        feedPulse.position.copy(
          route.getPointAt((phase * 0.16) % 1, flowPosition),
        );
        hydrantRing.scale.setScalar(0.5 + ((phase * 0.5) % 1) * 0.8);
      }
      if (id === "business")
        operationPulse.position.copy(
          operationRoute.getPointAt((phase * 0.12) % 1, flowPosition),
        );
      if (id === "claims")
        claimTicks.forEach(
          (tick, i) =>
            (tick.scale.y = reduced
              ? 0.28
              : 0.2 + Math.max(0, Math.sin(phase * 1.5 - i * 0.5)) * 0.22),
        );
      if (id === "hazards") {
        (hazardPlane.material as THREE.MeshBasicMaterial).opacity = reduced
          ? 0.12
          : 0.1 + Math.sin(phase * 2) * 0.025;
        (bridgeLine.material as THREE.LineBasicMaterial).opacity = reduced
          ? 0.8
          : 0.7 + Math.sin(phase * 2) * 0.15;
      }
    },
  };
}
