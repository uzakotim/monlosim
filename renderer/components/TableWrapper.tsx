import { useEffect, useState } from "react";

export default function ScaledTableWrapper({ children }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const baseWidth = 550; // Your desired "full-size" table width
      const currentWidth = window.innerWidth;

      const newScale = Math.min(currentWidth / baseWidth, 1);
      setScale(newScale);
    }

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "top center",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}