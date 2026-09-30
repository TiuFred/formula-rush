import * as THREE from "three";

const noise = `
float surfaceHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float surfaceNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(surfaceHash(i),surfaceHash(i+vec2(1,0)),f.x),
             mix(surfaceHash(i+vec2(0,1)),surfaceHash(i+vec2(1,1)),f.x),f.y);
}`;

/** Local coordinates keep the carbon attached to moving cars. World coordinates
 * keep weathering continuous across the merged trackside meshes. */
export function detailSurface(material, kind) {
  material.customProgramCacheKey = () => `beta-surface-${kind}-1`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vSurfacePoint;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvSurfacePoint = ${kind === "carbon" ? "position" : "(modelMatrix * vec4(position,1.0)).xyz"};`,
    );
    shader.fragmentShader = `varying vec3 vSurfacePoint;\n${noise}\n${shader.fragmentShader}`;
    const effect = kind === "carbon" ? `
      vec2 weave = vSurfacePoint.xy * 480.0;
      float filterWidth = max(length(fwidth(weave)), 0.001);
      float threads = sin(weave.x + weave.y) * sin(weave.x - weave.y);
      diffuseColor.rgb *= 1.0 + threads * 0.17 * (1.0-smoothstep(0.5,2.0,filterWidth));
    ` : kind === "road" ? `
      float patches = surfaceNoise(vSurfacePoint.xz * 0.105);
      float aggregate = surfaceNoise(vSurfacePoint.xz * 5.7);
      float repairs = smoothstep(.72,.78,surfaceNoise(vSurfacePoint.xz*.035+vec2(7.0,19.0)));
      diffuseColor.rgb *= mix(0.86,1.075,patches) * mix(.94,1.045,aggregate);
      diffuseColor.rgb *= mix(1.0,.82,repairs*.34);
    ` : `
      float weathering = surfaceNoise(vSurfacePoint.xz * 2.8 + vSurfacePoint.y * 3.0);
      float staining = surfaceNoise(vSurfacePoint.xz * 0.28);
      diffuseColor.rgb *= mix(0.79,1.0,weathering) * mix(0.89,1.0,staining);
    `;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>\n${effect}`);
  };
  material.needsUpdate = true;
  return material;
}

export function makeCarbonMaterial() {
  return detailSurface(new THREE.MeshStandardMaterial({ color: "#272c32", roughness: .42, metalness: .28 }), "carbon");
}

export function makeRubberLineMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#17191b", roughness: .78, transparent: true, opacity: .26, depthWrite: false });
  material.customProgramCacheKey = () => "beta-rubber-feathered-1";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float ribbonEdge; varying float vRibbonEdge;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRibbonEdge = ribbonEdge;");
    shader.fragmentShader = `varying float vRibbonEdge;\n${shader.fragmentShader}`
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= smoothstep(0.0,0.32,vRibbonEdge) * smoothstep(0.0,0.32,1.0-vRibbonEdge);");
  };
  return material;
}
