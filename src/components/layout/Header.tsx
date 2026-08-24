import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import AuthBar from "../auth/AuthBar";

interface HeaderProps {
  /** Scrollable element to watch for show/hide + color transitions. Falls
   * back to `window` when omitted (e.g. a normal document-flow page). */
  scrollTargetRef?: RefObject<HTMLElement | null>;
}

const TOP_THRESHOLD = 8;
const DIRECTION_THRESHOLD = 4;

// Fixed, transparent-at-top header shared across screens. Hides on scroll
// down, slides back in on scroll up, and swaps from transparent to a solid
// "milky coffee" brand tone once the page has scrolled away from the top —
// mirrors the auto-hide nav pattern of most marketing sites.
export default function Header({ scrollTargetRef }: HeaderProps) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const lastYRef = useRef(0);

  useEffect(() => {
    const target: HTMLElement | Window = scrollTargetRef?.current ?? window;
    const getY = () => (target instanceof Window ? target.scrollY : target.scrollTop);

    lastYRef.current = getY();

    const onScroll = () => {
      const y = getY();
      const lastY = lastYRef.current;

      if (y <= TOP_THRESHOLD) {
        setAtTop(true);
        setHidden(false);
      } else {
        setAtTop(false);
        if (y > lastY + DIRECTION_THRESHOLD) setHidden(true);
        else if (y < lastY - DIRECTION_THRESHOLD) setHidden(false);
      }
      lastYRef.current = y;
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scrollTargetRef]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between px-4 transition-all duration-300 sm:px-6 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      } ${atTop ? "bg-transparent" : "bg-brand-200/90 shadow-sm backdrop-blur-md"}`}
    >
      <Link
        to="/home"
        className={`text-lg font-semibold tracking-wide transition-colors duration-300 ${
          atTop ? "text-white" : "text-brand-900"
        }`}
      >
        {t("headerBrandTitle")}
      </Link>
      <AuthBar atTop={atTop} />
    </header>
  );
}
