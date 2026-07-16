const express = require("express");
const app = express();

app.get("/", (req, res) => {
  console.log(`\x1b[33m[TARGET]\x1b[0m STEP 5a → Got request at / from client tunnel`);
  res.send("Yo Chat!");
});
app.get("/api", (req, res) => {
  console.log(`\x1b[33m[TARGET]\x1b[0m STEP 5a → Got request at /api from client tunnel`);
  res.json({ status: "success", handledBy: process.pid });
});

app.listen(3000, () => console.log("[Target] Running on port 3000"));
