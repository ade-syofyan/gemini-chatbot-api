import { GoogleGenAI } from "@google/genai";
import cors from "cors";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ reply: "Message is required" });
  }

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: message,
    });

    if (response && response.text) {
      res.json({ reply: response.text });
    } else {
      res.status(500).json({ reply: "No response from AI" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Something went wrong" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

// async function main() {
//   const response = await ai.models.generateContent({
//     model: "gemini-2.5-flash",
//     contents: "Explain how AI works in a few words",
//   });
//   console.log(response.text);
// }

// await main();
