import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../lib/i18n";
import ArtworkLabelModal from "./ArtworkLabelModal";
import type { Artwork } from "./3d/artworks";

const artwork: Artwork = {
  id: "a",
  title: "Yıldızlı Gece",
  artist: "Vincent van Gogh",
  year: "1889",
  exhibitionId: "x",
  image: "/x.jpg",
  aspect: 1.25,
  height: 0.737,
  position: [0, 1.5, 0],
  rotationY: 0,
  technique: "Tuval üzerine yağlı boya",
  heightCm: 73.7,
  widthCm: 92.1,
};

describe("ArtworkLabelModal", () => {
  it("shows the wall label's content: artist, italic title + year, medium, dimensions", () => {
    render(<ArtworkLabelModal artwork={artwork} onClose={() => {}} onShowDetails={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Yıldızlı Gece eser etiketi" })).toBeInTheDocument();
    expect(screen.getByText("Vincent van Gogh")).toBeInTheDocument();
    expect(screen.getByText("Yıldızlı Gece").className).toContain("italic");
    expect(screen.getByText(", 1889")).toBeInTheDocument();
    expect(screen.getByText("Tuval üzerine yağlı boya")).toBeInTheDocument();
    expect(screen.getByText("73,7 × 92,1 cm")).toBeInTheDocument();
  });

  it("leaves out missing fields", () => {
    render(<ArtworkLabelModal artwork={{ ...artwork, year: "", technique: null, heightCm: undefined }} onClose={() => {}} onShowDetails={() => {}} />);
    expect(screen.queryByText(/1889/)).toBeNull();
    expect(screen.queryByText(/cm$/)).toBeNull();
  });

  it("closes on the ✕, the backdrop and Escape, but not on a click inside the card", () => {
    const onClose = vi.fn();
    render(<ArtworkLabelModal artwork={artwork} onClose={onClose} onShowDetails={() => {}} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Etiketi kapat" }));
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("offers the full artwork card", () => {
    const onShowDetails = vi.fn();
    render(<ArtworkLabelModal artwork={artwork} onClose={() => {}} onShowDetails={onShowDetails} />);
    fireEvent.click(screen.getByRole("button", { name: /Eser detayları/ }));
    expect(onShowDetails).toHaveBeenCalledOnce();
  });
});
