import { Component, type ReactNode } from "react";

interface Props {
  artworkId: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Wraps a single Artwork (+ its texture load via useTexture/Suspense) so a
 * bad imageUrl — unreachable, wrong content-type, or missing CORS headers
 * for cross-origin hotlinking (real risk: Artwork.imageUrl is free-text,
 * artists can paste any URL, backend-vea-api doesn't validate reachability)
 * — only drops that one painting instead of throwing all the way up through
 * react-three-fiber's render tree and blanking the entire Canvas/scene for
 * every other artwork and exhibition. One artist's broken image link should
 * never be able to take down someone else's gallery.
 */
export class ArtworkErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[Artwork ${this.props.artworkId}] failed to render:`, error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
