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
  const { message, history } = req.body;

  if (!message || typeof message !== "string") {
    return res
      .status(400)
      .json({ reply: "Message is required and must be a string." });
  }

  try {
    // Buat array awal untuk konten chat
    const chatContent = [];

    // Tambahkan instruksi awal sebagai pesan user (pseudo-system)
    chatContent.push({
      role: "user",
      parts: [
        {
          text: "Gunakan Bahasa Indonesia sebagai default. Namun, jika saya menulis dalam bahasa lain atau memberikan instruksi dalam bahasa lain, tolong balas sesuai dengan bahasa dan instruksi tersebut.",
        },
      ],
    });

    // Tambahkan history jika ada dan valid
    if (Array.isArray(history)) {
      chatContent.push(
        ...history.map((item) => ({
          role: item.sender === "user" ? "user" : "model",
          parts: [{ text: item.text }],
        }))
      );
    }

    // Tambahkan pesan terbaru user
    chatContent.push({
      role: "user",
      parts: [{ text: message }],
    });

    // Kirim permintaan ke Gemini
    const response = await genAI.models.generateContent({
      model: "gemini-1.5-flash",
      contents: chatContent,
    });

    const reply = response?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (reply) {
      res.json({ reply });
    } else {
      res.status(500).json({ reply: "No response from AI" });
    }
  } catch (error) {
    console.error("AI error:", error);
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
