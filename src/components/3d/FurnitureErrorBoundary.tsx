import { Component, type ReactNode } from "react";

interface Props {
  modelUrl: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Same reasoning as ArtworkErrorBoundary.tsx, applied to a furniture
 * model's GLTF load: a missing/corrupt .glb (public/furnitures/*.glb) should
 * only drop that one piece of furniture, not blank the entire Canvas for
 * every other room element.
 */
export class FurnitureErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[Furniture ${this.props.modelUrl}] failed to render:`, error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
