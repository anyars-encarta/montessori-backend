import express from 'express';

const app = express();
const PORT = 8000;

app.get("/", (req, res) => {
  res.send("Montessori Backend server is running!");
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});