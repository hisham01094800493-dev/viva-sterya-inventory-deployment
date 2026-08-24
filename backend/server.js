import "dotenv/config";
import { startServer } from "./dist/app.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);

startServer(port).catch((error) => {
  console.error("[Startup] Unable to start Smart Inventory API", error);
  process.exit(1);
});
