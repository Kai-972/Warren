const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Yo Chat!"));
app.get("/api", (req, res) =>
  res.json({ status: "success", handledBy: process.pid })
);

app.listen(3000, () => console.log("[Target] Running on port 3000"));
