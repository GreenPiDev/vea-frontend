import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArtworkErrorBoundary } from "./ArtworkErrorBoundary";

function Bomb(): never {
  throw new Error("texture load failed");
}

describe("ArtworkErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <ArtworkErrorBoundary artworkId="a1">
        <div>fine</div>
      </ArtworkErrorBoundary>
    );

    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("swallows a render error from one artwork instead of propagating it", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(
      <ArtworkErrorBoundary artworkId="a1">
        <Bomb />
      </ArtworkErrorBoundary>
    );

    expect(container).toBeEmptyDOMElement();
    consoleError.mockRestore();
  });

  it("keeps sibling boundaries independent — one artwork's failure doesn't affect another's", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <>
        <ArtworkErrorBoundary artworkId="broken">
          <Bomb />
        </ArtworkErrorBoundary>
        <ArtworkErrorBoundary artworkId="ok">
          <div>still here</div>
        </ArtworkErrorBoundary>
      </>
    );

    expect(screen.getByText("still here")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
