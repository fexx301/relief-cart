import express from "express";
import coreApp from "./src/server/index.js";

// Keep a direct Express import in this recognized entry file so Vercel
// classifies the project as an Express Function instead of a static site.
const app = express();
app.use(coreApp);

export default app;
