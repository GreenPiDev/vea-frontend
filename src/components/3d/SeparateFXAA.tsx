import { useEffect, useMemo } from "react";
import { EffectAttribute, FXAAEffect } from "postprocessing";

/**
 * postprocessing's FXAAEffect samples `inputBuffer` (its neighbours) but isn't flagged as a convolution
 * effect, so @react-three/postprocessing merges it into the same EffectPass as ToneMapping/Vignette. Its
 * input is then the raw, linear HDR frame — wherever FXAA finds an edge (texture grain counts) it outputs
 * un-tone-mapped colour, which showed up as pale, washed-out patches on saturated walls. Flagging it as a
 * convolution forces its own pass, after tone mapping, as it should be.
 */
class StandaloneFXAAEffect extends FXAAEffect {
  constructor() {
    super();
    this.setAttributes(this.getAttributes() | EffectAttribute.CONVOLUTION);
  }
}

export default function SeparateFXAA() {
  const effect = useMemo(() => new StandaloneFXAAEffect(), []);
  useEffect(() => () => effect.dispose(), [effect]);
  return <primitive object={effect} dispose={null} />;
}
