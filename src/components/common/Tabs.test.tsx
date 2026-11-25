import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Tabs, { TabPanel } from "./Tabs";

type Id = "admins" | "exhibitions" | "artists";

function Harness() {
  const [active, setActive] = useState<Id>("admins");
  return (
    <>
      <Tabs
        idPrefix="t"
        activeId={active}
        onChange={setActive}
        tabs={[
          { id: "admins", label: "Adminler" },
          { id: "exhibitions", label: "Sergiler" },
          { id: "artists", label: "Sanatçılar" },
        ]}
      />
      <TabPanel idPrefix="t" tabId={active}>
        <p>{`panel-${active}`}</p>
      </TabPanel>
    </>
  );
}

describe("Tabs", () => {
  it("switches the panel on click and marks the active tab", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Sanatçılar" }));
    expect(screen.getByText("panel-artists")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sanatçılar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Adminler" })).toHaveAttribute("aria-selected", "false");
  });

  it("links the active tab and its panel for screen readers", () => {
    render(<Harness />);
    const tab = screen.getByRole("tab", { name: "Adminler" });
    const panel = screen.getByRole("tabpanel");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("only the active tab is in the tab order (roving tabindex)", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: "Adminler" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Sergiler" })).toHaveAttribute("tabindex", "-1");
  });

  it("arrow keys move between tabs and wrap around; Home/End jump", () => {
    render(<Harness />);
    const admins = screen.getByRole("tab", { name: "Adminler" });

    fireEvent.keyDown(admins, { key: "ArrowRight" });
    expect(screen.getByText("panel-exhibitions")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sergiler" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Sergiler" }), { key: "End" });
    expect(screen.getByText("panel-artists")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Sanatçılar" }), { key: "ArrowRight" });
    expect(screen.getByText("panel-admins")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Adminler" }), { key: "ArrowLeft" });
    expect(screen.getByText("panel-artists")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Sanatçılar" }), { key: "Home" });
    expect(screen.getByText("panel-admins")).toBeInTheDocument();
  });
});
