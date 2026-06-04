const express = require("express");
const router = express.Router();

router.get("/maintenance", async (req,res) => {
  try {
    const currentTime = new Date();
    const maintenanceStart = new Date("2024-07-01T00:00:00Z");
    const maintenanceEnd = new Date("2024-07-01T06:00:00Z");
  } catch (error) {
    res.status(500).json({ error: "Error checking maintenance status" });
  }

})

router.post("/maintenance", async (req,res) => {
  try {   const { startTime, endTime } = req.body;
} catch (error) {
    res.status(500).json({ error: "Error setting maintenance status" });
}
});

router.put("/maintenance", async (req,res) => {
  try {   const { startTime, endTime } = req.body;
  }
  catch (error) {
    res.status(500).json({ error: "Error updating maintenance status" });
  }
});


module.exports = router;


