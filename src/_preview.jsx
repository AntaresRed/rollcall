import { createRoot } from "react-dom/client";
import "./styles.css";
import TuckShops from "./screens/TuckShops";
Object.defineProperty(navigator, "userAgent", {
  get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  configurable: true,
});
createRoot(document.getElementById("root")).render(
  <div className="shell"><TuckShops /></div>
);
